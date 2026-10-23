/* Actual legacy IndexedDB rows, worker ranking, visible breakdowns and offline use. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),puppeteer=require('puppeteer-core');
const S=require('../src/emotion'),E=require('../src/gen'),P=require('../src/level_pool'),A=require('../src/arrangement'),L=require('../src/library');
const data=require('../data/game_vocab/catalog.json'),profiles=require('../src/profiles.json');
const snapshot=L.production(data,[L.tieredRecipes(data)[0]]).snapshot,ix=E.buildIndex(snapshot.lex),unique=new Map();
for(const r of E.generatePoolAttempts({width:3,height:3,targetCount:3},ix,profiles,{seed:'emotion-browser'},0,160))if(r){const entry=P.record(P.gameOf(r.level),snapshot,{ordinal:r.ordinal});unique.set(entry.playKey,entry);}
const entries=[...unique.values()],file=P.exportFile({id:'emotion-pool',name:'情绪评分验收库'},entries,{[snapshot.id]:snapshot});
const ranked=entries.slice().sort((a,b)=>b.metrics.emotionScore-a.metrics.emotionScore),best=ranked[0].metrics.emotionScore;assert(best>0);assert(entries.some(e=>e.metrics.emotionScore<0));
const plan={kind:'wordpages-arrangement',schemaVersion:1,name:'情绪优先验收',seed:'emotion-fixed',budget:1000000,requiredLetters:{id:'emotion-neutral',levels:{}},overrides:{},segments:[{id:'s',from:1,to:2,width:3,height:3,targetCount:3,poolIds:[file.pool.id],rules:{maxTurns:null,repeatGap:0}}]};
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function run(page){await page.click('#aRun');await page.waitForFunction(()=>window.__lastArrangement,{timeout:60000});return page.evaluate(()=>__lastArrangement);}
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true}),errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:900});await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>__desk.ready());
  const original=await page.evaluate(()=>__desk.deskText());assert.equal(await page.evaluate(()=>WPEmotion.version),S.version);await page.evaluate(file=>__desk.workflow.importPool(file),file);
  // Emulate old persisted inventory and a stale/forged score. Do not pass through the new writer.
  await page.evaluate(async id=>{
   const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('wp.leveldesk.pools',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
   await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite'),store=tx.objectStore('entries'),q=store.index('poolId').openCursor(IDBKeyRange.only(id));q.onsuccess=()=>{const c=q.result;if(!c)return;const e=c.value;delete e.metrics.emotion;if(e.metrics.emotionScore>0)delete e.metrics.emotionScore;else e.metrics.emotionScore=9999; c.update(e);c.continue();};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
  },file.pool.id);
  const actual=await page.evaluate(id=>__desk.workflow.store.allEntries(id),file.pool.id);for(const e of actual)assert.deepEqual(e.metrics.emotion,S.game(e.game));assert.deepEqual(actual.map(e=>e.id).sort(),entries.map(e=>e.id).sort());
  const summaries=await page.evaluate(id=>__desk.workflow.store.summaries([id]),file.pool.id);assert.equal(Math.max(...summaries.map(e=>e.emotionScore)),best);
  await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});assert.equal(await page.$$eval('#poolEntries tbody .emotion-score',es=>es.length),50);await page.click('#poolEntries [data-pool-preview]');await page.waitForSelector('#modal',{visible:true});assert.match(await page.$eval('#mBody',e=>e.textContent),/额外.*× 0.5/);await page.evaluate(()=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent==='关闭').click());await page.click('#bClose');
  await page.evaluate(plan=>__desk.workflow.setPlan(plan),plan);await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});
  const result=await run(page);assert.equal(result.status,'complete');assert.equal(result.rows[0].choice.emotionScore,best);assert.equal(result.rows[1].choice.emotionScore,ranked[1].metrics.emotionScore);assert.equal(result.audit.emotion.total,ranked[0].metrics.emotionScore+ranked[1].metrics.emotionScore);
  const executed=await page.evaluate(()=>__desk.workflow.preview().plan);assert.equal(executed.ranking.emotionVersion,S.version);assert.deepEqual(result,A.solve(executed,summaries));assert.equal(await page.evaluate(()=>__desk.deskText()),original);
  assert.equal(await page.$$eval('#aSlots [data-slot] .emotion-score',es=>es.length),2);await page.click('[data-row-detail="1"]');await page.waitForSelector('#aRowDetail .emotion-breakdown');assert.match(await page.$eval('#aRowDetail',e=>e.textContent),/情绪分/);await page.screenshot({path:'/tmp/arrangement-emotion-detail.png'});
  await page.click('#aStatsTab');assert.match(await page.$eval('#aStatsBody',e=>e.textContent),/情绪分/);assert.match(await page.$eval('#aStatsBody',e=>e.textContent),/平均/);await page.screenshot({path:'/tmp/arrangement-emotion-stats.png'});await page.click('#aLevelsTab');
  // Worker and main-thread fallback keep exactly the same ranking.
  await page.evaluate(()=>{window.__emotionWorker=Worker;window.Worker=undefined;});assert.deepEqual(await run(page),result);await page.evaluate(()=>{window.Worker=__emotionWorker;});
  const exported=await page.evaluate(()=>__desk.workflow.exportPool());for(const entry of exported.entries)assert.deepEqual(entry.metrics.emotion,S.game(entry.game));
  // An old preview remains readable, but cannot be applied under a different scoring rule.
  await page.evaluate(async()=>{await __desk.flush();const preview=__desk.workflow.preview();delete preview.result.rankingVersion;delete preview.result.emotionVersion;delete preview.result.audit.emotion;for(const row of preview.result.rows){delete row.choice.emotionScore;delete row.choice.emotion;}await __desk.workflow.store.save('arrangementPreview',preview);});
  await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});assert.equal(await page.$eval('#aApply',e=>e.disabled),true);assert.match(await page.$eval('#aPreviewState',e=>e.textContent),/待更新/);assert.equal((await run(page)).rows[0].choice.emotionScore,best);
  await page.evaluate(()=>__desk.workflow.apply());assert.equal(await page.evaluate(()=>__desk.workflow.audit().emotion.total),result.audit.emotion.total);for(const g of await page.evaluate(()=>__desk.exportLevels()))assert.deepEqual(Object.keys(g).sort(),['curtains','e','g','id','lv','n','name','t','ty']);
  // Editing only extras must invalidate the emotion cache, even when target paths stay the same.
  const editEntry=entries.find(e=>e.metrics.emotion.extraSum!==0),editFile=P.exportFile({id:'emotion-edit',name:'额外词计分验收'},[editEntry],{[snapshot.id]:snapshot});assert(editEntry);
  await page.evaluate(file=>__desk.workflow.importPool(file),editFile);const editPlan=structuredClone(plan);editPlan.segments[0].to=1;editPlan.segments[0].poolIds=[editFile.pool.id];
  await page.evaluate(async plan=>{await __desk.workflow.setPlan(plan);await __desk.workflow.run();await __desk.workflow.apply();},editPlan);
  const changed=await page.evaluate(()=>{const d=__desk.campaign().levels[0],before=__desk.workflow.audit().emotion.total,word=d.extras.find(w=>WPEmotion.value(w));d.extras=d.extras.filter(w=>w!==word);const after=__desk.workflow.audit().emotion.total;return {before,after,delta:WPEmotion.value(word)*.5};});assert.equal(changed.after,changed.before-changed.delta);
  for(const name of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.setViewport({width:1280,height:720});await offline.goto(pathToFileURL(path.resolve(__dirname,'..',name)).href,{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());await offline.evaluate(file=>__desk.workflow.importPool(file),file);await offline.evaluate(plan=>__desk.workflow.setPlan(plan),plan);await offline.click('#btnArrange');await offline.waitForSelector('#arrange',{visible:true});assert.equal((await run(offline)).rows[0].choice.emotionScore,best);await offline.evaluate(()=>__desk.flush());await offline.reload({waitUntil:'load'});await offline.evaluate(()=>__desk.ready());assert.equal((await offline.evaluate(()=>__desk.workflow.preview())).result.rows[0].choice.emotionScore,best);await context.close();
  }
  assert.deepEqual(errors,[]);console.log('emotion browser: legacy/stale inventory rescored, visible formula/breakdowns, high-score choice, worker/Node/fallback parity, preview upgrade guard, apply/audit, extra-only edits, nine-field game export and both offline files passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
