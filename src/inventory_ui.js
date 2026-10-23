  /* ---------- 命名关卡库与独立生产 ---------- */
  const poolStore = WPPoolStore.create();
  let batchRun = null, workflowPools = [], poolPage = 0, poolSelected = '', poolPageRows = [], poolRenderVersion = 0;
  let generationCursors = {}, workflowReady = Promise.resolve(), workflowSaveQ = Promise.resolve(), generationSnapshotCache = null, poolPlayRestore = null;
  const workflowClone = WPLevelPool.clone;
  const workflowPause = () => new Promise(resolve => setTimeout(resolve, 0));
  function emotionNumber(value) { return Number.isFinite(value)?(value>0?'+':'')+String(Math.round(value*100)/100):'—'; }
  function emotionScoreHtml(emotion) {
    if(!emotion)return '<span class="emotion-score">—</span>';
    const missing=emotion.missingTargets.length+emotion.missingExtras.length;
    const title='必答 '+emotionNumber(emotion.targetSum)+' + 额外 '+emotionNumber(emotion.extraSum)+' × 0.5'+(missing?'；'+missing+' 个词未标注，按 0 分计':'');
    return '<span class="emotion-score '+(emotion.score>0?'positive':emotion.score<0?'negative':'neutral')+'" title="'+esc(title)+'">'+emotionNumber(emotion.score)+(missing?' *':'')+'</span>';
  }
  function emotionBreakdownHtml(game) {
    const emotion=WPEmotion.game(game),words=text=>WPLevelPool.words(text).map(word=>esc(word)+' '+(WPEmotion.value(word)===null?'未标注（0）':emotionNumber(WPEmotion.value(word)))).join(' · ');
    const missing=emotion.missingTargets.length+emotion.missingExtras.length;
    return '<div class="emotion-breakdown"><b>情绪分 '+emotionScoreHtml(emotion)+'</b><p>必答 '+emotionNumber(emotion.targetSum)+' +（额外 '+emotionNumber(emotion.extraSum)+' × 0.5）= '+emotionNumber(emotion.score)+'</p>'+
      '<details><summary>逐词情绪分</summary><p>必答：'+words(game.t)+'</p><p>额外：'+(words(game.e)||'无')+'</p></details>'+
      (missing?'<p class="note">'+missing+' 个词未收录或未标注，按 0 分计。</p>':'')+'</div>';
  }
  function workflowSave(key, value) {
    const copy = workflowClone(value);
    workflowSaveQ = workflowSaveQ.catch(() => {}).then(() => poolStore.save(key, copy));
    workflowSaveQ.catch(error => toast('配置保存失败：' + error.message));
    return workflowSaveQ;
  }
  function sizeOptions(width = 3, height = 3) {
    return WPLevelPool.sizes.map(([w,h]) => '<option value="' + w + 'x' + h + '"' + (w === width && h === height ? ' selected' : '') + '>' + w + ' × ' + h + '</option>').join('');
  }
  function productionRows() {
    return [...$('#productionTable tbody').children].map(row => {
      const [width,height] = row.querySelector('[data-production="size"]').value.split('x').map(Number);
      return {width,height,strategy:WTEngine.SEARCH_VERSION,initialLetters:row.querySelector('[data-production="initialLetters"]').value,quantity:Number(row.querySelector('[data-production="quantity"]').value)};
    });
  }
  function paintProduction(rows = [{width:3,height:3,initialLetters:'',quantity:1000}]) {
    $('#productionTable tbody').innerHTML = rows.map((row,i) => '<tr><td><small class="g-batch-number">批次 '+(i+1)+'</small><select data-production="size" aria-label="批次 '+(i+1)+' 棋盘尺寸">' + sizeOptions(row.width,row.height) + '</select></td><td><input data-production="initialLetters" aria-label="批次 '+(i+1)+' 起始首字母" type="text" spellcheck="false" autocomplete="off" placeholder="留空不限" value="' + esc(row.initialLetters??'') + '"></td><td><input data-production="quantity" aria-label="批次 '+(i+1)+' 生成数量" type="number" min="1" max="10000" value="' + esc(row.quantity) + '"></td><td><button type="button" data-production-delete title="移除批次 '+(i+1)+'" aria-label="移除批次 '+(i+1)+'">×</button></td></tr>').join('');
  }
  function generationState() { return {poolId:poolSelected,rows:productionRows(),seed:$('#bSeed').value,threads:$('#bThreads').value,budget:$('#bBudget').value,maxUse:$('#bMaxN').value}; }
  function productionSnapshot() {
    const targets = libraryRecipes.filter(r => batchLibrarySelection?.targetIds?.includes(r.id));
    const key = JSON.stringify([targets,[...abbrSet].sort()]);
    if (generationSnapshotCache?.key !== key) generationSnapshotCache = {key,value:WPLibrary.production(libraryData,targets,{abbr:[...abbrSet]})};
    return generationSnapshotCache.value;
  }
  function productionSeedNotes(cfg,compiled) {
    generationSnapshotCache.index??=WTEngine.buildIndex(compiled.snapshot.lex);
    return cfg.rows.map((row,i)=>{const info=WTEngine.productionSeedInfo(row,generationSnapshotCache.index);return info.missing.length?'批次 '+(i+1)+'：'+info.missing.join('、')+' 无可用短词，将尝试其余首字母。':'';}).filter(Boolean).join(' ');
  }
  function batchCfg() {
    const rows = productionRows();
    if (!rows.length) throw new Error('请添加生产批次');
    for (const row of rows) {
      WTEngine.poolTarget(row,WT_PROFILES);
      row.initialLetters=WTEngine.normalizeInitials(row.initialLetters);
      if (!Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 10000) throw new Error('每批生成数量须为 1–10000');
    }
    const count = rows.reduce((n,row) => n + row.quantity,0);
    if (count > 10000) throw new Error('单次最多生产 10000 关，可分批追加');
    const budget = $('#bBudget').value.trim() ? Number($('#bBudget').value) : count * 300, maxUse = Number($('#bMaxN').value);
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100000000) throw new Error('尝试预算须为 1–100000000');
    if (!Number.isSafeInteger(maxUse) || maxUse < 1 || maxUse > 20) throw new Error('单格使用上限须为 1–20');
    if($('#bSeedMode').value==='fixed'&&!$('#bSeed').value.trim())throw new Error('请输入要复用的种子，或选择每次随机');
    return {rows,count,budget,maxUse,seed:$('#bSeed').value,poolId:poolSelected,workerCount:WPBatchGenerator.threadCount($('#bThreads').value,navigator.hardwareConcurrency)};
  }
  function previewCurve() {
    if (batchRun) return;
    const rows=productionRows(),total=rows.reduce((n,row)=>n+row.quantity,0);
    $('#bBatchTotal').textContent=rows.length+' 批次'+(Number.isSafeInteger(total)&&total>=0?' · 共 '+total.toLocaleString()+' 关':'');
    $('#bConfigNote').hidden=true;
    try {
      const compiled = productionSnapshot();
      $('#bLexNote').textContent = '生效必答 '+compiled.stats.candidates.toLocaleString()+' 词。额外词自动全量校对，共 '+compiled.stats.extras.toLocaleString()+' 词。';
      const cfg = batchCfg(), notes=productionSeedNotes(cfg,compiled);
      $('#bConfigNote').textContent=notes;$('#bConfigNote').hidden=!notes;
      $('#bComputeStatus').textContent = cfg.poolId?cfg.count.toLocaleString()+' 关 · 预算 '+cfg.budget.toLocaleString()+' 次 · '+cfg.workerCount+' 线程':'请新建或选择目标关卡库';
      $('#bComputeStatus').classList.remove('bad');
      $('#bGo').disabled = !cfg.poolId || !compiled.stats.candidates;
    } catch (error) { $('#bComputeStatus').textContent = error.message;$('#bComputeStatus').classList.add('bad'); $('#bGo').disabled = true; }
  }
  async function refreshPools(preferred = poolSelected) {
    workflowPools = (await poolStore.listPools()).sort((a,b) => a.createdAt-b.createdAt || a.id.localeCompare(b.id));
    poolSelected = workflowPools.some(p => p.id === preferred) ? preferred : workflowPools[0]?.id || '';
    $('#poolSelect').innerHTML = workflowPools.length ? workflowPools.map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + ' · ' + p.count.toLocaleString() + ' 关</option>').join('') : '<option value="">先创建或导入关卡库</option>';
    $('#poolSelect').value = poolSelected;
    $('#poolRename').disabled = !poolSelected || !!batchRun; $('#poolExport').disabled = !poolSelected || !!batchRun;
    await paintPoolEntries(); previewCurve();
  }
  async function paintPoolEntries() {
    const version=++poolRenderVersion;
    const pool = workflowPools.find(p => p.id === poolSelected), pages = Math.max(1,Math.ceil((pool?.count || 0)/50));
    poolPage = Math.max(0,Math.min(poolPage,pages-1));
    const rows = pool ? await poolStore.listEntries(pool.id,poolPage,50) : [];
    if(version!==poolRenderVersion)return;
    poolPageRows=rows;
    $('#bOut').hidden=!!$('#bOut').dataset.poolId&&$('#bOut').dataset.poolId!==poolSelected;
    $('#poolCount').textContent = pool ? pool.name + ' · 共 ' + pool.count.toLocaleString() + ' 关' : '尚未创建关卡库';
    $('#poolPage').textContent = (poolPage+1) + ' / ' + pages;
    $('#poolPrev').disabled = !poolPage; $('#poolNext').disabled = poolPage+1>=pages;
    $('#poolEntries tbody').innerHTML = poolPageRows.map(e => '<tr><td><b>'+e.metrics.width+'×'+e.metrics.height+' · '+e.metrics.targetCount+' 词</b><small title="'+esc(e.id)+'">'+esc(e.id.slice(-8))+'</small></td><td class="pool-words"><span class="g-word-preview" title="'+esc(e.game.t)+'">'+esc(e.game.t)+'</span><div class="g-pool-letters" title="棋盘字母">'+e.metrics.letters.join(' ')+'</div></td><td>最多 '+e.metrics.maxTurns+' 拐<div class="g-turn-counts" title="直线／一拐／二拐及以上词数"><span>直 '+e.metrics.straightCount+'</span><span>一 '+e.metrics.oneTurnCount+'</span><span>多 '+e.metrics.multiTurnCount+'</span></div></td><td>'+emotionScoreHtml(e.metrics.emotion)+'</td><td><button type="button" data-pool-preview="'+esc(e.id)+'" aria-label="查看或试玩关卡 '+esc(e.id.slice(-8))+'"'+(batchRun?' disabled':'')+'>查看</button></td></tr>').join('') || '<tr><td colspan="5" class="g-empty"><strong>'+(pool?'这个关卡库还没有关卡':'先创建一个关卡库')+'</strong>'+(pool?'配置来源词库与生产批次，点击下方“生成到关卡库”。':'点击上方“新建库”，或从“库操作”导入。')+'</td></tr>';
  }
  async function loadWorkflowState() {
    workflowReady = (async () => {
      const [generation,cursors,draft,preview] = await Promise.all([poolStore.load('generation'),poolStore.load('generationCursors'),poolStore.load('arrangement'),poolStore.load('arrangementPreview')]);
      generationCursors = cursors || {};
      paintProduction(generation?.rows?.length ? generation.rows : undefined);
      if (generation) {
        $('#bSeed').value = generation.seed || 'WT-2026'; $('#bThreads').value = generation.threads || 'auto';
        $('#bBudget').value = generation.budget || ''; $('#bMaxN').value = generation.maxUse || 13;
      }
      arrangementDraft = draft || null; arrangementPreview = preview || null;
      await loadSeedState(generation,draft,preview);
      await refreshPools(generation?.poolId); await loadArrangementView();
    })();
    return workflowReady;
  }
  async function openBatch() {
    if (!ours()) return;
    try { await workflowReady; await refreshPools(); await refreshSeedHistory(); syncLibrarySelectors(); $('#batch').hidden = false; previewCurve(); }
    catch (error) { toast('关卡库无法打开：' + error.message); }
  }
  function inventoryLocked(locked) {
    $('#bTargetLibraries').disabled=locked;
    for (const el of $('#batch').querySelectorAll('input,select,button')) if (!['bClose','bStop','bRunSettingsOpen','poolPrev','poolNext'].includes(el.id)&&!el.matches('[data-generation-pane],[data-generation-dialog-close]')) el.disabled = locked;
    $('#batch').dataset.generating=String(locked);$('#bPoolMenu').inert=locked;if(locked)$('#bPoolMenu').open=false;
    $('#bStop').disabled = !locked;$('#bStop').hidden=!locked;
    $('#bGo').textContent=locked?'正在生成…':'生成到关卡库';
  }
  async function startBatch() {
    if (batchRun || !ours()) return;
    let cfg,compiled;
    try { cfg=batchCfg(); compiled=productionSnapshot(); if(!cfg.poolId)throw new Error('请选择目标关卡库'); if(!compiled.stats.candidates)throw new Error('来源中没有生效必答词'); productionSeedNotes(cfg,compiled);cfg.seed=seedForRun('generation'); }
    catch(error){toast(error.message);return;}
    const run={cfg,cancel:false,added:0,attempted:0,duplicates:0,failed:0,started:performance.now(),generator:null}; batchRun=run; window.__lastBatch=null;
    run.seedHistoryId=beginSeedRecord('generation',cfg.seed,workflowPools.find(p=>p.id===cfg.poolId)?.name||cfg.poolId,cfg.count);
    $('#bRunSettings').close();inventoryLocked(true); $('#bOut').textContent='';$('#bOut').dataset.poolId=cfg.poolId;$('#bOut').hidden=false;$('#bProg').textContent='准备生成…';$('#bBar').style.width='0%';$('#bProgress').setAttribute('aria-valuenow','0');
    try {
      await saveSeedRecord('generation',run.seedHistoryId);await workflowSave('seedModes',seedModes);
      await workflowSave('generation',generationState());
      const seen=new Set((await poolStore.summaries([cfg.poolId])).map(e=>e.id));
      const snap=compiled.snapshot,ix=WTEngine.buildIndex(snap.lex),batchId='batch-'+newId();
      run.generator=WPBatchGenerator.create({engine:WTEngine,lex:snap.lex,profiles:WT_PROFILES,config:{seed:cfg.seed,maxUse:cfg.maxUse},workers:cfg.workerCount,workerSource:JSON.parse($('#batchWorker').textContent),
        onStatus:status=>{$('#bComputeStatus').textContent=status.mode==='workers'?status.workers+' 个后台线程生产中':'单线程分段生产中';}});
      for (const [rowIndex,row] of cfg.rows.entries()) {
        let rowAdded=0;
        // Changing extra-word references must not restart the candidate stream.
        const cursorKey=WPLevelPool.hash(WPLevelPool.stable([cfg.poolId,compiled.targetKey,cfg.seed,cfg.maxUse,WTEngine.SEARCH_VERSION,row.width,row.height,row.initialLetters]));
        let cursor=generationCursors[cursorKey]||0;
        while(!run.cancel&&rowAdded<row.quantity&&run.attempted<cfg.budget){
          const count=Math.min(32,cfg.budget-run.attempted),results=await run.generator.generateCandidates(row,cursor,count),pending=[];
          for(const result of results){
            if(run.cancel||rowAdded+pending.length>=row.quantity)break;
            cursor++;run.attempted++;
            if(!result){run.failed++;continue;}
            const entry=WPLevelPool.record(WPLevelPool.gameOf(result.level),snap,{batchId,seed:cfg.seed,ordinal:result.ordinal,width:row.width,height:row.height,targetCount:result.level.targets.length,maxUse:cfg.maxUse,engine:WTEngine.SEARCH_VERSION,...result.level.construction},ix);
            if(seen.has(entry.id)){run.duplicates++;continue;}
            seen.add(entry.id);pending.push(entry);
          }
          if(pending.length){const stored=await poolStore.putEntries(cfg.poolId,pending,{[snap.id]:snap});run.added+=stored.added;rowAdded+=stored.added;run.duplicates+=stored.duplicates;}
          generationCursors[cursorKey]=cursor;await poolStore.save('generationCursors',generationCursors);
          $('#bBar').style.width=Math.round(100*run.added/cfg.count)+'%';
          $('#bProgress').setAttribute('aria-valuenow',String(Math.round(100*run.added/cfg.count)));
          $('#bProg').textContent='批次 '+(rowIndex+1)+' / '+cfg.rows.length+' · 已入库 '+run.added+' / '+cfg.count+' · 尝试 '+run.attempted+' / '+cfg.budget+' · 重复 '+run.duplicates;
          if(pending.length&&performance.now()-(run.lastPaint||0)>700){run.lastPaint=performance.now();await refreshPools(cfg.poolId);}
          await workflowPause();
        }
        if(run.cancel||run.attempted>=cfg.budget)break;
      }
    }catch(error){if(error.name!=='AbortError')run.error=error.message;else run.cancel=true;}
    finally {
      const execution=run.generator?.status();run.generator?.close();
      const summary={seed:cfg.seed,made:run.added,attempted:run.attempted,duplicates:run.duplicates,failed:run.failed,cancelled:run.cancel,error:run.error||null,poolId:cfg.poolId,librarySnapshotId:compiled.snapshot.id,
        targetLibraryIds:compiled.snapshot.recipe.selection.target.map(r=>r.id),extraLibraryIds:compiled.snapshot.recipe.selection.extra.map(r=>r.id),
        execution:execution?.mode||'none',workers:execution?.workers||0,secs:((performance.now()-run.started)/1000).toFixed(1)};
      $('#bOut').textContent=(run.error?'生产停止：'+run.error+'。':run.cancel?'已中止。':run.added<cfg.count?'尝试预算已耗尽。':'本次生产完成。')+' 已入库 '+run.added+' 关，未完成 '+(cfg.count-run.added)+' 关；当前关序未改变。';
      $('#bOut').dataset.status=run.error?'error':run.cancel?'cancelled':run.added<cfg.count?'budget':'complete';
      await finishSeedRecord('generation',run.seedHistoryId,{status:run.error?'error':run.cancel?'cancelled':run.added===cfg.count?'complete':'budget',made:run.added,attempted:run.attempted,error:run.error||null}).catch(error=>toast('种子历史保存失败：'+error.message));
      batchRun=null;inventoryLocked(false);syncLibrarySelectors();await refreshPools(cfg.poolId).catch(error=>toast(error.message));
      window.__lastBatch=summary;
    }
  }
  function namePool(rename=false) {
    const current=workflowPools.find(p=>p.id===poolSelected);
    modal(rename?'重命名关卡库':'新建关卡库','<label>名称 <input id="poolNameInput" maxlength="80" value="'+esc(rename?current?.name||'':'')+'" placeholder="例如：前期必答词关卡"></label>',[
      {label:'取消'},{label:rename?'保存':'创建',primary:true,onClick:async()=>{try{const name=$('#poolNameInput').value;const pool=rename?await poolStore.renamePool(current.id,name):await poolStore.createPool(name);poolPage=0;await refreshPools(pool.id);await workflowSave('generation',generationState());if(arrangementDraft)paintArrangementSegments();}catch(error){toast(error.message);}}}
    ]);$('#poolNameInput').focus();
  }
  async function importPoolDocument(file,targetId) {
    WPLevelPool.checkFileHeader(file);
    const indices=new Map(),records=[];
    for(const [i,entry] of file.entries.entries()){records.push(WPLevelPool.importRecord(entry,file.librarySnapshots,indices));if(i%25===0){$('#bProg').textContent='校验导入 '+(i+1)+' / '+file.entries.length;await workflowPause();}}
    if(!targetId){const preserve=typeof file.pool.id==='string'&&!workflowPools.some(p=>p.id===file.pool.id)?file.pool.id:undefined;targetId=(await poolStore.createPool(file.pool.name,preserve)).id;}
    let added=0;for(let at=0;at<records.length;at+=100){added+=(await poolStore.putEntries(targetId,records.slice(at,at+100),file.librarySnapshots)).added;await workflowPause();}
    await refreshPools(targetId);if(arrangementDraft)paintArrangementSegments();await workflowSave('generation',generationState());
    $('#bProg').textContent='导入完成：新增 '+added+' 关，重复 '+(records.length-added)+' 关';return {poolId:targetId,added};
  }
  async function exportPoolDocument() {
    const pool=workflowPools.find(p=>p.id===poolSelected);if(!pool)throw new Error('请选择关卡库');
    const entries=await poolStore.allEntries(pool.id),snaps=await poolStore.getSnapshots(entries.map(e=>e.librarySnapshotId));
    return WPLevelPool.exportFile(pool,entries,snaps);
  }
  async function previewInventory(poolId,id) {
    try {
      const entry=await poolStore.getEntry(poolId,id);if(!entry)throw new Error('关卡不存在');
      const lv=WPLevelPool.parseGame(entry.game);
      const grid='<div class="inventory-board" style="grid-template-columns:repeat('+lv.width+',1fr)">'+lv.grid.map((c,i)=>'<span>'+c+'<small>'+lv.counts[i]+'</small></span>').join('')+'</div>';
      modal('关卡预览',grid+'<p>必答：'+esc(entry.game.t)+'</p><p class="note">额外：'+esc(entry.game.e||'无')+'</p><p class="note">'+entry.metrics.perWord.map(w=>esc(w.word)+'：'+w.turns+' 拐').join(' · ')+'</p>'+emotionBreakdownHtml(entry.game),[{label:'关闭'},{label:'试玩',primary:true,onClick:()=>playInventory(entry).catch(error=>toast(error.message))}]);
    }catch(error){toast(error.message);}
  }
  async function playInventory(entry) {
    if(poolPlayRestore)throw new Error('请先结束当前试玩');
    const snapshots=await poolStore.getSnapshots([entry.librarySnapshotId]),d=normalizeDraft(C.fromLevel(entry.game));
    d.librarySnapshotId=entry.librarySnapshotId;d.gen={sig:genSig(d),n:entry.game.n};
    poolPlayRestore={campaign,currentFile,levelView,batchHidden:$('#batch').hidden,arrangeHidden:$('#arrange').hidden};
    $('#batch').hidden=true;$('#arrange').hidden=true;
    campaign={name:'库存试玩',index:0,levels:[d],librarySnapshots:snapshots,pack:null};currentFile=null;
    try{boardKey='';suggCache=null;render();startPlay();if($('#play').hidden)restoreInventoryPlay();}catch(error){restoreInventoryPlay();throw error;}
  }
  function restoreInventoryPlay() {
    if(!poolPlayRestore)return;({campaign,currentFile,levelView}=poolPlayRestore);$('#batch').hidden=poolPlayRestore.batchHidden;$('#arrange').hidden=poolPlayRestore.arrangeHidden;poolPlayRestore=null;boardKey='';suggCache=null;render();
  }
  function wireInventory() {
    $('#btnBatch').onclick=()=>openBatch();$('#bClose').onclick=()=>{$('#bRunSettings').close();$('#bPoolMenu').open=false;$('#batch').hidden=true;$('#btnBatch').focus({preventScroll:true});};$('#bGo').onclick=()=>startBatch();
    $('#bRunSettingsOpen').onclick=()=>{refreshSeedHistory().catch(error=>toast(error.message));$('#bRunSettings').showModal();};
    $('#bRunSettings').addEventListener('click',e=>{if(e.target.closest('[data-generation-dialog-close]'))$('#bRunSettings').close();});
    $('#batch').addEventListener('keydown',e=>{
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z')e.stopPropagation();
      if(e.key==='Escape'&&$('#bRunSettings').open)e.stopPropagation();
      if(e.key==='Tab'&&!$('#bRunSettings').open&&$('#modal').hidden){
        const items=[...$('#batch').querySelectorAll('input,select,button,summary')].filter(el=>!el.disabled&&!el.closest('[inert]')&&el.tabIndex>=0&&el.getClientRects().length);
        if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}
      }
    });
    for(const button of document.querySelectorAll('[data-generation-pane]'))button.onclick=()=>{
      $('#batch').dataset.mobilePane=button.dataset.generationPane;
      for(const tab of document.querySelectorAll('[data-generation-pane]'))tab.setAttribute('aria-pressed',String(tab===button));
    };
    $('#bPoolMenu').addEventListener('click',e=>{if(e.target.closest('button'))$('#bPoolMenu').open=false;});
    $('#bStop').onclick=()=>{if(batchRun){batchRun.cancel=true;batchRun.generator?.cancel();}};
    $('#bAddRow').onclick=()=>{paintProduction([...productionRows(),{width:3,height:3,initialLetters:'',quantity:1000}]);previewCurve();workflowSave('generation',generationState());$('#productionTable tbody tr:last-child input').focus();};
    $('#poolSelect').onchange=async()=>{poolSelected=$('#poolSelect').value;poolPage=0;await paintPoolEntries();previewCurve();workflowSave('generation',generationState());};
    $('#poolNew').onclick=()=>namePool();$('#poolRename').onclick=()=>namePool(true);
    $('#poolPrev').onclick=()=>{poolPage--;paintPoolEntries();};$('#poolNext').onclick=()=>{poolPage++;paintPoolEntries();};
    $('#poolEntries').onclick=e=>{const b=e.target.closest('[data-pool-preview]');if(b)previewInventory(poolSelected,b.dataset.poolPreview);};
    $('#poolExport').onclick=async()=>{try{const file=await exportPoolDocument();download(file.pool.name+'.pool.json',JSON.stringify(file,null,2));}catch(error){toast(error.message);}};
    $('#poolImport').onclick=()=>$('#poolFile').click();
    $('#poolFile').onchange=async e=>{
      const f=e.target.files?.[0];e.target.value='';if(!f)return;
      try{const file=WPLevelPool.checkFileHeader(JSON.parse(await f.text()));modal('导入关卡库','<p>'+esc(file.pool.name)+' · '+file.entries.length+' 关</p><label>写入 <select id="poolImportTarget"><option value="">新建同名关卡库</option>'+workflowPools.map(p=>'<option value="'+esc(p.id)+'">合并到 '+esc(p.name)+'</option>').join('')+'</select></label>',[{label:'取消'},{label:'导入',primary:true,onClick:()=>importPoolDocument(file,$('#poolImportTarget').value).catch(error=>toast('导入失败：'+error.message))}]);}
      catch(error){toast('导入失败：'+error.message);}
    };
    $('#batch').addEventListener('input',e=>{if(batchRun)return;if(e.target.dataset.batchLibrary)rememberBatchLibrarySelection();previewCurve();workflowSave('generation',generationState());});
    $('#batch').addEventListener('click',e=>{
      if(batchRun)return;const del=e.target.closest('[data-production-delete]');if(del){del.closest('tr').remove();paintProduction(productionRows());previewCurve();workflowSave('generation',generationState());}
      const button=e.target.closest('[data-batch-select]');if(!button)return;
      for(const input of document.querySelectorAll('[data-batch-library="'+button.dataset.batchSelect+'"]:not(:disabled)'))input.checked=button.dataset.selectAll==='1';
      rememberBatchLibrarySelection();previewCurve();
    });
  }
