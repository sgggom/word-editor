const {produceAndApply}=require('./workflow_helpers.cjs');
/* One-time preset migration must preserve personal edits and historical snapshots. */
const assert=require('node:assert/strict'),puppeteer=require('puppeteer-core'),fs=require('node:fs');
const L=require('../src/library'),data=require('../data/game_vocab/catalog.json');
const base=process.env.BASE_URL||'http://127.0.0.1:8000/';
const chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
  const ready=async()=>{await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready())};await ready();
  assert.deepEqual(await page.evaluate(()=>__desk.libraries().recipes),L.tieredRecipes(data));
  const old=L.tieredRecipes(data).map(r=>{r.revision=1;delete r.targetPool.excludeTwoLetter;delete r.extraPool.excludeTwoLetter;return r});
  const edited=old[0];edited.name='我的核心';edited.revision=5;edited.targetPool.operation='union';
  const deleted=old.splice(1,1)[0];
  const custom={...L.defaultRecipe(data),id:'keep-custom',name:'自定义保留',revision:7};
  const oldSnapshot=L.snapshot(data,L.defaultRecipe(data));assert.equal(oldSnapshot.lex.filter(x=>x.word.length===2).length,28);
  const defaultId=edited.id,extraId='four-game-extra-level3';
  await page.evaluate(()=>__desk.flush());
  await page.evaluate(async({old,custom,defaultId,extraId,oldSnapshot})=>{
   const campaign=JSON.parse(__desk.deskText());campaign.levels[0].librarySnapshotId=oldSnapshot.id;campaign.librarySnapshots={...campaign.librarySnapshots,[oldSnapshot.id]:oldSnapshot};
   const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('wp.leveldesk',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv');
    store.put({schemaVersion:1,presetVersion:'four-game-tiers-v1',recipes:[...old,custom],defaultId,savedAt:Date.now()},'libraries');
    store.put({schemaVersion:1,defaultId,targetIds:[defaultId],extraIds:[extraId],savedAt:Date.now()},'batchLibraries');store.put(campaign,'campaign');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)
   });db.close();
  },{old,custom,defaultId,extraId,oldSnapshot});
  await ready();
  const expected=old.map(r=>({...r,revision:r.revision+1,targetPool:{...r.targetPool,excludeTwoLetter:true},extraPool:{...r.extraPool,excludeTwoLetter:true}}));expected.push(custom);
  const state=await page.evaluate(()=>__desk.libraries());assert.deepEqual(state.recipes,expected);assert.equal(state.defaultId,defaultId);
  assert(!state.recipes.some(r=>r.id===deleted.id));assert.equal(state.recipes[0].name,'我的核心');assert.equal(state.recipes[0].targetPool.operation,'union');
  assert.deepEqual(await page.evaluate(id=>__desk.campaign().librarySnapshots[id],oldSnapshot.id),oldSnapshot);
  assert.equal(await page.evaluate(()=>__desk.campaign().levels[0].librarySnapshotId),oldSnapshot.id);
  await page.click('#btnBank');await page.select('#librarySelect',extraId);
  assert.match(await page.$eval('#bankFilters',e=>e.textContent),/已排除两字母词/);
  assert.equal((await page.evaluate(()=>__desk.libraries())).preview.extras,5415);
  await page.click('[data-library-view="range"]');assert.match(await page.$eval('#libraryRangeCaption',e=>e.textContent),/已排除两字母词/);
  const draft=await page.evaluate(()=>__desk.libraries().draft);assert.deepEqual(L.compile(data,JSON.parse(JSON.stringify(draft))).lex,L.compile(data,draft).lex);
  assert(!L.partitionPool(data,draft.extraPool).union.some(w=>w.length===2));
  await page.click('#bankClose');await page.evaluate(()=>__desk.flush());await ready();assert.deepEqual((await page.evaluate(()=>__desk.libraries())).recipes,expected,'migration is idempotent');
  await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});
  assert.deepEqual(await page.$$eval('[data-batch-library="target"]:checked',es=>es.map(e=>e.value)),[defaultId]);
  assert.equal(await page.$('[data-batch-library="extra"]'),null,'legacy extra selection is replaced by full automatic calibration');
  await produceAndApply(page,1,'no-two-letter-QA');
  const result=await page.evaluate(()=>{const camp=__desk.campaign(),level=camp.levels[0];return{snapshot:camp.librarySnapshots[level.librarySnapshotId],levels:__desk.exportLevels()}});
  assert(result.snapshot.lex.every(x=>x.word.length>=3));
  assert.deepEqual(result.snapshot,L.production(data,[expected.find(r=>r.id===defaultId)]).snapshot);
  fs.writeFileSync('/tmp/no-two-letter-levels.json',JSON.stringify(result.levels));fs.writeFileSync('/tmp/no-two-letter-lex.json',JSON.stringify(result.snapshot.lex));
  assert.deepEqual(errors,[]);console.log('short-word presets: fresh defaults, v1 migration, edits/deletions/custom configs, historical snapshots, range filtering, selection persistence, reload and generation passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
