/* Inventory database is deliberately separate from editor/campaign storage. */
(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./emotion'):root.WPEmotion,node?require('./lengths'):root.WPLengths);if(node)module.exports=api;else root.WPPoolStore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(Emotion,Lengths){
 'use strict';
 const enrich=entry=>Lengths.enrich(Emotion.enrich(entry));
 const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,v[key]])):v);
 function create(name='wp.leveldesk.pools'){
  let connection;
  const request=q=>new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  function db(){
   if(!connection)connection=new Promise((resolve,reject)=>{
    const q=indexedDB.open(name,1);
    q.onupgradeneeded=()=>{
     const d=q.result;d.createObjectStore('pools',{keyPath:'id'});
     const entries=d.createObjectStore('entries',{keyPath:['poolId','id']});entries.createIndex('poolId','poolId');
     d.createObjectStore('snapshots',{keyPath:'id'});d.createObjectStore('workspace');
    };
    q.onerror=()=>{connection=null;reject(q.error);};
    q.onblocked=()=>{connection=null;reject(new Error('关卡库升级被其他页面占用，请关闭其他编辑器页面后重试'));};
    q.onsuccess=()=>{q.result.onversionchange=()=>{q.result.close();connection=null;};resolve(q.result);};
   });return connection;
  }
  async function transaction(stores,mode,run){
   const d=await db(),tx=d.transaction(stores,mode);
   const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('关卡库事务中止'));tx.onerror=()=>{};});
   try{const result=await run(tx);await done;return result;}
   catch(error){try{tx.abort();}catch(e){}await done.catch(()=>{});throw error;}
  }
  const listPools=()=>transaction(['pools'],'readonly',tx=>request(tx.objectStore('pools').getAll()));
  async function createPool(name,id){
   name=String(name||'').trim();if(!name||name.length>80)throw new Error('请输入 1–80 字的关卡库名称');
   const pool={id:id||'pool-'+crypto.randomUUID(),name,count:0,createdAt:Date.now(),updatedAt:Date.now()};
   await transaction(['pools'],'readwrite',tx=>request(tx.objectStore('pools').add(pool)));return pool;
  }
  async function renamePool(id,name){
   name=String(name||'').trim();if(!name||name.length>80)throw new Error('请输入 1–80 字的关卡库名称');
   return transaction(['pools'],'readwrite',async tx=>{const s=tx.objectStore('pools'),p=await request(s.get(id));if(!p)throw new Error('关卡库不存在');p.name=name;p.updatedAt=Date.now();await request(s.put(p));return p;});
  }
  async function putEntries(poolId,entries,snapshots={}){
   return transaction(['pools','entries','snapshots'],'readwrite',async tx=>{
    const pools=tx.objectStore('pools'),rows=tx.objectStore('entries'),snaps=tx.objectStore('snapshots');
    const pool=await request(pools.get(poolId));if(!pool)throw new Error('目标关卡库不存在');
    for(const snap of Object.values(snapshots)){
     const old=await request(snaps.get(snap.id));
     if(old&&JSON.stringify(old)!==JSON.stringify(snap)&&canonical(old)!==canonical(snap))throw new Error('词库快照标识冲突');
     if(!old)await request(snaps.put(snap));
    }
    let added=0;
    for(const entry of entries){
     const old=await request(rows.get([poolId,entry.id]));
     if(old&&old.signature!==entry.signature)throw new Error('候选标识冲突');
     if(!old){if(!await request(snaps.get(entry.librarySnapshotId)))throw new Error('候选缺少词库快照');await request(rows.put({...enrich(entry),poolId}));added++;}
    }
    pool.count+=added;pool.updatedAt=Date.now();await request(pools.put(pool));return {added,duplicates:entries.length-added,count:pool.count};
   });
  }
  function cursorRows(index,range,offset,limit,map=x=>x){
   return new Promise((resolve,reject)=>{
    const out=[],q=index.openCursor(range);let skipped=false;
    q.onerror=()=>reject(q.error);
    q.onsuccess=()=>{const c=q.result;if(!c||out.length>=limit){resolve(out);return;}if(offset&&!skipped){skipped=true;c.advance(offset);return;}out.push(map(c.value));c.continue();};
   });
  }
  const listEntries=(poolId,page=0,pageSize=50)=>transaction(['entries'],'readonly',tx=>cursorRows(tx.objectStore('entries').index('poolId'),IDBKeyRange.only(poolId),Math.max(0,page)*pageSize,pageSize,enrich));
  const allEntries=poolId=>transaction(['entries'],'readonly',tx=>cursorRows(tx.objectStore('entries').index('poolId'),IDBKeyRange.only(poolId),0,Infinity,enrich));
  async function summaries(poolIds){
   return transaction(['entries'],'readonly',async tx=>{
    const index=tx.objectStore('entries').index('poolId'),out=[];
    for(const id of [...new Set(poolIds)])out.push(...await cursorRows(index,IDBKeyRange.only(id),0,Infinity,e=>({id:e.id,poolId:e.poolId,playKey:e.playKey,librarySnapshotId:e.librarySnapshotId,...e.metrics,...Emotion.metrics(e.game),...Lengths.metrics(e.game),perWord:undefined})));
    return out;
   });
  }
  const getEntry=(poolId,id)=>transaction(['entries'],'readonly',tx=>request(tx.objectStore('entries').get([poolId,id])).then(enrich));
  async function getSnapshots(ids){return transaction(['snapshots'],'readonly',async tx=>{const result={};for(const id of [...new Set(ids)]){const snap=await request(tx.objectStore('snapshots').get(id));if(!snap)throw new Error('词库快照不存在');result[id]=snap;}return result;});}
  const load=key=>transaction(['workspace'],'readonly',tx=>request(tx.objectStore('workspace').get(key)));
  const save=(key,value)=>transaction(['workspace'],'readwrite',tx=>request(tx.objectStore('workspace').put(value,key)));
  const update=(key,change)=>transaction(['workspace'],'readwrite',async tx=>{const store=tx.objectStore('workspace'),value=change(await request(store.get(key)));await request(store.put(value,key));return value;});
  return {listPools,createPool,renamePool,putEntries,listEntries,allEntries,summaries,getEntry,getSnapshots,load,save,update,close:async()=>{if(connection)(await connection).close();connection=null;}};
 }
 return {create};
});
