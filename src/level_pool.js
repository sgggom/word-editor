/* Complete inventory records and portable pool files; no browser storage. */
(function(root,factory){
 const api=typeof module==='object'&&module.exports?factory(require('./gen'),require('./library'),require('./emotion'),require('./lengths')):factory(root.WTEngine,root.WPLibrary,root.WPEmotion,root.WPLengths);
 if(typeof module==='object'&&module.exports)module.exports=api;else root.WPLevelPool=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(E,L,Emotion,Lengths){
 'use strict';
 const sizes=[[4,2],[3,3],[4,3],[5,3]], fields=['id','name','g','t','n','e','lv','ty','curtains'];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const validatedSnapshots=new WeakSet();
 function ensureSnapshot(snapshot){
  if(!validatedSnapshots.has(snapshot)){
   L.validateSnapshot(snapshot);
   const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}};
   freeze(snapshot);validatedSnapshots.add(snapshot);
  }
 }
 const words=s=>String(s||'').trim().split(/\s+/).filter(Boolean);
 function stable(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
 function hash(text){return [2166136261,2246822507,3266489909,668265263].map(seed=>{let h=seed;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h.toString(16).padStart(8,'0');}).join('');}
 function gameOf(level,name='候选关卡'){
  return {id:level.id||'',name,g:Array.from({length:level.height},(_,i)=>level.grid.slice(i*level.width,(i+1)*level.width).join('')).join(','),
   t:level.targets.join(' '),n:level.counts.map(n=>n.toString(36)).join(''),e:level.extras.join(' '),lv:'',ty:'',curtains:[]};
 }
 function parseGame(game){
  if(!game||typeof game.g!=='string'||typeof game.t!=='string'||typeof game.n!=='string')throw new Error('关卡格式无效');
  const rows=game.g.split(','),width=rows[0].length,height=rows.length,targets=words(game.t),extras=words(game.e);
  if(!sizes.some(([w,h])=>w===width&&h===height)||rows.some(row=>row.length!==width||!/^[A-Z]+$/.test(row)))throw new Error('关卡棋盘尺寸或字母无效');
  if(!targets.length||new Set(targets).size!==targets.length||targets.some(w=>!/^[A-Z]{3,8}$/.test(w)))throw new Error('关卡必答词无效');
  if(new Set(extras).size!==extras.length||extras.some(w=>!/^[A-Z]{2,8}$/.test(w))||extras.some(w=>targets.includes(w)))throw new Error('额外词无效');
  if(game.n.length!==width*height||!/^[1-9a-k]+$/.test(game.n))throw new Error('逐格次数无效');
  if(game.curtains?.some(c=>c.cells?.length))throw new Error('关卡库暂不接收带帘子的关卡');
  return {width,height,grid:rows.join('').split(''),targets,extras,counts:[...game.n].map(n=>parseInt(n,36))};
 }
 function analyze(game,index){
  const lv=parseGame(game),ix=index||E.buildIndex(lv.targets.map(word=>({word,role:'candidate'})));
  const found=new Map(E.scanTargets(lv.grid,lv.width,lv.height,ix,32).map(item=>[item.word,item]));
  const perWord=lv.targets.map(word=>{const item=found.get(word);if(!item||!item.safe)throw new Error(word+' 无法连出或路径用格不一致');return {word,turns:item.turns,path:item.path.slice()};});
  const counts=Array(lv.grid.length).fill(0);for(const item of perWord)for(const cell of item.path)counts[cell]++;
  if(counts.some((n,i)=>!n||n!==lv.counts[i]))throw new Error('全盘覆盖或逐格次数校验失败');
  const letters=[...new Set(lv.grid)].sort(),turns=perWord.map(x=>x.turns);
  return {width:lv.width,height:lv.height,targetCount:lv.targets.length,targets:lv.targets.slice().sort(),letters,
   letterMask:letters.reduce((mask,c)=>mask|(1<<(c.charCodeAt(0)-65)),0),perWord,
   straightCount:turns.filter(n=>n===0).length,oneTurnCount:turns.filter(n=>n===1).length,
   multiTurnCount:turns.filter(n=>n>=2).length,maxTurns:Math.max(...turns),meanTurns:turns.reduce((a,b)=>a+b,0)/turns.length,...Emotion.metrics(game),...Lengths.metrics(game)};
 }
 function signature(game,snapshotId){
  const pairs=words(game.t).map((word,i)=>[word,game.lv?.[i]||'',game.ty?.[i]||'']).sort((a,b)=>a[0].localeCompare(b[0]));
  return stable({g:game.g,t:pairs,n:game.n,e:words(game.e).sort(),curtains:game.curtains||[],snapshotId});
 }
 function record(game,snapshot,generation={},index){
  ensureSnapshot(snapshot);
  if(generation.maxUse!=null&&(!Number.isSafeInteger(generation.maxUse)||generation.maxUse<1||generation.maxUse>20))throw new Error('生成时的单格上限无效');
  const ix=index||E.buildIndex(snapshot.lex),lv=parseGame(game),check=E.validate(lv,ix,{...E.DEFAULTS,maxUse:generation.maxUse||13});
  if(!check.ok)throw new Error(check.errors.join('；'));
  if(stable(check.extras.slice().sort())!==stable(lv.extras.slice().sort()))throw new Error('额外词与绑定词库不一致');
  const metrics=analyze(game,ix),body=Object.fromEntries(fields.map(key=>[key,clone(game[key]??(key==='curtains'?[]:''))]));
  const sig=signature(body,snapshot.id),playKey=hash(stable([body.g,metrics.targets]));
  return {id:'level-'+hash(sig),signature:sig,playKey,game:body,librarySnapshotId:snapshot.id,metrics,generation:clone(generation)};
 }
 function summary(entry){return {id:entry.id,poolId:entry.poolId,playKey:entry.playKey,librarySnapshotId:entry.librarySnapshotId,...entry.metrics,...Emotion.metrics(entry.game),...Lengths.metrics(entry.game),perWord:undefined};}
 function exportFile(pool,entries,snapshots){
  const refs=Object.fromEntries([...new Set(entries.map(e=>e.librarySnapshotId))].map(id=>{if(!snapshots[id])throw new Error('缺少词库快照 '+id);return [id,snapshots[id]];}));
  return {kind:'wordpages-level-pool',schemaVersion:1,pool:{id:pool.id,name:pool.name},entries:entries.map(({poolId,...e})=>Lengths.enrich(Emotion.enrich(e))),librarySnapshots:refs};
 }
 function checkFileHeader(file){
  if(file?.kind!=='wordpages-level-pool'||file.schemaVersion!==1||!file.pool||typeof file.pool.name!=='string'||!file.pool.name.trim()||!Array.isArray(file.entries)||!file.librarySnapshots)throw new Error('关卡库文件格式无效');
  for(const [id,snap] of Object.entries(file.librarySnapshots)){ensureSnapshot(snap);if(snap.id!==id)throw new Error('词库快照标识不一致');}
  return file;
 }
 function importRecord(entry,snapshots,indices=new Map()){
  const snap=snapshots[entry.librarySnapshotId];if(!snap)throw new Error('关卡缺少词库快照');
  if(!indices.has(snap.id))indices.set(snap.id,E.buildIndex(snap.lex));
  const checked=record(entry.game,snap,entry.generation||{},indices.get(snap.id));
  if(entry.id!==checked.id||entry.signature!==checked.signature)throw new Error('候选标识与关卡内容不一致');
  return checked;
 }
 return {sizes,words,stable,hash,clone,gameOf,parseGame,analyze,record,summary,exportFile,checkFileHeader,importRecord};
});
