  /* ---------- 自动随机种子与本机使用历史 ---------- */
  let seedModes={generation:'auto',arrangement:'auto'}, seedHistory={generation:[],arrangement:[]}, seedNonce=0;
  const seedPrefixes={generation:'b',arrangement:'a'};
  function seedElement(kind,suffix){return $('#'+seedPrefixes[kind]+'Seed'+suffix);}
  function seedStatusLabel(entry){
    const labels={saved:'旧配置',running:'已开始',complete:'已完成',partial:'部分完成',budget:'预算用尽',cancelled:'已中止',error:'失败'};
    const count=entry.made!=null?'入库 '+entry.made+' 关':entry.matched!=null?'匹配 '+entry.matched+'/'+entry.requested+' 关':'';
    return [labels[entry.status]||entry.status,count].filter(Boolean).join(' · ');
  }
  function paintSeedControls(kind,selectedId){
    const select=seedElement(kind,'History'),selected=selectedId??select.value,records=seedHistory[kind];
    seedElement(kind,'Mode').value=seedModes[kind];seedElement(kind,'').readOnly=seedModes[kind]==='auto';
    select.innerHTML='<option value="">'+(records.length?'共 '+records.length+' 次记录 · 选择历史种子':'暂无种子历史')+'</option>'+records.map(entry=>{
      const time=entry.status==='saved'?'旧配置':new Date(entry.startedAt).toLocaleString('zh-CN',{hour12:false});
      const text=[time,entry.seed,entry.context,seedStatusLabel(entry)].filter(Boolean).join(' · ');
      return '<option value="'+esc(entry.id)+'" title="'+esc(text)+'">'+esc(text)+'</option>';
    }).join('');
    if(records.some(entry=>entry.id===selected))select.value=selected;
    seedElement(kind,'Note').textContent=seedModes[kind]==='auto'?'每次开始时自动换新种子；输入框显示最近使用的种子。历史记录保存在本机，可选回复用。':
      '使用当前种子；回选历史只恢复种子，其他参数采用当前设置。'+(kind==='generation'?'同一关卡库、同一规格会继续追加关卡。':'');
  }
  function setSeedMode(kind,mode){seedModes[kind]=mode==='fixed'?'fixed':'auto';paintSeedControls(kind);}
  async function saveSeedRecords(updates){
    const copy=workflowClone(updates);
    const pending=workflowSaveQ.catch(()=>{}).then(()=>poolStore.update('seedHistory',stored=>{
      const next={generation:[],arrangement:[]};
      for(const kind of Object.keys(next)){
        const records=new Map((Array.isArray(stored?.[kind])?stored[kind]:[]).map(e=>[e.id,e]));
        for(const entry of copy[kind]||[])records.set(entry.id,entry);
        next[kind]=[...records.values()].sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
      }
      return next;
    }));
    workflowSaveQ=pending;pending.catch(error=>toast('种子历史保存失败：'+error.message));
    seedHistory=await pending;
    for(const kind of Object.keys(seedPrefixes))paintSeedControls(kind);
  }
  async function saveSeedRecord(kind,id){
    const entry=seedHistory[kind].find(e=>e.id===id);
    if(entry)await saveSeedRecords({[kind]:[entry]});
  }
  async function refreshSeedHistory(){
    await workflowSaveQ.catch(()=>{});
    const saved=await poolStore.load('seedHistory');
    if(saved){for(const kind of Object.keys(seedPrefixes)){seedHistory[kind]=Array.isArray(saved[kind])?saved[kind]:[];paintSeedControls(kind);}}
  }
  async function loadSeedState(generation,draft,preview){
    const [history,modes]=await Promise.all([poolStore.load('seedHistory'),poolStore.load('seedModes')]);
    let changed=false;
    for(const kind of Object.keys(seedPrefixes)){
      seedModes[kind]=modes?.[kind]==='fixed'?'fixed':'auto';
      seedHistory[kind]=Array.isArray(history?.[kind])?history[kind].filter(e=>e&&typeof e.id==='string'&&typeof e.seed==='string'&&e.seed.trim()):[];
      const previous=kind==='generation'?generation?.seed:preview?.plan?.seed||draft?.seed;
      if(!history&&typeof previous==='string'&&previous.trim()){
        seedHistory[kind].push({id:'seed-'+newId(),seed:previous,status:'saved',context:kind==='generation'?'原生成配置':'原排布方案'});changed=true;
      }
      paintSeedControls(kind);
    }
    if(changed)await saveSeedRecords(seedHistory);
  }
  function seedForRun(kind){
    const input=seedElement(kind,''),mode=seedElement(kind,'Mode').value;
    seedModes[kind]=mode==='fixed'?'fixed':'auto';
    if(seedModes[kind]==='auto'){
      const random=new Uint32Array(2);
      if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(random);
      else for(let i=0;i<random.length;i++)random[i]=Math.floor(Math.random()*0x100000000);
      input.value=(kind==='generation'?'GEN-':'ARR-')+Date.now().toString(36)+'-'+(++seedNonce).toString(36)+'-'+Array.from(random,n=>n.toString(16).padStart(8,'0')).join('');
    }else if(!input.value.trim())throw new Error('请输入要复用的种子，或选择每次随机');
    return input.value;
  }
  function beginSeedRecord(kind,seed,context,requested){
    const entry={id:'seed-'+newId(),seed,context,requested,startedAt:Date.now(),status:'running'};
    seedHistory[kind].unshift(entry);paintSeedControls(kind,'');return entry.id;
  }
  async function finishSeedRecord(kind,id,result){
    const entry=seedHistory[kind].find(e=>e.id===id);if(!entry)return;
    Object.assign(entry,result,{finishedAt:Date.now()});paintSeedControls(kind,'');await saveSeedRecord(kind,id);
  }
  function seedConfigurationChanged(kind){
    workflowSave('seedModes',seedModes);
    if(kind==='generation'){previewCurve();workflowSave('generation',generationState());}
    else arrangementChanged();
  }
  function wireSeedControls(){
    for(const kind of Object.keys(seedPrefixes)){
      const busy=()=>kind==='generation'?!!batchRun:!!arrangeRun;
      seedElement(kind,'Mode').onchange=()=>{if(busy())return;setSeedMode(kind,seedElement(kind,'Mode').value);seedConfigurationChanged(kind);};
      seedElement(kind,'History').onchange=()=>{
        if(busy())return;const entry=seedHistory[kind].find(e=>e.id===seedElement(kind,'History').value);if(!entry)return;
        seedElement(kind,'').value=entry.seed;setSeedMode(kind,'fixed');seedConfigurationChanged(kind);
      };
      seedElement(kind,'').addEventListener('input',()=>{if(!busy())seedElement(kind,'History').value='';});
    }
  }
  /* ---------- 自动随机种子与历史结束 ---------- */
