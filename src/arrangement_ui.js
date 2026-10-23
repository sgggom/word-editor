  /* ---------- 关卡排布：配置、预览与正式关序分离 ---------- */
  let arrangementDraft=null, arrangementPreview=null, arrangeRun=null, aResultPage=0;
  let aSelectedSegment=0, aOpenRow=null, aViewTab='levels', aSaveRevision=0, aDialogSegment=null;
  const arrangementMetrics=new WeakMap(), aDetailCache=new Map();
  const aReasonLabels={static:'库存不符合条件',temporal:'间隔或密度受限',unmatched:'候选被其他关占用',budget:'预算内尚未匹配',cancelled:'中止后尚未匹配'};
  const aReasonDetails={static:'没有符合来源库、尺寸、目标词数、必含字母和拐弯要求的库存。',temporal:'本次搜索中，候选被重复词间隔或字母密度限制排除。',unmatched:'符合条件的候选已被其他关号使用，本次搜索尚未找到替代。',budget:'搜索预算已用尽，尚未完成匹配；这不代表没有可用解。',cancelled:'排布已中止，这个关号尚未匹配。'};
  function planFromCampaign(levels=campaign.levels) {
    const first=levels[0]||{},shape=WPLevelPool.sizes.some(([w,h])=>w===first.W&&h===first.H)?{width:first.W,height:first.H}:{width:3,height:3};
    const targetCount=first.words?.length||3,overrides={};
    levels.forEach((d,i)=>{if(d.words?.length&&!WPLevelPool.sizes.some(([w,h])=>w===d.W&&h===d.H))throw new Error('第 '+(i+1)+' 关尺寸不在当前支持范围内');const value={width:d.words?.length?d.W:3,height:d.words?.length?d.H:3,targetCount:d.words?.length||3};if(value.width!==shape.width||value.height!==shape.height||value.targetCount!==targetCount)overrides[i+1]=value;});
    return {kind:'wordpages-arrangement',schemaVersion:1,name:'排布关序',seed:'',budget:1000000,requiredLetters:workflowClone(requiredLetterSchedule),overrides,
      segments:[{id:'segment-'+newId(),from:1,to:Math.max(1,levels.length),...shape,targetCount,poolIds:poolSelected?[poolSelected]:[],rules:workflowClone(WPArrangement.DEFAULT_RULES)}]};
  }
  function modeOptions(value) { return '<option value="strict"'+(value==='strict'?' selected':'')+'>严格限制</option><option value="soft"'+(value==='soft'?' selected':'')+'>扣分避让</option>'; }
  function currentArrangementSegment() { return arrangementDraft?.segments[aSelectedSegment]; }
  function arrangementKey(plan=arrangementDraft) { return WPLevelPool.stable(plan); }
  function arrangementPreviewActive() { return !!arrangementPreview&&arrangementPreview.planKey===arrangementKey()&&arrangementPreview.result.rankingVersion===WPArrangement.RANKING_VERSION&&arrangementPreview.result.emotionVersion===WPEmotion.version; }
  function arrangementOverrideCount(s) { return s?Object.keys(arrangementDraft.overrides||{}).filter(n=>Number(n)>=s.from&&Number(n)<=s.to).length:0; }
  function resetArrangementView() {
    aSelectedSegment=0;aResultPage=0;aOpenRow=null;aDetailCache.clear();
    $('#aScope').value='all';$('#aFilter').value='all';$('#aJump').value='';setArrangementTab('levels');
  }
  function persistArrangementDraft() {
    const revision=++aSaveRevision;$('#aSaveState').textContent='保存中…';
    workflowSave('arrangement',arrangementDraft).then(()=>{if(revision===aSaveRevision)$('#aSaveState').textContent='已保存';},()=>{if(revision===aSaveRevision)$('#aSaveState').textContent='保存失败';});
  }
  function paintArrangementNavigation() {
    if(!arrangementDraft)return;
    aSelectedSegment=Math.max(0,Math.min(aSelectedSegment,arrangementDraft.segments.length-1));
    const preview=arrangementPreview,active=arrangementPreviewActive();
    const label=s=>s.from+'–'+s.to+' 关';
    $('#aSegmentCount').textContent=arrangementDraft.segments.length+' 段';
    $('#aSegmentList').innerHTML=arrangementDraft.segments.map((s,index)=>{
      const rows=preview?.result.rows.filter(row=>row.number>=s.from&&row.number<=s.to)||[],filled=rows.filter(row=>row.choice).length;
      const status=rows.length?(active?'':'上次预览 · ')+filled+'/'+rows.length+' 已匹配'+(rows.length>filled?' · 缺 '+(rows.length-filled):''):s.poolIds.length+' 个来源库';
      return '<button type="button" class="a-segment-card'+(index===aSelectedSegment?' selected':'')+'" data-select-segment="'+index+'" aria-pressed="'+(index===aSelectedSegment)+'"><strong>'+label(s)+'</strong><span>'+s.width+'×'+s.height+' · '+s.targetCount+' 个目标词</span><small>'+status+'</small></button>';
    }).join('')||'<p class="note">添加一个分段开始配置。</p>';
    $('#aSegmentSelect').innerHTML=arrangementDraft.segments.map((s,i)=>'<option value="'+i+'">分段 '+(i+1)+' · '+label(s)+'</option>').join('');
    $('#aSegmentSelect').value=String(aSelectedSegment);
    $('#aRulesTitle').textContent=currentArrangementSegment()?'分段 '+(aSelectedSegment+1):'分段设置';
  }
  function paintArrangementSegments() {
    paintArrangementNavigation();const s=currentArrangementSegment();
    if(!s){$('#aSegments').innerHTML='<div class="a-empty">先添加分段，再设置关卡条件。</div>';return;}
    const r={...WPArrangement.DEFAULT_RULES,...s.rules};
    const turns='<option value=""'+(r.maxTurns===null?' selected':'')+'>不限</option>'+Array.from({length:7},(_,n)=>'<option value="'+n+'"'+(r.maxTurns===n?' selected':'')+'>'+n+' 拐</option>').join('');
    $('#aSegments').innerHTML='<div class="a-form-grid">'+
      '<label>起始关号<input data-seg="from" type="number" min="1" max="10000" value="'+s.from+'"></label><label>结束关号<input data-seg="to" type="number" min="1" max="10000" value="'+s.to+'"></label></div>'+
      '<div class="a-field-heading">来源关卡库</div><button type="button" id="aChoosePools" class="a-picker-button"><span id="aPoolSummary"></span><span>选择 ›</span></button>'+
      '<div class="a-form-grid"><label>棋盘尺寸<select data-seg="size">'+sizeOptions(s.width,s.height)+'</select></label><label>目标词数<input data-seg="targetCount" type="number" min="1" value="'+s.targetCount+'"></label></div>'+
      '<div class="a-override-note"><span id="aOverrideNote"></span><button type="button" data-segment-fill>重置单独设置</button></div>'+
      '<div class="a-rule-heading">拐弯限制</div><div class="a-form-grid"><label>每词最多<select data-rule="maxTurns">'+turns+'</select></label><label>多拐词数上限<input data-rule="multiTurnLimit" type="number" min="0" placeholder="不限" value="'+(r.multiTurnLimit??'')+'"></label></div>'+
      '<div class="a-rule-heading">重复必答词</div><div class="a-form-grid"><label>中间至少隔几关<input data-rule="repeatGap" type="number" min="0" max="99999" value="'+r.repeatGap+'"></label><label>处理方式<select data-rule="repeatMode">'+modeOptions(r.repeatMode)+'</select></label></div>'+
      '<p class="a-help">0 表示关闭；跨分段连续统计。</p>'+
      '<div class="a-rule-heading">字母密度</div><button type="button" id="aEditDensity" class="a-picker-button"><span id="aDensitySummary"></span><span>编辑 ›</span></button>'+
      '<p class="a-help">必含字母按正式关号自动读取，可在右侧逐关查看。</p>';
    paintArrangementRuleSummaries();lockArrangement(!!arrangeRun);
  }
  function paintArrangementRuleSummaries() {
    const s=currentArrangementSegment();if(!s||!$('#aPoolSummary'))return;
    const names=s.poolIds.map(id=>workflowPools.find(p=>p.id===id)?.name||'未找到关卡库');
    $('#aPoolSummary').textContent=names.length?names.join('、'):'请选择来源关卡库';$('#aPoolSummary').title=names.join('、');
    const r={...WPArrangement.DEFAULT_RULES,...s.rules},count=Object.keys(r.densityCaps||{}).length;
    $('#aDensitySummary').textContent=r.densityWindow+' 关窗口 · '+(count?'限制 '+count+' 个字母 · '+(r.densityMode==='soft'?'扣分':'严格'):'各字母不限');
    $('#aOverrideNote').textContent=arrangementOverrideCount(s)+' 关已单独设置';
    $('[data-segment-fill]').disabled=!!arrangeRun||!arrangementOverrideCount(s);
  }
  function readArrangementForm() {
    if(!arrangementDraft)return null;
    arrangementDraft.name=$('#aName').value.trim()||'排布关序';arrangementDraft.seed=$('#aSeed').value;arrangementDraft.budget=Number($('#aBudget').value);
    const s=currentArrangementSegment(),card=$('#aSegments');if(!s||!card.querySelector('[data-seg]'))return arrangementDraft;
    const get=key=>card.querySelector('[data-seg="'+key+'"]'),rule=key=>card.querySelector('[data-rule="'+key+'"]');
    const [width,height]=get('size').value.split('x').map(Number);
    Object.assign(s,{from:Number(get('from').value),to:Number(get('to').value),width,height,targetCount:Number(get('targetCount').value)});
    const effective={...WPArrangement.DEFAULT_RULES,...s.rules},values={maxTurns:rule('maxTurns').value===''?null:Number(rule('maxTurns').value),
      multiTurnLimit:rule('multiTurnLimit').value===''?null:Number(rule('multiTurnLimit').value),repeatGap:Number(rule('repeatGap').value),repeatMode:rule('repeatMode').value};
    // Merely visiting a segment must not rewrite omitted default fields and
    // invalidate an otherwise current preview.
    for(const [key,value] of Object.entries(values))if(effective[key]!==value)s.rules={...s.rules,[key]:value};
    return arrangementDraft;
  }
  function arrangementChanged() {
    if(arrangeRun)return;readArrangementForm();persistArrangementDraft();paintArrangementRuleSummaries();paintArrangementPreview();
  }
  function displaySlots() {
    // Keep invalid field values editable. The engine still validates the complete
    // draft before enabling a run; this projection is only for the form/table.
    const rows=new Map();
    for(const s of arrangementDraft.segments.slice().sort((a,b)=>a.from-b.from)){
      if(!Number.isSafeInteger(s.from)||!Number.isSafeInteger(s.to)||s.from<1||s.to<s.from||s.to>10000)continue;
      for(let number=s.from;number<=s.to;number++)if(!rows.has(number)){
        const override=arrangementDraft.overrides?.[number]||{},letters=number<=1000?arrangementDraft.requiredLetters?.levels[number]||'':'';
        rows.set(number,{number,width:override.width??s.width,height:override.height??s.height,targetCount:override.targetCount??s.targetCount,
          poolIds:s.poolIds,rules:{...WPArrangement.DEFAULT_RULES,...s.rules},requiredLetters:[...new Set(String(letters))].sort().join(''),segmentId:s.id||String(s.from)});
      }
    }
    return [...rows.values()];
  }
  function arrangementSlots() { try{return displaySlots();}catch(error){return [];} }
  function filteredArrangementSlots(slots=arrangementSlots()) {
    const s=currentArrangementSegment(),scope=$('#aScope').value,filter=$('#aFilter').value;
    return slots.filter(slot=>(scope!=='segment'||s&&slot.number>=s.from&&slot.number<=s.to)&&
      (filter==='all'||filter==='overrides'&&Object.hasOwn(arrangementDraft.overrides||{},slot.number)||filter==='gaps'&&arrangementPreview?.result.rows[slot.number-1]&&!arrangementPreview.result.rows[slot.number-1].choice));
  }
  function arrangementRowStatus(row,active) {
    if(!row)return '<span class="a-status neutral">未排布</span>';
    const label=row.choice?'已匹配':aReasonLabels[row.reason]||'尚未匹配',tone=!active?'stale':row.choice?'matched':['static','temporal'].includes(row.reason)?'gap':'pending';
    return '<span class="a-status '+tone+'">'+(!active?'旧结果 · ':'')+label+'</span>';
  }
  function validateArrangementForm() {
    let error='';
    try{WPArrangement.expand(arrangementDraft);const missing=arrangementDraft.segments.flatMap(s=>s.poolIds).find(id=>!workflowPools.some(p=>p.id===id));if(missing)throw new Error('来源关卡库不存在，请重新选择：'+missing);}
    catch(e){error=e.message;}
    $('#aConfigError').textContent=error;$('#aConfigError').hidden=!error;$('#aRun').disabled=!!arrangeRun||!!error;return error;
  }
  function paintArrangementSlots() {
    if(!arrangementDraft)return;
    const slots=arrangementSlots(),error=validateArrangementForm();
    const visible=filteredArrangementSlots(slots),pages=Math.max(1,Math.ceil(visible.length/50)),active=arrangementPreviewActive();
    aResultPage=Math.max(0,Math.min(aResultPage,pages-1));const page=visible.slice(aResultPage*50,aResultPage*50+50);
    $('#aResultPage').textContent=(aResultPage+1)+' / '+pages+' · '+visible.length+' 关';
    $('#aResultPrev').disabled=!aResultPage;$('#aResultNext').disabled=aResultPage+1>=pages;
    $('#aSlots tbody').innerHTML=page.map(slot=>{
      const row=arrangementPreview?.result.rows[slot.number-1],override=Object.hasOwn(arrangementDraft.overrides||{},slot.number),open=aOpenRow===slot.number;
      const count=row?row.candidateCount:'—',disabled=arrangeRun?' disabled':'';
      return '<tr data-slot="'+slot.number+'" data-arrange-number="'+slot.number+'" class="'+(open?'a-row-open':'')+'"><td><button class="a-row-toggle" type="button" data-row-detail="'+slot.number+'" aria-expanded="'+open+'" aria-label="查看第 '+slot.number+' 关详情">'+(open?'▾ ':'▸ ')+slot.number+'</button>'+
        '<span class="a-override-badge"'+(override?'':' hidden')+'>单独设置</span></td><td><select data-slot-field="size" aria-label="第 '+slot.number+' 关尺寸"'+disabled+'>'+sizeOptions(slot.width,slot.height)+'</select></td>'+
        '<td><input data-slot-field="targetCount" aria-label="第 '+slot.number+' 关目标词数" type="number" min="1" value="'+slot.targetCount+'"'+disabled+'></td>'+
        '<td class="a-letters">'+esc(slot.requiredLetters.split('').join(' ')||'—')+'</td><td title="'+(active?'':'上次预览：')+'符合单关条件的去重库存数，尚未考虑重复词间隔和字母密度">'+count+'</td>'+
        '<td>'+emotionScoreHtml(row?.choice?.emotion)+'</td><td>'+arrangementRowStatus(row,active)+'<button type="button" class="a-reset-row" data-reset-slot="'+slot.number+'"'+(override?'':' hidden')+disabled+'>恢复分段设置</button></td></tr>'+
        (open?'<tr class="a-detail-row"><td colspan="7" id="aRowDetail">'+arrangementDetailHtml(slot,row)+'</td></tr>':'');
    }).join('')||'<tr><td colspan="7" class="a-empty">'+(error?'先修正左侧配置，即可查看逐关条件。':$('#aFilter').value==='gaps'&&!arrangementPreview?'预览排布后，可以在这里筛选缺口。':'这个范围没有符合筛选条件的关卡。')+'</td></tr>';
    if(aOpenRow&&page.some(s=>s.number===aOpenRow))loadArrangementDetail(aOpenRow);
    $('#aJump').max=slots.length||10000;
  }
  function arrangementDetailHtml(slot,row) {
    const r=slot.rules,old=!!arrangementPreview&&!arrangementPreviewActive();
    const requirements='<div><b>当前要求</b><p>'+slot.width+'×'+slot.height+' · '+slot.targetCount+' 词 · '+(r.maxTurns===null?'拐弯不限':'每词最多 '+r.maxTurns+' 拐')+(r.multiTurnLimit===null?'':' · 多拐词 ≤ '+r.multiTurnLimit)+'</p><p>必含字母：'+(slot.requiredLetters.split('').join(' ')||'不限')+'；重复词至少隔 '+r.repeatGap+' 关。</p></div>';
    if(!row)return requirements+'<p class="note">尚未排布，点击底部“预览整套关序”查看匹配结果。</p>';
    const oldNote=old?'<p class="a-stale-note">下面是上次预览的结果，当前条件已修改，需要重新排布。</p>':'';
    if(!row.choice)return oldNote+requirements+'<p class="a-gap-detail">'+(aReasonDetails[row.reason]||'本次尚未匹配。')+'</p><p>符合单关条件的库存：'+row.candidateCount+' 关。缺位保留关号。</p>';
    const key=row.choice.poolId+'|'+row.choice.id,entry=aDetailCache.get(key);
    if(!entry)return oldNote+requirements+'<p class="note">正在读取棋盘…</p>';
    if(entry.error)return oldNote+requirements+'<p class="bad">'+esc(entry.error)+'</p>';
    const lv=WPLevelPool.parseGame(entry.game),board='<div class="inventory-board" style="grid-template-columns:repeat('+lv.width+',1fr)">'+lv.grid.map((c,i)=>'<span>'+c+'<small>'+lv.counts[i]+'</small></span>').join('')+'</div>';
    const name=workflowPools.find(p=>p.id===row.choice.poolId)?.name||row.choice.poolId;
    return oldNote+'<div class="a-level-detail">'+board+'<div><b>'+esc(name)+'</b><p>必答：'+esc(entry.game.t)+'</p><p class="note">'+entry.metrics.perWord.map(w=>esc(w.word)+' '+w.turns+' 拐').join(' · ')+'</p><details><summary>额外词（'+lv.extras.length+'）</summary><p>'+esc(entry.game.e||'无')+'</p></details><button type="button" data-arrange-preview="'+slot.number+'">查看／试玩</button></div></div>'+emotionBreakdownHtml(entry.game)+requirements;
  }
  async function loadArrangementDetail(number) {
    const preview=arrangementPreview,row=preview?.result.rows[number-1];if(!row?.choice)return;
    const key=row.choice.poolId+'|'+row.choice.id;if(aDetailCache.has(key))return;
    try{const entry=await poolStore.getEntry(row.choice.poolId,row.choice.id);aDetailCache.set(key,entry||{error:'库存关卡已不存在'});}catch(error){aDetailCache.set(key,{error:error.message});}
    if(aOpenRow===number&&arrangementPreview===preview&&$('#aRowDetail')){const slot=arrangementSlots().find(s=>s.number===number);if(slot)$('#aRowDetail').innerHTML=arrangementDetailHtml(slot,row);}
  }
  function paintArrangementPreview(options={}) {
    if(!arrangementDraft)return;
    const preview=arrangementPreview,active=arrangementPreviewActive(),total=Math.max(0,...arrangementDraft.segments.map(s=>s.to));
    $('#aApply').disabled=!!arrangeRun||!active||!preview?.result.audit.ok||preview?.result.status!=='complete';
    $('#aPreviewState').textContent=arrangeRun?'正在排布':!preview?'尚未预览':!active?'预览待更新':preview.result.status==='complete'?'已通过复核':'存在缺口';
    $('#aPreviewState').className='a-status '+(arrangeRun?'pending':!preview?'neutral':!active?'stale':preview.result.status==='complete'?'matched':'gap');
    $('#aSummary').textContent=preview?(active?'':'上次预览 · ')+preview.result.audit.filled+' / '+preview.result.audit.total+' 关已匹配 · 缺口 '+(preview.result.audit.total-preview.result.audit.filled)+' · 扣分项 '+preview.result.audit.soft.length:total+' 个排布位置 · 先配置条件，再预览整套关序';
    $('#aPreviewNotice').hidden=!preview||active;$('#aPreviewNotice').textContent='条件或情绪评分规则已更新，表内结果来自上次预览。重新排布后才能应用。';
    $('#aPreviewSeed').textContent=preview?'本次预览种子：'+preview.result.seed:'';
    paintArrangementNavigation();
    if(options.table!==false)paintArrangementSlots();
    else{
      validateArrangementForm();
      for(const row of document.querySelectorAll('#aSlots [data-slot]'))row.querySelector('.a-status').outerHTML=arrangementRowStatus(preview?.result.rows[Number(row.dataset.slot)-1],active);
    }
    if(aViewTab==='stats')paintArrangementStats();lockArrangement(!!arrangeRun);paintArrangementRuleSummaries();
  }
  function paintArrangementStats() {
    const result=arrangementPreview?.result,body=$('#aStatsBody');
    if(!result){body.innerHTML='<div class="a-empty">预览排布后，这里显示整套关序的拐弯、重复词和字母密度统计。</div>';return;}
    const audit=result.audit,turns=[audit.turnCounts[0],audit.turnCounts[1],audit.turnCounts.multi],sum=turns.reduce((a,b)=>a+b,0)||1;
    const go=n=>'<button type="button" class="a-stat-jump" data-jump-slot="'+n+'">第 '+n+' 关 ↗</button>';
    const repeats=audit.repeats||[],soft=audit.soft||[];
    const turnBars=['直线','一拐','二拐及以上'].map((name,i)=>'<div class="a-stat-bar"><span>'+name+'</span><i><b style="width:'+100*turns[i]/sum+'%"></b></i><strong>'+turns[i]+' 词</strong></div>').join('');
    const violations=soft.slice(0,100).map(v=>'<li>'+go(v.number)+(v.type==='repeat'?esc(v.word)+' 上次在第 '+v.last+' 关出现':v.letter+' 在窗口内出现 '+v.count+' 关，上限 '+v.cap)+'</li>').join('');
    const repeated=repeats.slice(0,100).map(v=>'<li>'+go(v.number)+esc(v.word)+' · 上次第 '+v.last+' 关 · 间隔 '+v.gap+' 关 / 要求 '+v.requiredGap+' 关</li>').join('');
    const page=filteredArrangementSlots().slice(aResultPage*50,aResultPage*50+50);
    const density=page.map(slot=>{const d=audit.density[slot.number-1];return '<tr><td>'+go(slot.number)+'</td><td>'+(d?d.window:'—')+'</td><td>'+(d?Object.entries(d.counts).sort().map(([c,n])=>c+': '+n).join(' · '):'缺位，不计入窗口统计')+'</td></tr>';}).join('');
    const emotion=audit.emotion,emotionStats='<section class="a-stat-section"><h4>关卡情绪分</h4><p>必答词分数之和 + 额外词分数之和 × 0.5</p>'+(emotion?'<p>已匹配关卡总分 <b>'+emotionNumber(emotion.total)+'</b> · 平均 '+emotionNumber(emotion.average)+' · 最低 '+emotionNumber(emotion.min)+' · 最高 '+emotionNumber(emotion.max)+'</p><p>正分 '+emotion.positive+' 关 · 零分 '+emotion.neutral+' 关 · 负分 '+emotion.negative+' 关</p>'+(emotion.missingWords?'<p class="note">'+emotion.missingWords+' 个词次缺少情绪标注，按 0 分计。</p>':''):'<p class="note">旧预览尚无情绪统计，请重新排布。</p>')+'<p class="note">优先级：硬性条件 → 重复词／字母密度避让 → 情绪分。优先保证关号匹配；同分保留稀缺性和种子排序。</p></section>';
    body.innerHTML='<p class="note">整套关序统计 · 跨分段连续计算 · 已检查 '+result.checks.toLocaleString()+' 次候选</p>'+emotionStats+'<section class="a-stat-section"><h4>必答词拐弯</h4>'+turnBars+'</section>'+
      '<section class="a-stat-section"><h4>规则复核</h4><p>'+(audit.errors.some(e=>e.type!=='missing')?'存在严格规则冲突':'已匹配关卡通过严格规则')+' · 缺口 '+(audit.total-audit.filled)+' 关</p><button type="button" id="aStatsGaps">查看全部缺口</button>'+
      '<h4>扣分避让 · '+soft.length+' 项</h4>'+(soft.length?'<ul>'+violations+'</ul>'+(soft.length>100?'<p class="note">显示前 100 项。</p>':''):'<p class="note">未触发扣分规则。</p>')+'</section>'+
      '<section class="a-stat-section"><h4>重复必答词 · '+repeats.length+' 次</h4>'+(repeats.length?'<ul>'+repeated+'</ul>'+(repeats.length>100?'<p class="note">显示前 100 次。</p>':''):'<p class="note">没有重复必答词。</p>')+'</section>'+
      '<section class="a-stat-section"><h4>本页逐关字母密度</h4><p class="note">与关序表当前筛选和页码一致；同一字母每关只计一次。</p><table><thead><tr><th>关号</th><th>窗口</th><th>字母出现关数</th></tr></thead><tbody>'+density+'</tbody></table></section>';
  }
  function setArrangementTab(tab) {
    aViewTab=tab;$('#aLevelView').hidden=tab!=='levels';$('#aStatsView').hidden=tab!=='stats';
    for(const button of document.querySelectorAll('[data-arrange-tab]')){const selected=button.dataset.arrangeTab===tab;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    if(tab==='stats')paintArrangementStats();
  }
  function jumpArrangementSlot(number) {
    const slots=arrangementSlots();if(!Number.isSafeInteger(number)||!slots.some(s=>s.number===number)){toast('请输入当前关序中的有效关号');return;}
    $('#aScope').value='all';$('#aFilter').value='all';aResultPage=Math.floor(slots.findIndex(s=>s.number===number)/50);aOpenRow=number;
    aSelectedSegment=arrangementDraft.segments.findIndex(s=>number>=s.from&&number<=s.to);paintArrangementSegments();setArrangementTab('levels');paintArrangementSlots();
    const row=$('#aSlots [data-slot="'+number+'"]');row?.scrollIntoView({block:'nearest'});row?.querySelector('[data-row-detail]')?.focus({preventScroll:true});
  }
  function selectArrangementSegment(index) {
    if(!arrangeRun)readArrangementForm();aSelectedSegment=index;aOpenRow=null;
    $('#aScope').value='segment';aResultPage=0;paintArrangementSegments();paintArrangementPreview();
  }
  function openArrangementDialog(id) { const dialog=$('#'+id);if(!dialog.open)dialog.showModal(); }
  function closeArrangementDialogs() { for(const dialog of document.querySelectorAll('#arrange dialog[open]'))dialog.close(); }
  function showArrangementPools() {
    const s=currentArrangementSegment();if(!s||arrangeRun)return;aDialogSegment=s;
    const available=workflowPools.slice();for(const id of s.poolIds)if(!available.some(p=>p.id===id))available.push({id,name:'未找到关卡库：'+id,count:0});
    $('#aPoolSearch').value='';$('#aPoolChoices').innerHTML=available.map(p=>'<label data-pool-search="'+esc(p.name.toLowerCase())+'"><input type="checkbox" data-seg-pool value="'+esc(p.id)+'"'+(s.poolIds.includes(p.id)?' checked':'')+'><span>'+esc(p.name)+'</span><small>'+p.count.toLocaleString()+' 关</small></label>').join('')||'<p class="note">请先在关卡生成中创建或导入关卡库。</p>';
    openArrangementDialog('aPoolPicker');
  }
  function showArrangementDensity() {
    const s=currentArrangementSegment();if(!s||arrangeRun)return;aDialogSegment=s;
    const r={...WPArrangement.DEFAULT_RULES,...s.rules};$('#aDensityWindow').value=r.densityWindow;$('#aDensityMode').value=r.densityMode;$('#aDensityError').textContent='';
    $('#aDensityGrid').innerHTML=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c=>'<label>'+c+'<input type="number" min="0" data-density="'+c+'" aria-label="'+c+' 出现关数上限" placeholder="不限" value="'+(r.densityCaps?.[c]??'')+'"></label>').join('');
    openArrangementDialog('aDensityEditor');
  }
  async function loadArrangementView() {
    if(!arrangementDraft){try{arrangementDraft=planFromCampaign();}catch(error){arrangementDraft=planFromCampaign([]);toast('当前关序无法直接提取配置：'+error.message+'。已准备空白排布方案。');}}
    $('#aName').value=arrangementDraft.name||'排布关序';$('#aSeed').value=arrangementDraft.seed;$('#aBudget').value=arrangementDraft.budget;
    paintSeedControls('arrangement');paintArrangementSegments();paintArrangementPreview();
  }
  async function openArrangement() {
    if(!ours())return;
    try{await workflowReady;await refreshPools();await refreshSeedHistory();await loadArrangementView();$('#arrange').hidden=false;$('#aName').focus({preventScroll:true});}
    catch(error){toast('排布工具无法打开：'+error.message);}
  }
  function lockArrangement(locked) {
    const selectors='#aSegments input,#aSegments select,#aSegments button,#aName,#aAddSegment,#aAddSegmentCompact,#aDuplicateSegment,#aDeleteSegment,#aFromCurrent,#aImport,#aExport,#aSeedMode,#aRunSettingsOpen,#aSeed,#aSeedHistory,#aBudget,#aRetry';
    for(const el of document.querySelectorAll(selectors))el.disabled=locked;
    $('#aDuplicateSegment').disabled=locked||!currentArrangementSegment();$('#aDeleteSegment').disabled=locked||!currentArrangementSegment();
    $('#aStop').disabled=!locked;$('#aStop').hidden=!locked;$('#aRun').hidden=locked;
  }
  async function runArrangement() {
    if(arrangeRun)return;
    closeArrangementDialogs();
    let plan;
    try{readArrangementForm();plan=workflowClone(arrangementDraft);WPArrangement.expand(plan);for(const id of new Set(plan.segments.flatMap(s=>s.poolIds)))if(!workflowPools.some(p=>p.id===id))throw new Error('来源关卡库不存在：'+id);plan.seed=seedForRun('arrangement');arrangementDraft.seed=plan.seed;plan.ranking={version:WPArrangement.RANKING_VERSION,emotionVersion:WPEmotion.version,extraWeight:.5};arrangementDraft.ranking=workflowClone(plan.ranking);}
    catch(error){toast(error.message);return;}
    const run={plan,cancel:false,worker:null,url:null};arrangeRun=run;arrangementPreview=null;window.__lastArrangement=null;
    run.seedHistoryId=beginSeedRecord('arrangement',plan.seed,plan.name,WPArrangement.expand(plan).length);
    lockArrangement(true);paintArrangementPreview();$('#aProgress').textContent='正在读取关卡库摘要…';
    try{
      await saveSeedRecord('arrangement',run.seedHistoryId);await workflowSave('seedModes',seedModes);
      await workflowSave('arrangement',plan);await workflowSave('arrangementPreview',null);
      const entries=await poolStore.summaries(plan.segments.flatMap(s=>s.poolIds));
      const progress=p=>{$('#aProgress').textContent=p.phase==='index'?'建立候选索引 '+p.prepared+' / '+p.total:'已检查 '+p.checks.toLocaleString()+' / '+p.budget.toLocaleString()+' 次 · 已匹配 '+p.filled+' / '+p.total;};
      let result;
      if(typeof Worker==='function'){
        result=await new Promise((resolve,reject)=>{
          run.url=URL.createObjectURL(new Blob([JSON.parse($('#arrangementWorker').textContent)],{type:'text/javascript'}));run.worker=new Worker(run.url);
          run.worker.onmessage=({data})=>{if(data.type==='progress')progress(data.progress);else if(data.type==='result')resolve(data.result);else if(data.type==='error')reject(new Error(data.message));};
          run.worker.onerror=event=>{event.preventDefault();reject(new Error(event.message||'排布线程异常'));};
          run.worker.postMessage({type:'arrange',plan,entries});if(run.cancel)run.worker.postMessage({type:'cancel'});
        });
      }else{
        const iterator=WPArrangement.solveSteps(plan,entries,{cancelled:()=>run.cancel});let step;
        do{step=iterator.next();if(!step.done){progress(step.value);await workflowPause();}}while(!step.done);result=step.value;
      }
      arrangementPreview={planKey:arrangementKey(plan),plan,result};run.result=result;
      await workflowSave('arrangementPreview',arrangementPreview);aResultPage=0;aOpenRow=null;aDetailCache.clear();
      $('#aProgress').textContent=result.status==='complete'?'排布完成，全部关号复核通过。':result.status==='cancelled'?'已中止，保留当前预览。':'本次预览存在缺位，可调整配置或补充库存后重试。';
    }catch(error){run.error=error.message;$('#aProgress').textContent='排布失败：'+error.message;toast(error.message);}
    finally{
      run.worker?.terminate();if(run.url)URL.revokeObjectURL(run.url);
      await finishSeedRecord('arrangement',run.seedHistoryId,{status:run.error?'error':run.result?.status||'cancelled',matched:run.result?.audit.filled||0,error:run.error||null}).catch(error=>toast('种子历史保存失败：'+error.message));
      arrangeRun=null;lockArrangement(false);paintArrangementSlots();paintArrangementPreview();window.__lastArrangement=run.result||null;
    }
  }
  function campaignArrangementAudit(camp=campaign) {
    if(!camp.arrangement)return null;
    try{
      const slots=WPArrangement.expand(camp.arrangement.plan);
      if(camp.levels.length!==slots.length)return {ok:false,errors:[{message:'关卡数量与绑定的排布方案不一致'}]};
      const selected=camp.levels.map((d,i)=>{
        const n=d.gen?.sig===genSig(d)?d.gen.n:nOf(d),game={g:Array.from({length:d.H},(_,y)=>d.letters.slice(y*d.W,(y+1)*d.W).join('')).join(','),t:d.words.join(' '),n,e:d.extras.join(' '),curtains:d.curtains};
        const key=JSON.stringify([game.g,game.t,game.e,game.n,game.curtains,WPEmotion.version]);let cached=arrangementMetrics.get(d);
        if(cached?.key!==key){cached={key,metrics:WPLevelPool.analyze(game)};arrangementMetrics.set(d,cached);}
        return {id:d.arrangement?.entryId||'',poolId:d.arrangement?.poolId||'',playKey:WPLevelPool.hash(WPLevelPool.stable([game.g,cached.metrics.targets])),...cached.metrics};
      });
      return WPArrangement.verify(slots,selected);
    }catch(error){return {ok:false,errors:[{message:'排布规则复核失败：'+error.message}]};}
  }
  async function applyArrangement() {
    const preview=arrangementPreview;
    if(!arrangementPreviewActive()||preview.result.status!=='complete'||!preview.result.audit.ok)throw new Error('请先按当前规则完成全部关号的排布');
    const owner=campaign,ownerKey=JSON.stringify(campaignSnap()),slots=WPArrangement.expand(preview.plan),entries=[];
    for(const [i,row] of preview.result.rows.entries()){const entry=await poolStore.getEntry(row.choice.poolId,row.choice.id);if(!entry)throw new Error('第 '+row.number+' 关库存已不存在');entries.push(entry);if(i%25===0)await workflowPause();}
    const snapshots=await poolStore.getSnapshots(entries.map(e=>e.librarySnapshotId)),indices=new Map();
    for(const [i,entry] of entries.entries()){WPLevelPool.importRecord(entry,snapshots,indices);if(i%25===0)await workflowPause();}
    const audit=WPArrangement.verify(slots,entries.map(WPLevelPool.summary));if(!audit.ok)throw new Error('排布复核失败：'+audit.errors[0].message);
    if(campaign!==owner||JSON.stringify(campaignSnap())!==ownerKey||!arrangementPreviewActive()||!ours())throw new Error('关序或方案已改变，请重新确认应用');
    const levels=entries.map((entry,i)=>{
      const game={...entry.game,id:String(i+1),name:'第 '+(i+1)+' 关'},d=normalizeDraft(C.fromLevel(game));d.librarySnapshotId=entry.librarySnapshotId;
      d.gen={sig:genSig(d),n:game.n,searchVersion:entry.generation?.engine||'inventory-v1'};d.arrangement={poolId:entry.poolId,entryId:entry.id,number:i+1};
      return d;
    });
    snapshot();campaign={name:preview.plan.name,index:0,levels,pack:null,librarySnapshots:snapshots,arrangement:{schemaVersion:1,plan:workflowClone(preview.plan)}};currentFile=null;levelView='list';boardKey='';suggCache=null;
    ensureCampaignLibraries(campaign);await persist();render();$('#arrange').hidden=true;toast('已应用 '+levels.length+' 关，关卡库保持不变');
  }
  function wireArrangement() {
    $('#arrange').addEventListener('keydown',e=>{
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z')e.stopPropagation();
      if(e.key==='Tab'&&!document.querySelector('#arrange dialog[open]')&&$('#modal').hidden){
        const items=[...$('#arrange').querySelectorAll('input,select,button,summary,[tabindex="0"]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
        if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}
      }
    });
    $('#btnArrange').onclick=()=>openArrangement();
    $('#aClose').onclick=()=>{closeArrangementDialogs();$('#arrange').hidden=true;$('#btnArrange').focus({preventScroll:true});};
    $('#aAddSegment').onclick=()=>{
      if(arrangeRun)return;readArrangementForm();const from=Math.max(0,...arrangementDraft.segments.map(s=>s.to))+1;
      if(!Number.isSafeInteger(from)||from>10000){toast('请先修正分段范围；关序最多 10000 关');return;}
      arrangementDraft.segments.push({id:'segment-'+newId(),from,to:Math.min(10000,from+99),width:3,height:3,targetCount:3,poolIds:poolSelected?[poolSelected]:[],rules:workflowClone(WPArrangement.DEFAULT_RULES)});
      aSelectedSegment=arrangementDraft.segments.length-1;$('#aScope').value='segment';aResultPage=0;paintArrangementSegments();persistArrangementDraft();paintArrangementPreview();
    };
    $('#aAddSegmentCompact').onclick=()=>$('#aAddSegment').click();
    $('#aDuplicateSegment').onclick=()=>{
      if(arrangeRun)return;readArrangementForm();const s=currentArrangementSegment(),from=Math.max(0,...arrangementDraft.segments.map(s=>s.to))+1;
      if(!s||!Number.isSafeInteger(from)||from>10000){toast('关序最多 10000 关');return;}
      arrangementDraft.segments.push({...workflowClone(s),id:'segment-'+newId(),from,to:Math.min(10000,from+Math.max(0,s.to-s.from))});
      aSelectedSegment=arrangementDraft.segments.length-1;$('#aScope').value='segment';aResultPage=0;paintArrangementSegments();persistArrangementDraft();paintArrangementPreview();
    };
    $('#aDeleteSegment').onclick=()=>{
      if(arrangeRun)return;readArrangementForm();arrangementDraft.segments.splice(aSelectedSegment,1);aOpenRow=null;aResultPage=0;
      paintArrangementSegments();persistArrangementDraft();paintArrangementPreview();
    };
    $('#aSegmentList').onclick=e=>{const button=e.target.closest('[data-select-segment]');if(button)selectArrangementSegment(Number(button.dataset.selectSegment));};
    $('#aSegmentSelect').onchange=e=>selectArrangementSegment(Number(e.target.value));
    $('#aFromCurrent').onclick=()=>{try{arrangementDraft=planFromCampaign();arrangementPreview=null;resetArrangementView();setSeedMode('arrangement','auto');workflowSave('seedModes',seedModes);loadArrangementView();persistArrangementDraft();workflowSave('arrangementPreview',null);}catch(error){toast(error.message);}};
    $('#aSegments').addEventListener('input',()=>arrangementChanged());
    $('#aSegments').onclick=e=>{
      if(arrangeRun)return;
      if(e.target.closest('#aChoosePools')){showArrangementPools();return;}
      if(e.target.closest('#aEditDensity')){showArrangementDensity();return;}
      if(e.target.closest('[data-segment-fill]')){
        readArrangementForm();const s=currentArrangementSegment();if(!s)return;
        for(const key of Object.keys(arrangementDraft.overrides||{}))if(Number(key)>=s.from&&Number(key)<=s.to)delete arrangementDraft.overrides[key];
        persistArrangementDraft();paintArrangementPreview();
      }
    };
    $('#aPoolSearch').oninput=e=>{const query=e.target.value.trim().toLowerCase();for(const row of document.querySelectorAll('[data-pool-search]'))row.hidden=!row.dataset.poolSearch.includes(query);};
    $('#aPoolApply').onclick=()=>{
      if(arrangeRun||!aDialogSegment||!arrangementDraft.segments.includes(aDialogSegment))return;
      aDialogSegment.poolIds=[...document.querySelectorAll('#aPoolChoices [data-seg-pool]:checked')].map(el=>el.value);
      $('#aPoolPicker').close();persistArrangementDraft();paintArrangementPreview();
    };
    $('#aDensityApply').onclick=()=>{
      if(arrangeRun||!aDialogSegment||!arrangementDraft.segments.includes(aDialogSegment))return;
      const caps={};for(const el of document.querySelectorAll('#aDensityGrid [data-density]'))if(el.value.trim()!=='')caps[el.dataset.density]=Number(el.value);
      try{aDialogSegment.rules=WPArrangement.rules({...aDialogSegment.rules,densityWindow:Number($('#aDensityWindow').value),densityMode:$('#aDensityMode').value,densityCaps:caps});}
      catch(error){$('#aDensityError').textContent=error.message;return;}
      $('#aDensityEditor').close();persistArrangementDraft();paintArrangementPreview();
    };
    $('#aDensityClear').onclick=()=>{for(const el of document.querySelectorAll('#aDensityGrid input'))el.value='';};
    $('#aSlots').addEventListener('input',e=>{
      const row=e.target.closest('[data-slot]');if(!row||arrangeRun||!e.target.matches('[data-slot-field]'))return;
      const [width,height]=row.querySelector('[data-slot-field="size"]').value.split('x').map(Number);
      arrangementDraft.overrides??={};arrangementDraft.overrides[row.dataset.slot]={width,height,targetCount:Number(row.querySelector('[data-slot-field="targetCount"]').value)};
      row.querySelector('.a-override-badge').hidden=false;row.querySelector('.a-reset-row').hidden=false;
      persistArrangementDraft();paintArrangementPreview({table:false});
    });
    $('#aSlots').onclick=e=>{
      const reset=e.target.closest('[data-reset-slot]');if(reset&&!arrangeRun){delete arrangementDraft.overrides[reset.dataset.resetSlot];persistArrangementDraft();paintArrangementPreview();return;}
      const preview=e.target.closest('[data-arrange-preview]');if(preview){const choice=arrangementPreview?.result.rows[Number(preview.dataset.arrangePreview)-1]?.choice;if(choice)previewInventory(choice.poolId,choice.id);return;}
      if(e.target.closest('input,select,a,summary')||e.target.closest('.a-detail-row'))return;
      const row=e.target.closest('[data-slot]');if(row){const number=Number(row.dataset.slot);aOpenRow=aOpenRow===number?null:number;paintArrangementSlots();}
    };
    for(const id of ['aName','aSeed','aBudget'])$('#'+id).addEventListener('input',()=>arrangementChanged());
    for(const id of ['aScope','aFilter'])$('#'+id).onchange=()=>{aResultPage=0;aOpenRow=null;paintArrangementSlots();if(aViewTab==='stats')paintArrangementStats();};
    for(const button of document.querySelectorAll('[data-arrange-tab]'))button.onclick=()=>setArrangementTab(button.dataset.arrangeTab);
    $('#aTabs').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setArrangementTab(e.key==='Home'?'levels':e.key==='End'?'stats':aViewTab==='levels'?'stats':'levels');document.querySelector('[data-arrange-tab][aria-selected="true"]').focus();}};
    for(const button of document.querySelectorAll('[data-arrange-mobile]'))button.onclick=()=>{$('#arrange').dataset.mobilePane=button.dataset.arrangeMobile;for(const b of document.querySelectorAll('[data-arrange-mobile]'))b.setAttribute('aria-pressed',String(b===button));};
    $('#aJumpGo').onclick=()=>jumpArrangementSlot(Number($('#aJump').value));$('#aJump').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();jumpArrangementSlot(Number(e.target.value));}};
    $('#aResultPrev').onclick=()=>{aResultPage--;aOpenRow=null;paintArrangementSlots();if(aViewTab==='stats')paintArrangementStats();};
    $('#aResultNext').onclick=()=>{aResultPage++;aOpenRow=null;paintArrangementSlots();if(aViewTab==='stats')paintArrangementStats();};
    $('#aStatsBody').onclick=e=>{const jump=e.target.closest('[data-jump-slot]');if(jump)jumpArrangementSlot(Number(jump.dataset.jumpSlot));if(e.target.closest('#aStatsGaps')){$('#aScope').value='all';$('#aFilter').value='gaps';aResultPage=0;setArrangementTab('levels');paintArrangementSlots();}};
    $('#aRunSettingsOpen').onclick=()=>openArrangementDialog('aRunSettings');
    for(const button of document.querySelectorAll('[data-arrange-dialog-close]'))button.onclick=()=>button.closest('dialog').close();
    $('#aRetry').onclick=()=>{setSeedMode('arrangement','auto');$('#aSeed').value='';seedConfigurationChanged('arrangement');};$('#aRun').onclick=()=>runArrangement();
    $('#aStop').onclick=()=>{if(arrangeRun){arrangeRun.cancel=true;arrangeRun.worker?.postMessage({type:'cancel'});}};
    $('#aApply').onclick=()=>modal('应用排布结果','<p>将当前关序替换为排布出的 '+(arrangementPreview?.result.audit.total||0)+' 关。确认后可用 ⌘/Ctrl+Z 撤销。</p>',[{label:'取消'},{label:'应用',primary:true,onClick:()=>applyArrangement().catch(error=>toast(error.message))}]);
    $('#aExport').onclick=()=>{try{readArrangementForm();WPArrangement.expand(arrangementDraft);download(arrangementDraft.name+'.arrangement.json',JSON.stringify(arrangementDraft,null,2));}catch(error){toast(error.message);}};
    $('#aImport').onclick=()=>$('#arrangementFile').click();
    $('#arrangementFile').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{const plan=JSON.parse(await f.text());WPArrangement.expand(plan);arrangementDraft=plan;arrangementPreview=null;resetArrangementView();setSeedMode('arrangement',plan.seed.trim()?'fixed':'auto');await loadArrangementView();await workflowSave('seedModes',seedModes);await workflowSave('arrangement',plan);await workflowSave('arrangementPreview',null);}catch(error){toast('方案导入失败：'+error.message);}};
  }
  /* ---------- 生成与排布界面结束 ---------- */
