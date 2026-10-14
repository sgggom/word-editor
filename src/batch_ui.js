  /* ---------- 批量生成（WPGen） ---------- */
  const POLICY = JSON.parse($('#policy').textContent);
  let genP = null;
  function genPrep() {
    if (!genP) {
      const rows = lex.graded.map(w => ({ w: w, band: lex.band[w], zipf: w in lex.zipf ? lex.zipf[w] : null, spec: !!lex.spec[w] }));
      genP = WPGen.prepare(rows, lex.valid, POLICY);
    }
    return genP;
  }
  function genSig(d) { return d.letters.join('') + '|' + d.words.slice().sort().join(' '); }
  /* 生成的关保留构造时的使用次数；手改字母或必答后自动失效，回到通用算法。 */
  function analyzeD(d) {
    const An = C.analyze(d);
    if (d.gen && d.gen.sig === genSig(d) && !d.curtains.some(c => c.cells.length)) {
      An.counts = d.gen.n.split('').map(ch => parseInt(ch, 36));
      An.fail = null;
    }
    return An;
  }
  /* 穷举试玩：每一种顺序、每一条路径。没有幕布时可用。 */
  function proveD(d, An) {
    if (!An || !An.counts || d.curtains.some(c => c.cells.length)) return null;
    const key = genSig(d) + '|' + An.counts.join('');
    if (d._proof && d._proof.key === key) return d._proof;
    let r;
    try { r = WPGen.exhaustive(d.letters, WPGen.nbr(d.W, d.H), d.words, An.counts, 60000); }
    catch (e) { r = { overflow: true }; }
    r.key = key;
    Object.defineProperty(d, '_proof', { value: r, enumerable: false, writable: true, configurable: true });
    return r;
  }
  const SIZE_OPTS = [[3, 2], [3, 3], [4, 2], [4, 3], [5, 3], [4, 4], [5, 4]];
  let batchRun = null;
  function openBatch() {
    const box = $('#batch');
    box.hidden = false;
    const startN = campaign.levels.length + 1;
    if (!$('#bFrom').dataset.touched) $('#bFrom').value = startN;
    renderBatchSizes();
    previewCurve();
  }
  function renderBatchSizes() {
    const el = $('#bSizes');
    if (el.children.length) return;
    el.innerHTML = SIZE_OPTS.map(s => {
      const on = (s[0] === 3 && s[1] === 3) || (s[0] === 4 && s[1] === 2) || (s[0] === 4 && s[1] === 3) || (s[0] === 5 && s[1] === 3);
      return `<label class="chk"><input type="checkbox" data-w="${s[0]}" data-h="${s[1]}" ${on ? 'checked' : ''}> ${s[0]}×${s[1]}</label>`;
    }).join('');
  }
  function batchCfg() {
    const num = (id, lo, hi, dv) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dv; };
    const from = Math.round(num('#bFrom', 1, 99999, 1));
    const count = Math.round(num('#bCount', 1, 2000, 50));
    const sizes = [...$('#bSizes').querySelectorAll('input:checked')].map(x => [+x.dataset.w, +x.dataset.h]);
    const ramp = Math.round(num('#bRamp', 1, 5000, 60));
    return {
      seed: String($('#bSeed').value || '1'),
      from: from, count: count, to: from + ramp, rampLen: ramp,
      dStart: num('#bDS', 0, 100, 5) / 100, dEnd: num('#bDE', 0, 100, 80) / 100,
      period: Math.round(num('#bPer', 3, 50, 10)), relief: num('#bRel', 0, 60, 20) / 100,
      sizes: sizes, tries: 80, maxCount: Math.round(num('#bMaxN', 2, 35, 9)), maxStates: 60000,
      mode: $('#bMode').value
    };
  }
  function previewCurve() {
    const cfg = batchCfg();
    const cv = $('#bCurve'), ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = '#d2c2a4'; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    const n = Math.min(cfg.count, 400);
    ctx.beginPath(); ctx.strokeStyle = '#2b2118';
    for (let k = 0; k < n; k++) {
      const d = WPGen.curveAt(cfg.from + k, cfg);
      const x = 4 + (W - 8) * (n === 1 ? 0 : k / (n - 1)), y = H - 4 - (H - 8) * d;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    const t0 = WPGen.targetsFor(WPGen.curveAt(cfg.from, cfg), cfg.sizes.length ? cfg.sizes : [[3, 3]], () => 0.5);
    const t1 = WPGen.targetsFor(WPGen.curveAt(cfg.from + n - 1, cfg), cfg.sizes.length ? cfg.sizes : [[3, 3]], () => 0.5);
    $('#bCurveNote').textContent = '起点约 ' + t0.T + ' 个必答、最长 ' + t0.maxLen + ' 字母；终点约 ' + t1.T + ' 个必答、最长 ' + t1.maxLen + ' 字母。每 ' + cfg.period + ' 关一个峰值，峰后回落。';
  }
  function nearWords(levels, pos, span) {
    const s = new Set();
    for (let j = Math.max(0, pos - span); j < Math.min(levels.length, pos + span); j++) levels[j].words.forEach(w => s.add(w));
    return s;
  }
  function startBatch() {
    const cfg = batchCfg();
    if (!cfg.sizes.length) { toast('至少选一种棋盘尺寸'); return; }
    if (batchRun) return;
    const P = genPrep();
    snapshot();
    const replace = cfg.mode === 'replace';
    const before = replace ? [] : campaign.levels.slice(0, campaign.index + 1);
    const after = replace ? [] : campaign.levels.slice(campaign.index + 1);
    const made = [];
    const rej = {};
    const t0 = performance.now();
    let k = 0, failed = 0, relaxed = 0, states = 0;
    batchRun = { cancel: false };
    $('#bGo').disabled = true; $('#bStop').disabled = false;
    $('#bOut').textContent = '';
    function step() {
      if (batchRun.cancel || k >= cfg.count) return finish();
      const n = cfg.from + k;
      const seq = before.concat(made);
      const ex = nearWords(seq, seq.length, 10);
      nearWords(after, 0, 10 - 0).forEach(w => { if (made.length + 10 >= cfg.count) ex.add(w); });
      const r = WPGen.generateOne(P, n, cfg, ex);
      Object.keys(r.reasons).forEach(x => { rej[x] = (rej[x] || 0) + r.reasons[x]; });
      if (r.level) {
        r.level.id = 'g' + n;
        r.level.name = '生成 ' + n;
        const d = C.fromLevel(r.level);
        d.gen = { sig: genSig(d), n: r.level.n, d: Math.round(r.tg.d * 100), seed: cfg.seed, no: n, states: r.stats.states };
        made.push(d);
        states += r.stats.states;
        if (r.relax) relaxed++;
      } else failed++;
      k++;
      const pct = Math.round(100 * k / cfg.count);
      $('#bBar').style.width = pct + '%';
      $('#bProg').textContent = '第 ' + n + ' 关 · ' + k + ' / ' + cfg.count + ' · ' + ((performance.now() - t0) / 1000).toFixed(1) + ' 秒';
      setTimeout(step, 0);
    }
    function finish() {
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      campaign.levels = before.concat(made, after);
      if (!campaign.levels.length) campaign.levels.push(C.blank(3, 3));
      campaign.index = Math.min(campaign.levels.length - 1, before.length);
      boardKey = ''; suggCache = null; persist(); render();
      const NAMES = { fill: '铺不满棋盘', few: '能用的熟词不够', mix: '长词太多', dup: '重复词', count: '某格次数过高', trap: '有死局（某种走法会卡住）', unsolvable: '无解', big: '局面太多没穷举完', pool: '词池太小' };
      const rejTxt = Object.keys(rej).sort((a, b) => rej[b] - rej[a]).map(x => (NAMES[x] || x) + ' ' + rej[x]).join('，') || '无';
      const sum = { made: made.length, failed: failed, relaxed: relaxed, secs: secs, rej: rej, states: states, cancelled: batchRun.cancel };
      window.__lastBatch = sum;
      $('#bOut').innerHTML = '<p>生成 <b>' + made.length + '</b> 关，用时 ' + secs + ' 秒' + (batchRun.cancel ? '（已中止）' : '') + '。' +
        (failed ? ' <b style="color:var(--bad)">' + failed + ' 关没生成出来</b>（条件太紧，放宽尺寸或难度再试）。' : '') +
        (relaxed ? ' ' + relaxed + ' 关在原难度下没成，自动降一档后才通过。' : '') + '</p>' +
        '<p>每一关都穷举了所有顺序和所有路径（共 ' + states + ' 个局面），0 个死局，最后一个词也一定连得上。</p>' +
        '<p>中途被丢弃重来的草稿：' + esc(rejTxt) + '。</p>' +
        (campaign.levels.length > 40 ? '<p style="color:var(--bad)">关序超过 40 关，浏览器不会自动保存，记得点「保存关序」。</p>' : '');
      batchRun = null;
      $('#bGo').disabled = false; $('#bStop').disabled = true;
      toast('已生成 ' + made.length + ' 关');
    }
    step();
  }
  $('#btnBatch').onclick = openBatch;
  $('#bClose').onclick = () => { $('#batch').hidden = true; };
  $('#bGo').onclick = startBatch;
  $('#bStop').onclick = () => { if (batchRun) batchRun.cancel = true; };
  $('#batch').addEventListener('input', e => { if (e.target.id === 'bFrom') e.target.dataset.touched = 1; previewCurve(); });
  window.__desk = { campaign: () => campaign, exportLevels: () => exportList().out, startBatch: startBatch, cfg: batchCfg };
