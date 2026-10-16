#!/usr/bin/env python3
"""字页关卡台的 Jev 难度打分本地代理。Key 只留在这台机器上，不进网页。

用法:
  export OPENCODE_API_KEY=…
  python3 tools/jev_server.py
然后在关卡台里填写本地服务地址（默认 http://127.0.0.1:8765）。

Key 查找顺序：环境变量 OPENCODE_API_KEY，其次脚本旁边的 .env，再次 --env 指定的文件。
"""
import argparse, hashlib, json, os, re, sys, threading, time, pathlib, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

HERE = pathlib.Path(__file__).resolve().parent
CACHE_F = pathlib.Path(os.environ.get("JEV_CACHE") or HERE / ".jev_cache.json")
URL = "https://opencode.ai/inference/systemone/v1/systemone"
MODEL = os.environ.get("JEV_MODEL", "jev-1.13-free")
MIN_GAP = float(os.environ.get("JEV_MIN_GAP", "1.5"))

ORIGIN_OK = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")

QUESTIONS = {
    # 免费端点不支持 score 类型（返回 422 Endpoint is unavailable），改用 1-10 十选一的 choice，再按概率算期望分。
    "difficulty": {"type": "choice",
        "instructions": "按量表给这一关对美英加澳 45 岁以上休闲女性玩家的整体难度打分（1-10）。",
        "criteria": {"1": "几乎不用想，几秒全找到", "2": "非常轻松", "3": "轻松，都是常见短词", "4": "略需思考",
                     "5": "中等，要试几次，偶尔卡一下", "6": "中等偏难", "7": "偏难，有较长或不常见的词，多数人要用一次提示",
                     "8": "难，多处卡关", "9": "很难，有生僻长词，很多人卡关", "10": "极难，大部分人放弃"}},
    "feel": {"type": "choice", "instructions": "这一关对这类玩家的体感属于哪一档？",
        "criteria": {"太简单": "毫无挑战，很快就过，容易无聊", "刚好": "有点思考但能顺利完成",
                     "偏难": "明显会卡一下，可能需要提示", "太难": "很可能卡住放弃"}},
    "stuck": {"type": "noul", "instructions": "这类玩家在这一关很可能卡住超过 2 分钟或需要用提示吗？"},
}

def read_env_file(path):
    p = pathlib.Path(path)
    if not p.is_file():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def load_key(env_path):
    if os.environ.get("OPENCODE_API_KEY", "").strip():
        return os.environ["OPENCODE_API_KEY"].strip()
    read_env_file(HERE / ".env")
    if not os.environ.get("OPENCODE_API_KEY", "").strip() and env_path:
        read_env_file(env_path)
    return os.environ.get("OPENCODE_API_KEY", "").strip()

_lock = threading.Lock()
_last = [0.0]
cache = json.loads(CACHE_F.read_text()) if CACHE_F.exists() else {}
KEY = ""

def call_jev(state):
    body = json.dumps({"model": MODEL, "state": state, "questions": QUESTIONS}).encode()
    for attempt in range(4):
        with _lock:
            wait = _last[0] + MIN_GAP - time.time()
            if wait > 0:
                time.sleep(wait)
            _last[0] = time.time()
        req = urllib.request.Request(URL, data=body, method="POST", headers={
            "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "User-Agent": "level-desk-jev/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return 200, json.load(r)
        except urllib.error.HTTPError as e:
            txt = e.read().decode(errors="replace")
            if e.code in (429, 502, 503) and attempt < 3:
                time.sleep(3 * (attempt + 1))
                continue
            return e.code, {"error": txt[:800]}
        except Exception as e:
            if attempt < 3:
                time.sleep(2)
                continue
            return 599, {"error": str(e)}

class H(BaseHTTPRequestHandler):
    def log_message(self, fmt, *a):
        sys.stderr.write("[jev-server] " + (fmt % a) + "\n")

    def _origin(self):
        origin = self.headers.get("Origin", "")
        if origin == "https://sgggom.github.io":
            return origin
        if ORIGIN_OK.match(origin):
            return origin
        return ""

    def _cors(self):
        origin = self._origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self._cors()
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/jev/status":
            return self._json(200, {"ok": bool(KEY), "model": MODEL, "cached": len(cache)})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path != "/api/jev/score":
            return self._json(404, {"error": "not found"})
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except Exception:
            return self._json(400, {"error": "bad json"})
        state = str(req.get("state", "")).strip()[:4000]
        if not state:
            return self._json(400, {"error": "state 为空"})
        if not KEY:
            return self._json(500, {"error": "服务端没有 OPENCODE_API_KEY"})
        ck = hashlib.sha256((MODEL + "\n" + json.dumps(QUESTIONS, sort_keys=True) + "\n" + state).encode()).hexdigest()[:24]
        if ck in cache and not req.get("force"):
            return self._json(200, dict(cache[ck], cached=True))
        code, res = call_jev(state)
        if code != 200:
            return self._json(code if code < 600 else 502, res)
        try:
            pr = res["answers"]["difficulty"]["probabilities"]
            res["score_expected"] = round(sum(int(k) * v for k, v in pr.items()) / (sum(pr.values()) or 1), 1)
        except Exception:
            pass
        out = {"result": res, "model": MODEL, "at": time.strftime("%Y-%m-%d %H:%M:%S")}
        with _lock:
            cache[ck] = out
            CACHE_F.write_text(json.dumps(cache, ensure_ascii=False))
        return self._json(200, dict(out, cached=False))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--env", default="", help="OPENCODE_API_KEY 所在的 .env；环境变量和脚本旁的 .env 优先")
    a = ap.parse_args()
    KEY = load_key(a.env)
    print("Jev 代理: http://%s:%s/api/jev  (模型 %s, key %s)" % (a.host, a.port, MODEL, "已加载" if KEY else "缺失"))
    print("在关卡台填写本地服务地址。这个进程不提供网页。")
    ThreadingHTTPServer((a.host, a.port), H).serve_forever()
