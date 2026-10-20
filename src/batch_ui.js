  /* ---------- 批量生成（WTEngine v2） ---------- */
  let batchPlanCache = null;
  function batchLibraryPlan() {
    const selection = {};
    for (const key of ['target', 'extra']) selection[key] = (batchLibrarySelection?.[key + 'Ids'] || []).map(id => {
      const recipe = libraryRecipes.find(r => r.id === id);
      if (!recipe) throw new Error('所选词库已删除，请重新选择');
      return recipe;
    });
    const rules = {abbr: [...abbrSet].sort()}, key = JSON.stringify([selection, rules]);
    if (batchPlanCache?.key !== key) batchPlanCache = {key, value: WPLibrary.combine(libraryData, selection, rules)};
    return batchPlanCache.value;
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
    syncLibrarySelectors();
    $('#bThreads option[value=\"auto\"]').textContent = '自动（' + WPBatchGenerator.threadCount('auto', navigator.hardwareConcurrency) + ' 线程）';
    for (const option of $('#bThreads').options) if (option.value !== 'auto') option.disabled = Number(option.value) > Math.min(8, navigator.hardwareConcurrency || 2);
    if ($('#bThreads').selectedOptions[0].disabled) $('#bThreads').value = 'auto';
    $('#batch').hidden = false;
    if (!$('#bFrom').dataset.touched) $('#bFrom').value = campaign.levels.length + 1;
    previewCurve();
  }
  function batchCfg() {
    const num = (id, lo, hi, dv) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dv; };
    const from = Math.round(num('#bFrom', 1, 99999, 1));
    return {...WTEngine.DEFAULTS, seed: $('#bSeed').value || 'WT-2026', preset: $('#bPreset').value,
      workerCount: WPBatchGenerator.threadCount($('#bThreads').value, navigator.hardwareConcurrency),
      targetLibraryIds: (batchLibrarySelection?.targetIds || []).slice(), extraLibraryIds: (batchLibrarySelection?.extraIds || []).slice(),
      from, start: from, count: Math.round(num('#bCount', 1, 2000, 50)),
      attempts: Math.round(num('#bAttempts', 10, 1000, 100)), cooldown: Math.round(num('#bCooldown', 0, 100, 20)),
      extraWeight: num('#bExtraWeight', 0, 8, 0.8), maxUse: Math.round(num('#bMaxN', 1, 20, 13)), mode: $('#bMode').value};
  }
  function previewCurve() {
    let plan;
    try { plan = batchRun?.plan || batchLibraryPlan(); }
    catch (e) { $('#bLexNote').textContent = e.message; $('#bGo').disabled = true; return; }
    const stats = plan.stats, selection = plan.snapshot.recipe.selection;
    $('#bLexNote').textContent = '必答：已选 ' + selection.target.length + ' 库，生效 ' + stats.candidates.toLocaleString() + ' 词；仅额外：已选 ' + selection.extra.length + ' 库，生效 ' + stats.extras.toLocaleString() + ' 词。' +
      (stats.candidates ? '未被选为本关必答的可达候选仍可计为额外词。' : '请至少选择一份有生效必答候选的词库。');
    if (!batchRun) $('#bGo').disabled = !stats.candidates;
    const cfg = batchRun?.cfg || batchCfg(), cv = $('#bCurve'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    if (!batchRun) $('#bComputeStatus').textContent = '将使用 ' + cfg.workerCount + ' 个计算线程；相同种子和设置的结果不受线程数影响。';
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
    window.__lastBatch = null;
    let plan;
    try { plan = batchLibraryPlan(); } catch (e) { toast(e.message); return; }
    if (!plan.stats.candidates) { toast('请至少选择一份有生效必答候选的词库'); return; }
    const cfg = batchCfg(), librarySnapshot = plan.snapshot;
    snapshot();
    const librarySnapshotId = registerLibrarySnapshot(librarySnapshot);
    const replace = cfg.mode === 'replace';
    const owner = campaign, sequenceBefore = JSON.stringify([campaign.name, campaign.levels, campaign.pack]);
    const before = replace ? [] : campaign.levels.slice(0, campaign.index + 1);
    const after = replace ? [] : campaign.levels.slice(campaign.index + 1);
    const history = WTEngine.historyFromLevels(before.map((d,i) => ({number: cfg.from - before.length + i, targets: d.words})));
    const made = [], failures = []; const t0 = performance.now(); let k = 0;
    const run = batchRun = {cancel:false, librarySnapshotId, plan, cfg, generator:null};
    $('#bTargetLibraries').disabled = true; $('#bExtraLibraries').disabled = true;
    for (const field of document.querySelectorAll('#batch .bgrid input, #batch .bgrid select')) field.disabled = true;
    $('#bGo').disabled = true; $('#bStop').disabled = false;
    $('#bOut').textContent = ''; $('#bBar').style.width = '0%';
    $('#bComputeStatus').textContent = '正在启动 ' + cfg.workerCount + ' 个计算线程…';
    run.generator = WPBatchGenerator.create({engine:WTEngine, lex:librarySnapshot.lex, profiles:WT_PROFILES, config:cfg,
      workers:cfg.workerCount, workerSource:JSON.parse($('#batchWorker').textContent),
      onStatus: status => {
        if (batchRun !== run) return;
        $('#bComputeStatus').textContent = status.mode === 'workers' ? status.workers + ' 个后台线程正在计算' : '多线程不可用，已切换为单线程计算。';
      },
      onProgress: progress => {
        if (batchRun !== run || run.cancel) return;
        $('#bProg').textContent = '第 ' + progress.number + ' 关 · 已检查 ' + progress.checked + ' / ' + progress.attempts + ' 个候选 · 已完成 ' + k + ' / ' + cfg.count + ' 关';
      }
    });
    async function step() {
      if (batchRun !== run) return;
      if (campaign !== owner || !ours()) run.cancel = true;
      if (run.cancel || k >= cfg.count) return finish();
      const n = cfg.from + k;
      try {
        const r = await run.generator.generateOne(n, history);
        if (campaign !== owner || !ours()) run.cancel = true;
        if (batchRun !== run || run.cancel) return finish();
        if (r.ok) {
          const lv = r.level;
          const game = WTV2Adapter.toGame(lv);
          const d = C.fromLevel(game);
          d.librarySnapshotId = librarySnapshotId;
          d.gen = {sig:genSig(d), n:game.n, seed:cfg.seed, no:n, preset:cfg.preset, profile:lv.profile, metrics:lv.metrics, searchVersion:WTEngine.SEARCH_VERSION};
          made.push(d);
          for (const w of lv.targets) { history.usage[w]=(history.usage[w]||0)+1; history.recent.set(w,n); }
        } else failures.push({number:n,reason:r.reason});
      } catch(e) {
        if (run.cancel || e.name === 'AbortError') return finish();
        failures.push({number:n,reason:e.message});
      }
      k++; $('#bBar').style.width = Math.round(100*k/cfg.count)+'%';
      $('#bProg').textContent = '第 '+n+' 关 · '+k+' / '+cfg.count+' · '+((performance.now()-t0)/1000).toFixed(1)+' 秒';
      queueMicrotask(step);
    }
    function finish() {
      if (batchRun !== run) return;
      const execution = run.generator.status(); run.generator.close();
      const secs=((performance.now()-t0)/1000).toFixed(1);
      const discarded = campaign !== owner || !ours() || JSON.stringify([campaign.name, campaign.levels, campaign.pack]) !== sequenceBefore;
      if (discarded) run.cancel = true;
      // An entirely failed or immediately cancelled batch must preserve the user's sequence.
      if (made.length && !discarded) {
        campaign.levels=before.concat(made,after); campaign.index=before.length;
        boardKey=''; suggCache=null; persist(); render();
      }
      const cancelled=run.cancel;
      window.__lastBatch={made:discarded?0:made.length,generated:made.length,discarded,failed:failures.length,failures,secs,cancelled,engine:'v2',preset:cfg.preset,librarySnapshotId,targetLibraryIds:cfg.targetLibraryIds,extraLibraryIds:cfg.extraLibraryIds,workers:execution.workers,execution:execution.mode};
      $('#bOut').innerHTML='<p>生成 <b>'+made.length+'</b> 关，用时 '+secs+' 秒 · '+(execution.mode==='fallback'?'单线程计算':execution.workers+' 个后台线程')+(cancelled?'（已中止）':'')+'。</p>'+
        (discarded?'<p class=\"bad\">关序已变更，本批结果未写入，请重新开始生成。</p>':made.length?'<p>必答权限、全路径同组用格、全盘覆盖和逐格次数检查通过；不自动降低安全条件或难度。</p>':'<p>未完成关卡，保留原关序。</p>')+
        (failures.length?'<p class="bad">未生成 '+failures.length+' 关：'+failures.map(x=>esc(x.number+'：'+x.reason)).join('；')+'</p>':'')+
        '<p>必答词库：' + (librarySnapshot.recipe.selection.target.map(r => esc(r.name) + ' · v' + r.revision).join('、') || '无') + '。</p>' +
        '<p>仅额外词库：' + (librarySnapshot.recipe.selection.extra.map(r => esc(r.name) + ' · v' + r.revision).join('、') || '无') + '。</p>';
      for (const field of document.querySelectorAll('#batch .bgrid input, #batch .bgrid select')) field.disabled = false;
      batchRun=null; $('#bTargetLibraries').disabled=false; $('#bExtraLibraries').disabled=false; $('#bStop').disabled=true;
      syncLibrarySelectors(); if ($('#batch').hidden) previewCurve(); toast(discarded?'关序已变更，本批结果未写入':'已生成 '+made.length+' 关');
    }
    step();
  }
