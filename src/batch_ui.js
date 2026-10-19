  /* ---------- 批量生成（WTEngine v2） ---------- */
  let genP = null;
  function genPrep() {
    const snap = selectedSnapshot($('#bLibrary').value || defaultLibraryId);
    if (!genP || genP.id !== snap.id) genP = makeLibraryContext(snap);
    return genP.ix;
  }
  function genSig(d) { return d.letters.join('') + '|' + d.words.slice().sort().join(' '); }
  /* 生成的关保留构造时的使用次数；手改字母或必答后自动失效，回到通用算法。 */
  function analyzeD(d) {
    if (d && d.origin === 'zen') {
      return { paths: {}, minTurns: {}, starts: {}, counts: null, uncovered: [], bad: [], empty: 0, assign: null, fail: null, solTurns: null };
    }
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
  let batchRun = null;
  function openBatch() {
    if (!ours()) return;
    syncLibrarySelectors(); if (!batchRun) $('#bLibrary').value = defaultLibraryId;
    $('#batch').hidden = false;
    if (!$('#bFrom').dataset.touched) $('#bFrom').value = campaign.levels.length + 1;
    previewCurve();
  }
  function batchCfg() {
    const num = (id, lo, hi, dv) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dv; };
    const from = Math.round(num('#bFrom', 1, 99999, 1));
    return {...WTEngine.DEFAULTS, seed: $('#bSeed').value || 'WT-2026', preset: $('#bPreset').value,
      libraryId: $('#bLibrary').value || defaultLibraryId, from, start: from, count: Math.round(num('#bCount', 1, 2000, 50)),
      attempts: Math.round(num('#bAttempts', 10, 1000, 100)), cooldown: Math.round(num('#bCooldown', 0, 100, 20)),
      extraWeight: num('#bExtraWeight', 0, 8, 0.8), maxUse: Math.round(num('#bMaxN', 1, 20, 13)), mode: $('#bMode').value};
  }
  function previewCurve() {
    const stats = WPLibrary.compile(libraryData, selectedRecipe($('#bLibrary').value || defaultLibraryId), {abbr: [...abbrSet]}).stats;
    $('#bLexNote').textContent = '当前词库：必答候选 ' + stats.candidates + ' · 仅额外 ' + stats.extras + '。本批次固定保存词库快照；未选为必答的可达候选也可计额外。';
    if (!batchRun) $('#bGo').disabled = !stats.candidates;
    const cfg = batchCfg(), cv = $('#bCurve'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H); ctx.strokeStyle = '#d2c2a4'; ctx.strokeRect(.5,.5,W-1,H-1);
    ctx.beginPath(); ctx.strokeStyle = '#2b2118';
    const n = Math.min(cfg.count, 400);
    for (let k = 0; k < n; k++) {
      const target = WTEngine.targetFor(cfg.from + k, cfg, WT_PROFILES);
      const x = 4 + (W - 8) * (n === 1 ? 0 : k / (n - 1)), y = H - 4 - (H - 8) * target.k / 16;
      if (k) ctx.lineTo(x,y); else ctx.moveTo(x,y);
    }
    ctx.stroke();
    const first = WTEngine.targetFor(cfg.from, cfg, WT_PROFILES), last = WTEngine.targetFor(cfg.from + cfg.count - 1, cfg, WT_PROFILES);
    $('#bCurveNote').textContent = cfg.preset + ' 必答目标预览：起点 ' + first.k + ' 词（阶段 ' + first.stage + '），终点 ' + last.k + ' 词（阶段 ' + last.stage + '）。棋盘尺寸由阶段目标选择；1500 关以后沿用最后一段。';
  }
  function startBatch() {
    if (batchRun) return;
    delete window.__lastBatch;
    const cfg = batchCfg(), ix = genPrep(), librarySnapshot = selectedSnapshot(cfg.libraryId);
    if (!ix.acceptable.some(x => x.role === 'candidate')) { toast('词库没有生效必答候选，请调整配置'); return; }
    snapshot();
    const librarySnapshotId = registerLibrarySnapshot(librarySnapshot);
    const replace = cfg.mode === 'replace';
    const before = replace ? [] : campaign.levels.slice(0, campaign.index + 1);
    const after = replace ? [] : campaign.levels.slice(campaign.index + 1);
    const history = WTEngine.historyFromLevels(before.map((d,i) => ({number: cfg.from - before.length + i, targets: d.words})));
    const made = [], failures = []; const t0 = performance.now(); let k = 0;
    batchRun = {cancel:false, librarySnapshotId}; $('#bLibrary').disabled = true; $('#bGo').disabled = true; $('#bStop').disabled = false;
    $('#bOut').textContent = ''; $('#bBar').style.width = '0%';
    function step() {
      if (batchRun.cancel || k >= cfg.count) return finish();
      const n = cfg.from + k;
      try {
        const r = WTEngine.generateOne(n, ix, WT_PROFILES, cfg, history);
        if (r.ok) {
          const lv = r.level;
          const game = WTV2Adapter.toGame(lv);
          const d = C.fromLevel(game);
          d.librarySnapshotId = librarySnapshotId;
          d.gen = {sig:genSig(d), n:game.n, seed:cfg.seed, no:n, preset:cfg.preset, profile:lv.profile, metrics:lv.metrics};
          made.push(d);
          for (const w of lv.targets) { history.usage[w]=(history.usage[w]||0)+1; history.recent.set(w,n); }
        } else failures.push({number:n,reason:r.reason});
      } catch(e) { failures.push({number:n,reason:e.message}); }
      k++; $('#bBar').style.width = Math.round(100*k/cfg.count)+'%';
      $('#bProg').textContent = '第 '+n+' 关 · '+k+' / '+cfg.count+' · '+((performance.now()-t0)/1000).toFixed(1)+' 秒';
      setTimeout(step,0);
    }
    function finish() {
      const secs=((performance.now()-t0)/1000).toFixed(1);
      // An entirely failed or immediately cancelled batch must preserve the user's sequence.
      if (made.length) {
        campaign.levels=before.concat(made,after); campaign.index=before.length;
        boardKey=''; suggCache=null; persist(); render();
      }
      const cancelled=batchRun.cancel;
      window.__lastBatch={made:made.length,failed:failures.length,failures,secs,cancelled,engine:'v2',preset:cfg.preset,librarySnapshotId};
      $('#bOut').innerHTML='<p>v2 生成 <b>'+made.length+'</b> 关，用时 '+secs+' 秒'+(cancelled?'（已中止）':'')+'。</p>'+
        '<p>必答权限、全路径同组用格、全盘覆盖和逐格次数检查通过；不自动降低安全条件或难度。</p>'+
        (failures.length?'<p class="bad">未生成 '+failures.length+' 关：'+failures.map(x=>esc(x.number+'：'+x.reason)).join('；')+'</p>':'')+
        '<p>本批次词库：' + esc(librarySnapshot.recipe.name) + ' · v' + librarySnapshot.recipe.revision + '。</p>';
      batchRun=null; $('#bLibrary').disabled=false; $('#bGo').disabled=false; $('#bStop').disabled=true; toast('已生成 '+made.length+' 关');
    }
    step();
  }
