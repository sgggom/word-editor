/* Jev 难度打分。Key 只在本地 tools/jev_server.py 里，浏览器不接触。 */
(() => {
'use strict';
const STORE = 'wp.leveldesk.jevUrl';
const DEFAULT_URL = 'http://127.0.0.1:8765';
const TIERN = ['简单', '常见', '稀有', '罕见', '极其罕见'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mem = {};
let apiBase = DEFAULT_URL;

function savedUrl() {
  try {
    const s = localStorage.getItem(STORE);
    if (s && /^https?:\/\//.test(s)) return s.replace(/\/+$/, '');
  } catch (e) {}
  return DEFAULT_URL;
}
function api() { return apiBase.replace(/\/+$/, '') + '/api/jev'; }
function desk() { return window.__desk || null; }
function tierOf(w) {
  const d = desk();
  if (!d || typeof d.tier !== 'function') return null;
  const t = d.tier(w);
  return t == null || t === '' ? null : +t;
}
function ready(d) {
  if (!d || !d.words || !d.words.length) return false;
  if (d.origin === 'zen') return !!((d.zenLetter && d.zenLetter.length) || (d.letters && d.letters.length));
  return !!(d.W > 0 && d.H > 0 && d.letters && d.letters.length === d.W * d.H && d.letters.every(Boolean));
}
function sourceLabel() {
  const d = desk();
  const s = d && d.source ? d.source() : { kind: 'ours', name: '' };
  if (s.kind === 'wt') return s.name || 'Word Tiles';
  if (s.kind === 'zen') return s.name || 'Zen Word';
  return '我们的关卡';
}
function stateOf(d, src) {
  const tw = (d.words || []).slice();
  const ex = (d.extras || []).slice();
  const lens = {};
  tw.forEach(w => { lens[w.length] = (lens[w.length] || 0) + 1; });
  const rare = tw.filter(w => { const t = tierOf(w); return t != null && t >= 3; });
  const words = tw.map(w => {
    const t = tierOf(w);
    return w + '(' + w.length + (t != null ? '·' + (TIERN[t] || '') : '') + ')';
  }).join(', ');
  const curtains = (d.curtains || []).filter(c => c && c.cells && c.cells.length);
  const lines = [];
  if (d.origin === 'zen') {
    const bag = d.zenLetter || (d.letters || []).join('');
    lines.push('Zen Word 一关' + (src ? '，来源：' + src : '') + '。没有棋盘，只有字母袋，不能按字页的上下左右规则试玩。');
    lines.push('字母袋：' + bag + '，共 ' + bag.length + ' 个字母。包内 DifficultyScore ' + (d.zenScore | 0) + '（不是字页的 0–100）。');
  } else {
    const rows = [];
    for (let r = 0; r < d.H; r++) rows.push((d.letters || []).slice(r * d.W, (r + 1) * d.W).join(''));
    lines.push('英语连词游戏（Word Tiles 类）一关' + (src ? '，来源：' + src : '') + '。玩法：在 ' + d.W + '×' + d.H + ' 字母棋盘上上下左右相邻滑动连出单词，每格有使用次数，用完消失；要找全所有必答词才过关。');
    lines.push('棋盘（逐行）：' + rows.join(' / ') + '，共 ' + (d.W * d.H) + ' 格。');
  }
  lines.push('必答词 ' + tw.length + ' 个：' + words + '。');
  lines.push('词长分布：' + Object.keys(lens).sort((a, b) => a - b).map(k => k + '字母×' + lens[k]).join('，') + '；最长 ' + Math.max(0, ...tw.map(w => w.length)) + ' 字母。');
  lines.push('罕见/极其罕见词：' + (rare.length ? rare.join(', ') : '无') + '。其他词（可选，不影响过关）' + ex.length + ' 个' + (ex.length ? '：' + ex.join(', ') : '') + '。');
  lines.push(curtains.length ? '有 ' + curtains.length + ' 块幕布，找到指定数量单词后才揭开。' : '无幕布。');
  lines.push('目标玩家：美英加澳 45 岁以上的休闲女性玩家，手机上玩。');
  return lines.join('\n');
}

async function score(d, src, force) {
  const state = stateOf(d, src);
  if (!force && mem[state]) return mem[state];
  const r = await fetch(api() + '/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: state, force: !!force }) });
  const j = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
  if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
  const a = j.result.answers || {};
  const out = {
    score: j.result.score_expected, top: a.difficulty && a.difficulty.choice, feel: a.feel && a.feel.choice,
    feelConf: a.feel && a.feel.confidence, feelP: a.feel && a.feel.probabilities, stuck: a.stuck && a.stuck.noul,
    tokens: j.result.usage && j.result.usage.input_tokens, cached: j.cached, at: j.at
  };
  mem[state] = out;
  return out;
}
const pct = x => x == null ? '–' : Math.round(x * 100) + '%';
const feelCls = f => ({ '太简单': '#5a8f5a', '刚好': '#3b6ea5', '偏难': '#c27a1d', '太难': '#b23a3a' }[f] || '#555');
function card(r) {
  return '<div class="jev-res"><b>' + (r.score == null ? '–' : r.score) + '</b><span>/10</span>' +
    '<span class="jev-pill" style="background:' + feelCls(r.feel) + '">' + esc(r.feel || '–') + ' ' + pct(r.feelConf) + '</span>' +
    '<span>易卡关概率 ' + pct(r.stuck) + '</span><br><small>最可能档位 ' + esc(r.top || '–') + ' · 输入 ' + (r.tokens == null ? '–' : r.tokens) + ' token' + (r.cached ? ' · 缓存' : '') + '</small></div>';
}

function mount() {
  const host = document.getElementById('jevHost');
  if (!host || document.getElementById('jevBox')) return;
  const st = document.createElement('style');
  st.textContent = '#jevBox{margin-top:12px;padding-top:10px;border-top:1px dashed var(--rule);font-size:13px;line-height:1.5}' +
    '#jevBox h3{margin:0 0 6px;font-size:15px;letter-spacing:.12em}' +
    '#jevBox h3 i{font-style:normal;letter-spacing:0;font-weight:500;color:var(--ink-soft);font-size:12px;margin-left:8px}' +
    '#jevBox input{border:0;border-bottom:1px solid var(--rule);background:transparent;padding:2px 4px;font:inherit}' +
    '#jevBox button{border:1px solid var(--rule);border-radius:3px;padding:3px 8px;font-size:13px;background:rgba(255,250,240,.55)}' +
    '#jevBox button:disabled{opacity:.4;cursor:default}' +
    '#jevUrl{width:min(100%,16em)}' +
    '.jev-res{margin:6px 0}.jev-res b{font-size:22px;font-family:var(--en)}' +
    '.jev-pill{color:#fff;border-radius:10px;padding:1px 8px;margin:0 6px}' +
    '#jevTable{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px}' +
    '#jevTable td,#jevTable th{border-bottom:1px solid var(--rule);padding:2px 4px;text-align:left}' +
    '#jevTableWrap{max-height:220px;overflow:auto}' +
    '#jevOff{color:var(--ink-soft);margin:6px 0}';
  document.head.appendChild(st);
  const box = document.createElement('div');
  box.id = 'jevBox';
  box.innerHTML = '<h3>Jev 难度打分 <i id="jevModel"></i></h3>' +
    '<div><label>本地服务地址 <input id="jevUrl" type="url" spellcheck="false" autocomplete="off"></label> ' +
    '<button type="button" id="jevPing">重新检测</button></div>' +
    '<p id="jevOff" hidden>连不上本地服务。先在自己的电脑上运行 <code>python3 tools/jev_server.py</code>，再点重新检测。用 GitHub Pages（HTTPS）打开时，浏览器可能拦截 http://127.0.0.1，改在本地打开 index.html 即可。</p>' +
    '<div id="jevOn" hidden><button type="button" id="jevOne">给当前关打分</button> <label><input type="checkbox" id="jevForce">不用缓存</label>' +
    '<div id="jevCur"></div>' +
    '<div>批量：<span id="jevSrc"></span> 从第<input id="jevFrom" type="number" min="1" value="1" style="width:4em">关 共<input id="jevN" type="number" min="1" max="200" value="10" style="width:4em">关 ' +
    '<button type="button" id="jevBatch">批量打分</button> <button type="button" id="jevStop" hidden>中止</button> <button type="button" id="jevCsv">导出 CSV</button></div>' +
    '<p id="jevProg"></p>' +
    '<div id="jevTableWrap"><table id="jevTable"><thead><tr><th>关</th><th>必答</th><th>分</th><th>体感</th><th>易卡关</th></tr></thead><tbody></tbody></table></div></div>';
  host.appendChild(box);
  const $ = s => box.querySelector(s);
  apiBase = savedUrl();
  $('#jevUrl').value = apiBase;
  function levels() {
    const d = desk();
    const c = d && d.campaign ? d.campaign() : null;
    return c && c.levels ? c.levels : [];
  }
  function paintSrc() {
    const list = levels();
    const el = $('#jevSrc');
    if (el) el.textContent = sourceLabel() + '（' + list.length + '）';
  }
  async function ping() {
    const raw = ($('#jevUrl').value || '').trim().replace(/\/+$/, '');
    apiBase = /^https?:\/\//.test(raw) ? raw : DEFAULT_URL;
    $('#jevUrl').value = apiBase;
    try { localStorage.setItem(STORE, apiBase); } catch (e) {}
    try {
      const r = await fetch(api() + '/status');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      $('#jevOff').hidden = true;
      $('#jevOn').hidden = false;
      $('#jevModel').textContent = (j.model || '') + (j.ok ? '' : ' · 缺 Key');
      paintSrc();
    } catch (e) {
      $('#jevOff').hidden = false;
      $('#jevOn').hidden = true;
      $('#jevModel').textContent = '';
    }
  }
  $('#jevUrl').addEventListener('change', ping);
  $('#jevPing').onclick = ping;
  $('#jevOne').onclick = async () => {
    const dsk = desk();
    const c = dsk && dsk.campaign ? dsk.campaign() : null;
    const d = c && c.levels ? c.levels[c.index] : null;
    if (!ready(d)) { $('#jevCur').textContent = '这一关还没填完，先补全再打分。'; return; }
    $('#jevCur').textContent = '打分中…';
    try { $('#jevCur').innerHTML = card(await score(d, sourceLabel() + ' 第' + ((c.index || 0) + 1) + '关', $('#jevForce').checked)); }
    catch (e) { $('#jevCur').textContent = '出错：' + e.message; }
  };
  let stop = false, rows = [];
  $('#jevStop').onclick = () => { stop = true; };
  $('#jevBatch').onclick = async () => {
    const all = levels();
    const name = sourceLabel();
    const from = Math.max(1, +$('#jevFrom').value || 1);
    const n = Math.min(200, Math.max(1, +$('#jevN').value || 1));
    const list = all.slice(from - 1, from - 1 + n);
    stop = false; rows = [];
    const tb = $('#jevTable tbody'); tb.innerHTML = '';
    $('#jevStop').hidden = false; $('#jevBatch').disabled = true;
    for (let i = 0; i < list.length && !stop; i++) {
      const no = from + i, lv = list[i];
      $('#jevProg').textContent = name + '：' + (i + 1) + '/' + list.length;
      const tr = document.createElement('tr'); tb.appendChild(tr);
      const nw = (lv.words || []).length;
      try {
        if (!ready(lv)) throw new Error('这一关还没填完');
        const r = await score(lv, name + ' 第' + no + '关', $('#jevForce').checked);
        rows.push({ no: no, name: lv.name || '', n: nw, score: r.score, top: r.top, feel: r.feel, feelConf: r.feelConf, stuck: r.stuck });
        tr.innerHTML = '<td>' + no + '</td><td>' + nw + '</td><td><b>' + r.score + '</b></td><td style="color:' + feelCls(r.feel) + '">' + esc(r.feel) + '</td><td>' + pct(r.stuck) + '</td>';
      } catch (e) {
        tr.innerHTML = '<td>' + no + '</td><td>' + nw + '</td><td colspan="3">出错：' + esc(e.message).slice(0, 120) + '</td>';
      }
    }
    $('#jevProg').textContent += stop ? ' · 已中止' : ' · 完成';
    $('#jevStop').hidden = true; $('#jevBatch').disabled = false;
  };
  $('#jevCsv').onclick = () => {
    if (!rows.length) return;
    const csv = '关号,必答数,难度分(期望),最可能档,体感,体感置信,易卡关概率\n' + rows.map(r => [r.no, r.n, r.score, r.top, r.feel, r.feelConf, r.stuck].join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = 'jev_难度打分.csv';
    a.click();
  };
  window.JevScore = { stateOf: stateOf, score: score, ping: ping, paintSrc: paintSrc };
  ping();
}
window.JevScore = window.JevScore || {};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
})();
