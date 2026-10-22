  /* ---------- 关卡排布：配置、预览与正式关序分离 ---------- */
  let arrangementDraft=null, arrangementPreview=null, arrangeRun=null, aSlotPage=0, aResultPage=0;
  const arrangementMetrics=new WeakMap();
  function planFromCampaign(levels=campaign.levels) {
    const first=levels[0]||{},shape=WPLevelPool.sizes.some(([w,h])=>w===first.W&&h===first.H)?{width:first.W,height:first.H}:{width:3,height:3};
    const targetCount=Math.max(2,Math.min(16,first.words?.length||3)),overrides={};
    levels.forEach((d,i)=>{if(d.words?.length&& !WPLevelPool.sizes.some(([w,h])=>w===d.W&&h===d.H))throw new Error('第 '+(i+1)+' 关尺寸不在当前支持范围内');const value={width:d.words?.length?d.W:3,height:d.words?.length?d.H:3,targetCount:Math.max(2,Math.min(16,d.words?.length||3))};if(value.width!==shape.width||value.height!==shape.height||value.targetCount!==targetCount)overrides[i+1]=value;});
    return {kind:'wordpages-arrangement',schemaVersion:1,name:'排布关序',seed:'ARRANGE-2026',budget:1000000,requiredLetters:workflowClone(requiredLetterSchedule),overrides,
      segments:[{id:'segment-'+newId(),from:1,to:Math.max(1,levels.length),...shape,targetCount,poolIds:poolSelected?[poolSelected]:[],rules:workflowClone(WPArrangement.DEFAULT_RULES)}]};
  }
  function modeOptions(value) { return '<option value="strict"'+(value==='strict'?' selected':'')+'>严格限制</option><option value="soft"'+(value==='soft'?' selected':'')+'>扣分避让</option>'; }
  function paintArrangementSegments() {
    if(!arrangementDraft)return;
    $('#aSegments').innerHTML=arrangementDraft.segments.map((s,index)=>{
      const r={...WPArrangement.DEFAULT_RULES,...s.rules},available=workflowPools.map(p=>({id:p.id,name:p.name,count:p.count}));
      for(const id of s.poolIds)if(!available.some(p=>p.id===id))available.push({id,name:'未找到关卡库：'+id,count:0});
      const turns='<option value=""'+(r.maxTurns===null?' selected':'')+'>不限</option>'+Array.from({length:7},(_,n)=>'<option value="'+n+'"'+(r.maxTurns===n?' selected':'')+'>'+n+' 拐</option>').join('');
      return '<section class="workflow-segment" data-segment="'+index+'"><div class="workflow-section-heading"><b>分段 '+(index+1)+'</b><button type="button" data-segment-delete="'+index+'">移除分段</button></div><div class="bgrid">'+
        '<label>起始关号<input data-seg="from" type="number" min="1" max="10000" value="'+esc(s.from)+'"></label><label>结束关号<input data-seg="to" type="number" min="1" max="10000" value="'+esc(s.to)+'"></label>'+
        '<label>棋盘尺寸<select data-seg="size">'+sizeOptions(s.width,s.height)+'</select></label><label>目标词数量<input data-seg="targetCount" type="number" min="2" max="16" value="'+esc(s.targetCount)+'"></label></div>'+
        '<button type="button" data-segment-fill="'+index+'">将本段尺寸、目标数覆盖到逐关表</button><p class="note">逐关表中的单独修改会保留，点击此按钮可批量覆盖。</p>'+
        '<details open><summary>来源关卡库 · 可多选</summary><div class="segment-pools">'+(available.map(p=>'<label><input type="checkbox" data-seg-pool value="'+esc(p.id)+'"'+(s.poolIds.includes(p.id)?' checked':'')+'>'+esc(p.name)+' · '+p.count+' 关</label>').join('')||'<span class="note">请先在关卡生成中创建或导入关卡库。</span>')+'</div></details>'+
        '<div class="bgrid"><label>每词最大拐弯<select data-rule="maxTurns">'+turns+'</select></label><label>二拐及以上词数上限<input data-rule="multiTurnLimit" type="number" min="0" max="16" placeholder="不限" value="'+(r.multiTurnLimit??'')+'"></label>'+
        '<label>重复词间隔<input data-rule="repeatGap" type="number" min="0" max="99999" value="'+r.repeatGap+'"></label><label>重复词处理<select data-rule="repeatMode">'+modeOptions(r.repeatMode)+'</select></label>'+
        '<label>字母密度窗口<input data-rule="densityWindow" type="number" min="1" max="10000" value="'+r.densityWindow+'"></label><label>字母密度处理<select data-rule="densityMode">'+modeOptions(r.densityMode)+'</select></label></div>'+
        '<p class="note">重复间隔 20 表示两次使用之间至少隔 20 关；0 关闭。跨分段继续统计。</p><details><summary>各字母在窗口内最多出现几关 · 留空不限</summary><div class="density-grid">'+
        [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(c=>'<label>'+c+'<input type="number" min="0" data-density="'+c+'" aria-label="'+c+' 出现关数上限" value="'+(r.densityCaps?.[c]??'')+'"></label>').join('')+'</div></details></section>';
    }).join('');
  }
  function readArrangementForm() {
    if(!arrangementDraft)return null;
    arrangementDraft.name=$('#aName').value.trim()||'排布关序';arrangementDraft.seed=$('#aSeed').value;arrangementDraft.budget=Number($('#aBudget').value);
    arrangementDraft.segments=[...$('#aSegments').children].map((card,index)=>{
      const get=key=>card.querySelector('[data-seg="'+key+'"]'),rule=key=>card.querySelector('[data-rule="'+key+'"]'),[width,height]=get('size').value.split('x').map(Number),caps={};
      card.querySelectorAll('[data-density]').forEach(el=>{if(el.value.trim()!=='')caps[el.dataset.density]=Number(el.value);});
      return {id:arrangementDraft.segments[index]?.id||'segment-'+newId(),from:Number(get('from').value),to:Number(get('to').value),width,height,targetCount:Number(get('targetCount').value),
        poolIds:[...card.querySelectorAll('[data-seg-pool]:checked')].map(el=>el.value),rules:{maxTurns:rule('maxTurns').value===''?null:Number(rule('maxTurns').value),multiTurnLimit:rule('multiTurnLimit').value===''?null:Number(rule('multiTurnLimit').value),
          repeatGap:Number(rule('repeatGap').value),repeatMode:rule('repeatMode').value,densityWindow:Number(rule('densityWindow').value),densityMode:rule('densityMode').value,densityCaps:caps}};
    });return arrangementDraft;
  }
  function arrangementKey(plan=arrangementDraft) { return WPLevelPool.stable(plan); }
  function arrangementChanged() {
    if(arrangeRun)return;
    readArrangementForm();workflowSave('arrangement',arrangementDraft);paintArrangementSlots();paintArrangementPreview();
  }
  function displaySlots() {
    const preview=workflowClone(arrangementDraft);
    for(const s of preview.segments)if(!s.poolIds.length)s.poolIds=['unselected'];
    return WPArrangement.expand(preview);
  }
  function paintArrangementSlots() {
    if(!arrangementDraft)return;let slots=[];
    try{slots=displaySlots();WPArrangement.expand(arrangementDraft);const missing=arrangementDraft.segments.flatMap(s=>s.poolIds).find(id=>!workflowPools.some(p=>p.id===id));if(missing)throw new Error('请导入所引用的关卡库或重新选库：'+missing);$('#aConfigError').textContent='';$('#aRun').disabled=!!arrangeRun;}
    catch(error){$('#aConfigError').textContent=error.message;$('#aRun').disabled=true;}
    const pages=Math.max(1,Math.ceil(slots.length/50));aSlotPage=Math.max(0,Math.min(aSlotPage,pages-1));
    $('#aSlotPage').textContent=(aSlotPage+1)+' / '+pages;$('#aSlotPrev').disabled=!!arrangeRun||!aSlotPage;$('#aSlotNext').disabled=!!arrangeRun||aSlotPage+1>=pages;
    $('#aSlots tbody').innerHTML=slots.slice(aSlotPage*50,aSlotPage*50+50).map(s=>'<tr data-slot="'+s.number+'"><td>'+s.number+'</td><td><select data-slot-field="size" aria-label="第 '+s.number+' 关尺寸">'+sizeOptions(s.width,s.height)+'</select></td><td><input data-slot-field="targetCount" aria-label="第 '+s.number+' 关目标词数" type="number" min="2" max="16" value="'+s.targetCount+'"></td><td>'+s.requiredLetters.split('').join(' ')+'</td><td>'+(s.rules.maxTurns===null?'不限':s.rules.maxTurns+' 拐')+'</td></tr>').join('');
  }
  function paintArrangementPreview() {
    const preview=arrangementPreview,active=preview&&preview.planKey===arrangementKey();
    $('#aApply').disabled=!!arrangeRun||!active||!preview.result.audit.ok||preview.result.status!=='complete';
    if(!preview){$('#aSummary').textContent='尚未排布。先配置每一关的条件，再点击“预览排布”。';$('#aResults tbody').innerHTML='';$('#aStatsBody').textContent='';$('#aResultPage').textContent='';$('#aResultPrev').disabled=true;$('#aResultNext').disabled=true;return;}
    const r=preview.result,slots=WPArrangement.expand(preview.plan),pages=Math.max(1,Math.ceil(r.rows.length/50));aResultPage=Math.max(0,Math.min(aResultPage,pages-1));
    $('#aSummary').textContent=(active?'':'配置已修改，下面是上一次预览，须重新排布。 ')+r.audit.filled+' / '+r.audit.total+' 关已匹配 · 缺位 '+(r.audit.total-r.audit.filled)+' · 已检查 '+r.checks.toLocaleString()+' 次候选'+(r.status==='cancelled'?' · 已中止':r.status==='budget'?' · 搜索预算已耗尽':'')+'。';
    const labels={static:'没有符合尺寸、目标数、字母及拐弯要求的库存',temporal:'本次搜索中候选被重复词或密度限制排除',unmatched:'候选已被其他关号使用，本次搜索尚未匹配',budget:'搜索预算内尚未匹配',cancelled:'排布已中止，尚未匹配'};
    $('#aResults tbody').innerHTML=r.rows.slice(aResultPage*50,aResultPage*50+50).map(row=>{
      const choice=row.choice,slot=slots[row.number-1],name=choice?(workflowPools.find(p=>p.id===choice.poolId)?.name||choice.poolId):'';
      const requirements=slot.width+'×'+slot.height+' · '+slot.targetCount+' 词<br><small>字母 '+(slot.requiredLetters.split('').join(' ')||'不限')+' · '+(slot.rules.maxTurns===null?'拐弯不限':'每词最多 '+slot.rules.maxTurns+' 拐')+(slot.rules.multiTurnLimit===null?'':' · 多拐词 ≤ '+slot.rules.multiTurnLimit)+'</small>';
      return '<tr data-arrange-number="'+row.number+'"><td>'+row.number+'</td><td>'+requirements+'</td><td>'+row.candidateCount+'</td><td'+(choice?'':' class="bad"')+'>'+(choice?esc(name)+' · '+esc(choice.id.slice(-8)):labels[row.reason]||'尚未匹配')+'</td><td>'+(choice?'<button type="button" data-arrange-preview="'+row.number+'">查看／试玩</button>':'')+'</td></tr>';
    }).join('');
    $('#aResultPage').textContent=(aResultPage+1)+' / '+pages;$('#aResultPrev').disabled=!aResultPage;$('#aResultNext').disabled=aResultPage+1>=pages;
    const soft=r.audit.soft,softText=soft.slice(0,100).map(v=>'<li>第 '+v.number+' 关：'+(v.type==='repeat'?esc(v.word)+' 上次在第 '+v.last+' 关出现':v.letter+' 在窗口出现 '+v.count+' 关，上限 '+v.cap)+'</li>').join('');
    const repeats=r.audit.repeats||[],repeatText=repeats.length?'重复使用 '+repeats.length+' 次，涉及 '+new Set(repeats.map(v=>v.word)).size+' 个必答词；最短间隔 '+repeats.reduce((min,v)=>Math.min(min,v.gap),Infinity)+' 关。':'已匹配关卡没有重复必答词。';
    const repeatRows=repeats.slice(0,100).map(v=>'<li>'+esc(v.word)+'：第 '+v.last+' → '+v.number+' 关，中间隔 '+v.gap+' 关（当前要求 '+v.requiredGap+'）</li>').join('');
    const currentDensity=r.audit.density.filter(Boolean).at(-1),densityText=currentDensity?Object.entries(currentDensity.counts).sort().map(([c,n])=>c+' '+n+'/'+currentDensity.window).join(' · '):'尚无已匹配关卡';
    const densityRows=r.audit.density.slice(aResultPage*50,aResultPage*50+50).map((d,i)=>'<tr><td>'+(aResultPage*50+i+1)+'</td><td>'+(d?d.window:'—')+'</td><td>'+(d?Object.entries(d.counts).sort().map(([c,n])=>c+': '+n).join(' · '):'缺位，不贡献单词或字母统计')+'</td></tr>').join('');
    $('#aStatsBody').innerHTML='<p>必答路径：直线 '+r.audit.turnCounts[0]+' 词 · 一拐 '+r.audit.turnCounts[1]+' 词 · 二拐及以上 '+r.audit.turnCounts.multi+' 词。</p><p>重复词间隔与字母密度复核：'+(r.audit.errors.some(e=>e.type==='repeat'||e.type==='density')?'存在严格规则冲突':'已匹配关卡均通过严格规则')+'。扣分避让触发 '+soft.length+' 项'+(soft.length>100?'（展示前 100 项）':'')+'。</p><ul>'+softText+'</ul><p>最后一个已匹配关号的窗口字母出现次数：'+densityText+'</p><p>本页逐关窗口统计（随结果翻页；同一字母每关最多计一次）：</p><table><thead><tr><th>关号</th><th>窗口长度</th><th>字母出现关数</th></tr></thead><tbody>'+densityRows+'</tbody></table>';
  }
  async function loadArrangementView() {
    if(!arrangementDraft){
      try{arrangementDraft=planFromCampaign();}
      catch(error){arrangementDraft=planFromCampaign([]);toast('当前关序无法直接提取配置：'+error.message+'。已准备空白排布方案。');}
    }
    $('#aName').value=arrangementDraft.name||'排布关序';$('#aSeed').value=arrangementDraft.seed;$('#aBudget').value=arrangementDraft.budget;
    paintArrangementSegments();paintArrangementSlots();paintArrangementPreview();
  }
  async function openArrangement() {
    if(!ours())return;
    try{await workflowReady;await refreshPools();await loadArrangementView();$('#arrange').hidden=false;}
    catch(error){toast('排布工具无法打开：'+error.message);}
  }
  function lockArrangement(locked) {
    for(const el of $('#arrange').querySelectorAll('input,select,button'))if(!['aClose','aStop'].includes(el.id))el.disabled=locked;
    $('#aStop').disabled=!locked;
  }
  async function runArrangement() {
    if(arrangeRun)return;
    let plan;
    try{readArrangementForm();plan=workflowClone(arrangementDraft);WPArrangement.expand(plan);for(const id of new Set(plan.segments.flatMap(s=>s.poolIds)))if(!workflowPools.some(p=>p.id===id))throw new Error('来源关卡库不存在：'+id);}
    catch(error){toast(error.message);return;}
    const run={plan,cancel:false,worker:null,url:null};arrangeRun=run;arrangementPreview=null;window.__lastArrangement=null;lockArrangement(true);paintArrangementPreview();$('#aProgress').textContent='正在读取关卡库摘要…';
    try{
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
      arrangementPreview={planKey:arrangementKey(plan),plan,result};window.__lastArrangement=result;
      await workflowSave('arrangementPreview',arrangementPreview);aResultPage=0;
      $('#aProgress').textContent=result.status==='complete'?'排布完成，全部关号复核通过。':result.status==='cancelled'?'已中止，保留当前预览。':'本次预览存在缺位，可调整配置或补充库存后重试。';
    }catch(error){$('#aProgress').textContent='排布失败：'+error.message;toast(error.message);}
    finally{run.worker?.terminate();if(run.url)URL.revokeObjectURL(run.url);arrangeRun=null;lockArrangement(false);paintArrangementSlots();paintArrangementPreview();}
  }
  function campaignArrangementAudit(camp=campaign) {
    if(!camp.arrangement)return null;
    try{
      const slots=WPArrangement.expand(camp.arrangement.plan);
      if(camp.levels.length!==slots.length)return {ok:false,errors:[{message:'关卡数量与绑定的排布方案不一致'}]};
      const selected=camp.levels.map((d,i)=>{
        const n=d.gen?.sig===genSig(d)?d.gen.n:nOf(d),game={g:Array.from({length:d.H},(_,y)=>d.letters.slice(y*d.W,(y+1)*d.W).join('')).join(','),t:d.words.join(' '),n,e:d.extras.join(' '),curtains:d.curtains};
        const key=JSON.stringify([game.g,game.t,game.n,game.curtains]);let cached=arrangementMetrics.get(d);
        if(cached?.key!==key){cached={key,metrics:WPLevelPool.analyze(game)};arrangementMetrics.set(d,cached);}
        return {id:d.arrangement?.entryId||'',poolId:d.arrangement?.poolId||'',playKey:WPLevelPool.hash(WPLevelPool.stable([game.g,cached.metrics.targets])),...cached.metrics};
      });
      return WPArrangement.verify(slots,selected);
    }catch(error){return {ok:false,errors:[{message:'排布规则复核失败：'+error.message}]};}
  }
  async function applyArrangement() {
    const preview=arrangementPreview;
    if(!preview||preview.planKey!==arrangementKey()||preview.result.status!=='complete'||!preview.result.audit.ok)throw new Error('请先完成全部关号的排布');
    const owner=campaign,ownerKey=JSON.stringify(campaignSnap()),slots=WPArrangement.expand(preview.plan),entries=[];
    for(const [i,row] of preview.result.rows.entries()){const entry=await poolStore.getEntry(row.choice.poolId,row.choice.id);if(!entry)throw new Error('第 '+row.number+' 关库存已不存在');entries.push(entry);if(i%25===0)await workflowPause();}
    const snapshots=await poolStore.getSnapshots(entries.map(e=>e.librarySnapshotId)),indices=new Map();
    for(const [i,entry] of entries.entries()){WPLevelPool.importRecord(entry,snapshots,indices);if(i%25===0)await workflowPause();}
    const audit=WPArrangement.verify(slots,entries.map(WPLevelPool.summary));if(!audit.ok)throw new Error('排布复核失败：'+audit.errors[0].message);
    if(campaign!==owner||JSON.stringify(campaignSnap())!==ownerKey||preview.planKey!==arrangementKey()||!ours())throw new Error('关序或方案已改变，请重新确认应用');
    const levels=entries.map((entry,i)=>{
      const game={...entry.game,id:String(i+1),name:'第 '+(i+1)+' 关'},d=normalizeDraft(C.fromLevel(game));d.librarySnapshotId=entry.librarySnapshotId;
      d.gen={sig:genSig(d),n:game.n,searchVersion:'inventory-v1'};d.arrangement={poolId:entry.poolId,entryId:entry.id,number:i+1};
      return d;
    });
    snapshot();campaign={name:preview.plan.name,index:0,levels,pack:null,librarySnapshots:snapshots,arrangement:{schemaVersion:1,plan:workflowClone(preview.plan)}};currentFile=null;levelView='list';boardKey='';suggCache=null;
    ensureCampaignLibraries(campaign);await persist();render();$('#arrange').hidden=true;toast('已应用 '+levels.length+' 关，关卡库保持不变');
  }
  function wireArrangement() {
    $('#btnArrange').onclick=()=>openArrangement();$('#aClose').onclick=()=>{$('#arrange').hidden=true;};
    $('#aAddSegment').onclick=()=>{readArrangementForm();const from=Math.max(0,...arrangementDraft.segments.map(s=>s.to))+1;arrangementDraft.segments.push({id:'segment-'+newId(),from,to:Math.min(10000,from+99),width:3,height:3,targetCount:3,poolIds:poolSelected?[poolSelected]:[],rules:workflowClone(WPArrangement.DEFAULT_RULES)});paintArrangementSegments();arrangementChanged();};
    $('#aFromCurrent').onclick=()=>{try{arrangementDraft=planFromCampaign();arrangementPreview=null;loadArrangementView();workflowSave('arrangement',arrangementDraft);workflowSave('arrangementPreview',null);}catch(error){toast(error.message);}};
    $('#aSegments').addEventListener('input',()=>arrangementChanged());
    $('#aSegments').addEventListener('click',e=>{
      const fill=e.target.closest('[data-segment-fill]'),del=e.target.closest('[data-segment-delete]');if(!fill&&!del)return;readArrangementForm();
      if(fill){const s=arrangementDraft.segments[Number(fill.dataset.segmentFill)];for(const key of Object.keys(arrangementDraft.overrides||{}))if(Number(key)>=s.from&&Number(key)<=s.to)delete arrangementDraft.overrides[key];}
      if(del){arrangementDraft.segments.splice(Number(del.dataset.segmentDelete),1);const end=Math.max(0,...arrangementDraft.segments.map(s=>s.to));for(const key of Object.keys(arrangementDraft.overrides||{}))if(Number(key)>end)delete arrangementDraft.overrides[key];paintArrangementSegments();}
      arrangementChanged();
    });
    $('#aSlots').addEventListener('input',e=>{
      const row=e.target.closest('[data-slot]');if(!row||arrangeRun)return;readArrangementForm();const [width,height]=row.querySelector('select').value.split('x').map(Number);arrangementDraft.overrides[row.dataset.slot]={width,height,targetCount:Number(row.querySelector('input').value)};workflowSave('arrangement',arrangementDraft);paintArrangementPreview();
    });
    for(const id of ['aName','aSeed','aBudget'])$('#'+id).addEventListener('input',()=>arrangementChanged());
    $('#aSlotPrev').onclick=()=>{aSlotPage--;paintArrangementSlots();};$('#aSlotNext').onclick=()=>{aSlotPage++;paintArrangementSlots();};
    $('#aResultPrev').onclick=()=>{aResultPage--;paintArrangementPreview();};$('#aResultNext').onclick=()=>{aResultPage++;paintArrangementPreview();};
    $('#aRetry').onclick=()=>{$('#aSeed').value='ARRANGE-'+newId();arrangementChanged();};$('#aRun').onclick=()=>runArrangement();
    $('#aStop').onclick=()=>{if(arrangeRun){arrangeRun.cancel=true;arrangeRun.worker?.postMessage({type:'cancel'});}};
    $('#aApply').onclick=()=>modal('应用排布结果','<p>将当前关序替换为排布出的 '+(arrangementPreview?.result.audit.total||0)+' 关。确认后可用 ⌘/Ctrl+Z 撤销。</p>',[{label:'取消'},{label:'应用',primary:true,onClick:()=>applyArrangement().catch(error=>toast(error.message))}]);
    $('#aResults').onclick=e=>{const b=e.target.closest('[data-arrange-preview]');if(b){const choice=arrangementPreview.result.rows[Number(b.dataset.arrangePreview)-1].choice;previewInventory(choice.poolId,choice.id);}};
    $('#aExport').onclick=()=>{try{readArrangementForm();WPArrangement.expand(arrangementDraft);download(arrangementDraft.name+'.arrangement.json',JSON.stringify(arrangementDraft,null,2));}catch(error){toast(error.message);}};
    $('#aImport').onclick=()=>$('#arrangementFile').click();
    $('#arrangementFile').onchange=async e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{const plan=JSON.parse(await f.text());WPArrangement.expand(plan);arrangementDraft=plan;arrangementPreview=null;aSlotPage=0;await loadArrangementView();await workflowSave('arrangement',plan);await workflowSave('arrangementPreview',null);}catch(error){toast('方案导入失败：'+error.message);}};
  }
  /* ---------- 生成与排布界面结束 ---------- */
