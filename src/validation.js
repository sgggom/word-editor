/* 旧关卡与手工编辑的路径校验辅助函数；生成逻辑使用 WTEngine v2。
   规则（与 game.js 一致）：四方向相邻；一条路径不重复用格；每格有使用次数 n，
   每找到一个必答词，路径上每格减一，减到 0 的格子不能再用；额外词不消耗次数；
   必答词顺序不限；必答词全部找到即过关。生成器不放幕布。 */
(function (root) {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash() {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < arguments.length; i++) {
      const s = String(arguments[i]) + '|';
      for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
    }
    return h;
  }
  function nbr(W, H) {
    const out = [];
    for (let i = 0; i < W * H; i++) {
      const r = (i / W) | 0, c = i % W, o = [];
      if (r > 0) o.push(i - W);
      if (r < H - 1) o.push(i + W);
      if (c > 0) o.push(i - 1);
      if (c < W - 1) o.push(i + 1);
      out.push(o);
    }
    return out;
  }
  function turns(p) {
    let t = 0;
    for (let k = 2; k < p.length; k++) if (p[k] - p[k - 1] !== p[k - 1] - p[k - 2]) t++;
    return t;
  }
  function shuffle(a, R) {
    for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* all paths of word on letters, restricted to avail (null = all) */
  function allPaths(letters, NB, word, avail, limit) {
    const N = letters.length, res = [], used = new Uint8Array(N), path = [];
    limit = limit || 5000;
    function dfs(i, k) {
      if (res.length >= limit) return;
      if (used[i] || letters[i] !== word[k] || (avail && !avail[i])) return;
      used[i] = 1; path.push(i);
      if (k === word.length - 1) res.push(path.slice());
      else { const nb = NB[i]; for (let j = 0; j < nb.length; j++) dfs(nb[j], k + 1); }
      used[i] = 0; path.pop();
    }
    for (let s = 0; s < N; s++) dfs(s, 0);
    return res;
  }

  function trieOf(words) {
    const t = {};
    words.forEach(w => { let n = t; for (let k = 0; k < w.length; k++) n = n[w[k]] = n[w[k]] || {}; n.$ = w; });
    return t;
  }
  function scan(letters, NB, trie) {
    const found = new Set(), N = letters.length, used = new Uint8Array(N);
    function dfs(i, node) {
      const nx = node[letters[i]]; if (!nx) return;
      if (nx.$) found.add(nx.$);
      used[i] = 1;
      const nb = NB[i]; for (let j = 0; j < nb.length; j++) if (!used[nb[j]]) dfs(nb[j], nx);
      used[i] = 0;
    }
    for (let i = 0; i < N; i++) dfs(i, trie);
    return found;
  }

  /* Prove consistent path consumption, otherwise exhaust every order/path choice.
     Returns {ok, states, dead, solution, overflow}. dead = reachable states, not finished,
     from which no sequence completes the level (a trap). */
  function exhaustive(letters, NB, words, counts, maxStates) {
    const T = words.length, memo = new Map();
    // If every path of a word consumes the same cells and counts equal their sum,
    // removing any solved word leaves exactly the demand of the remaining words.
    // This proves every order safe without enumerating 2^T subsets for large boards.
    const needed = Array(letters.length).fill(0);
    let consistent = true;
    for (const word of words) {
      const paths = allPaths(letters, NB, word, null, 5000);
      if (!paths.length || paths.length >= 5000) { consistent = false; break; }
      const key = paths[0].slice().sort((a,b) => a-b).join(',');
      if (paths.some(p => p.slice().sort((a,b) => a-b).join(',') !== key)) { consistent = false; break; }
      paths[0].forEach(i => needed[i]++);
    }
    if (consistent && counts.length === needed.length && counts.every((n,i) => n === needed[i])) return {ok:true,states:1,dead:0,overflow:false,method:'consistent-paths'};
    let states = 0, dead = 0, overflow = false;
    const bits = Array.from({length:T},(_,i) => 1n << BigInt(i)), full = (1n << BigInt(T)) - 1n;
    const cnt = counts.slice();
    function moves(mask) {
      const avail = cnt.map(c => c > 0), out = [];
      for (let w = 0; w < T; w++) {
        if (mask & bits[w]) continue;
        const seen = new Set();
        allPaths(letters, NB, words[w], avail, 5000).forEach(p => {
          const sig = p.slice().sort((a, b) => a - b).join(',');
          if (!seen.has(sig)) { seen.add(sig); out.push([w, p]); }
        });
      }
      return out;
    }
    function rec(mask) {
      if (mask === full) return true;
      const key = cnt.join(',') + '|' + mask;
      const m = memo.get(key);
      if (m !== undefined) return m;
      if (++states > maxStates) { overflow = true; throw 0; }
      let ok = false;
      const mv = moves(mask);
      for (let k = 0; k < mv.length; k++) {
        const p = mv[k][1];
        p.forEach(i => cnt[i]--);
        const r = rec(mask | bits[mv[k][0]]);
        p.forEach(i => cnt[i]++);
        if (r) ok = true;           /* keep exploring: we must visit every reachable state */
      }
      if (!ok) dead++;
      memo.set(key, ok);
      return ok;
    }
    let ok = false;
    try { ok = rec(0n); } catch (e) { if (e !== 0) throw e; }
    return { ok: ok && !overflow, states: states, dead: dead, overflow: overflow };
  }

  /* X 与 X+s、X+es，或把 y 换成 ies。以 ss 结尾的不当成 +s。exempt 收的是 -s 那一头。 */
  function pluralPairs(words, exempt) {
    const ex = exempt instanceof Set ? exempt : new Set(exempt || []);
    const set = new Set();
    (words || []).forEach(w => { if (w) set.add(String(w).toUpperCase()); });
    const out = [], seen = new Set();
    set.forEach(W => {
      const bases = [];
      if (W.length >= 4 && W.endsWith('S') && !W.endsWith('SS')) bases.push(W.slice(0, -1));
      if (W.length >= 4 && W.endsWith('ES')) bases.push(W.slice(0, -2));
      if (W.length >= 4 && W.endsWith('IES')) bases.push(W.slice(0, -3) + 'Y');
      bases.forEach(base => {
        if (base.length < 2 || base === W || !set.has(base) || ex.has(W)) return;
        const key = base + '\n' + W;
        if (seen.has(key)) return;
        seen.add(key);
        out.push([base, W]);
      });
    });
    out.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    return out;
  }
  function clashesPlural(word, have, exempt) {
    const W = String(word || '').toUpperCase();
    if (!W) return false;
    const set = have instanceof Set ? have : new Set(have || []);
    return pluralPairs([W].concat([...set]), exempt).some(p => p[0] === W || p[1] === W);
  }

  root.WPGen = { nbr: nbr, exhaustive: exhaustive, pluralPairs: pluralPairs };
})(typeof globalThis !== 'undefined' ? globalThis : this);
