/* Real UI, workers, persistence, variable-count arrangement/play and offline files. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),puppeteer=require('puppeteer-core');
const E=require('../src/gen'),L=require('../src/library'),P=require('../src/level_pool'),data=require('../data/game_vocab/catalog.json');
const snapshot=L.production(data,[L.tieredRecipes(data)[0]]).snapshot,ix=E.buildIndex(snapshot.lex);
const spec={width:5,height:3,initialLetters:'ABC'},config={seed:'straight-QA'};
const candidates=E.generatePoolAttempts(spec,ix,null,config,0,256).filter(Boolean).sort((a,b)=>b.level.targets.length-a.level.targets.length);
const large=candidates[0],entry=P.record(P.gameOf(large.level),snapshot,{ordinal:large.ordinal,seed:config.seed,engine:E.SEARCH_VERSION,...large.level.construction},ix);
assert(entry.metrics.targetCount>16);
const file=P.exportFile({id:'straight-large',name:'自动词数验收库'},[entry],{[snapshot.id]:snapshot});
const plan={kind:'wordpages-arrangement',schemaVersion:1,name:'自动词数排布',seed:'straight-apply',budget:1000,requiredLetters:{id:'neutral',levels:{}},overrides:{},segments:[{id:'s',from:1,to:1,width:5,height:3,targetCount:entry.metrics.targetCount,poolIds:[file.pool.id],rules:{maxTurns:null,repeatGap:0}}]};
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function confirm(page,label){await page.waitForSelector('#modal',{visible:true});await page.evaluate(label=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent===label).click(),label);await page.waitForSelector('#modal',{hidden:true});}
async function exercise(page,url){
 await page.setViewport({width:1440,height:1000});await page.goto(url,{waitUntil:'load'});await page.evaluate(()=>__desk.ready());
 const original=await page.evaluate(()=>__desk.deskText());
 // An old count-based draft migrates to unrestricted initials; dimensions/quantities survive.
 await page.evaluate(async()=>{await __desk.flush();await __desk.workflow.store.save('generation',{rows:[{width:4,height:2,targetCount:16,quantity:3}],seed:'old-seed'});});
 await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());
 assert.equal(await page.$('[data-production="targetCount"]'),null);assert.equal(await page.$eval('[data-production="initialLetters"]',e=>e.value),'');
 assert.equal(await page.$eval('[data-production="size"]',e=>e.value),'4x2');
 const id=await page.evaluate(async()=>{const pool=await __desk.workflow.store.createPool('批次首字母测试');await __desk.workflow.refresh(pool.id);return pool.id;});
 await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});await page.click('#bAddRow');
 await page.evaluate(()=>{
  const rows=[...document.querySelectorAll('#productionTable tbody tr')];
  rows[0].querySelector('[data-production="initialLetters"]').value='b, a';
  rows[1].querySelector('[data-production="initialLetters"]').value='C';rows[1].querySelector('[data-production="quantity"]').value=3;
  bSeedMode.value='fixed';bSeedMode.dispatchEvent(new Event('change',{bubbles:true}));bSeed.value='batch-initials-QA';bThreads.value='2';bBudget.value=1800;
  rows[1].querySelector('[data-production="quantity"]').dispatchEvent(new Event('input',{bubbles:true}));
 });
 await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch,{timeout:60000});assert.equal((await page.evaluate(()=>__lastBatch)).made,6);
 const entries=await page.evaluate(id=>__desk.workflow.store.allEntries(id),id);
 assert.equal(entries.filter(e=>e.generation.initialLetters==='AB').length,3);assert.equal(entries.filter(e=>e.generation.initialLetters==='C').length,3);
 for(const e of entries){assert.equal(e.generation.targetCount,e.metrics.targetCount);assert.equal(e.generation.engine,E.LENGTH_SEARCH_VERSION);assert(e.generation.placements.filter(p=>p.phase==='initials').every(p=>e.generation.initialLetters.includes(p.word[0])));}
 assert.equal(await page.evaluate(()=>__desk.deskText()),original);
 const exported=await page.evaluate(()=>__desk.workflow.exportPool());assert.equal((await page.evaluate(({file,id})=>__desk.workflow.importPool(file,id),{file:exported,id})).added,0);
 await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());
 assert.deepEqual(await page.$$eval('[data-production="initialLetters"]',es=>es.map(e=>e.value)),['b, a','C']);
 // Reordering an equivalent letter set keeps the same candidate stream and continues its cursor.
 await page.evaluate(()=>{const rows=document.querySelectorAll('#productionTable tbody tr');rows[1].remove();rows[0].querySelector('[data-production="initialLetters"]').value='AB';rows[0].querySelector('[data-production="quantity"]').value=1;});
 await page.evaluate(()=>__desk.startBatch());assert.equal((await page.evaluate(()=>__lastBatch)).made,1);
 const next=await page.evaluate(id=>__desk.workflow.store.allEntries(id),id),before=entries.filter(e=>e.generation.initialLetters==='AB');
 const added=next.find(e=>!entries.some(old=>old.id===e.id));assert(added.generation.ordinal>Math.max(...before.map(e=>e.generation.ordinal)));
 const historyCount=await page.evaluate(async()=>(await __desk.workflow.store.load('seedHistory')).generation.length);
 await page.evaluate(async()=>{document.querySelector('[data-production="initialLetters"]').value='A1';await __desk.startBatch();});
 assert.equal(await page.evaluate(async()=>(await __desk.workflow.store.load('seedHistory')).generation.length),historyCount);
 // A >16-word level survives file import, exact-count arrangement, application and play.
 await page.evaluate(file=>__desk.workflow.importPool(file),file);await page.evaluate(plan=>__desk.workflow.setPlan(plan),plan);
 await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});assert.equal(await page.$eval('[data-seg="targetCount"]',e=>Number(e.value)),entry.metrics.targetCount);
 await page.click('#aRun');await page.waitForFunction(()=>window.__lastArrangement,{timeout:60000});assert.equal((await page.evaluate(()=>__lastArrangement)).status,'complete');
 assert.equal(await page.evaluate(()=>__desk.deskText()),original);
 await page.click('#aApply');await confirm(page,'应用');await page.waitForSelector('#arrange',{hidden:true});
 assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),true);
 let games=await page.evaluate(()=>__desk.exportLevels());assert.equal(games.length,1);assert.deepEqual(games[0].t.split(" ").sort(),entry.game.t.split(" ").sort());assert.equal(games[0].n,entry.game.n);assert.deepEqual(Object.keys(games[0]).sort(),['curtains','e','g','id','lv','n','name','t','ty']);
 await page.click('#levelList [data-level-index="0"] [data-level-action="detail"]');await page.click('#btnPlay');await page.waitForSelector('#play',{visible:true});
 assert.equal(await page.evaluate(()=>__desk.campaign().levels[0]._proof?.ok),true);await page.click('#pBack');
 await page.evaluate(()=>__desk.flush());const saved=await page.evaluate(()=>__desk.deskText());await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());assert.equal(await page.evaluate(()=>__desk.deskText()),saved);assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),games);
 await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});await page.click('#aFromCurrent');assert.equal((await page.evaluate(()=>__desk.workflow.plan())).segments[0].targetCount,entry.metrics.targetCount);
 await page.click('#aClose');
}
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true}),errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await exercise(page,base);
  const expected=E.generatePoolAttempts(spec,ix,null,config,19,32);
  for(const workers of [1,4,0]){
   const actual=await page.evaluate(async({lex,spec,config,workers})=>{
    const native=Worker;if(!workers)window.Worker=undefined;
    const gen=WPBatchGenerator.create({lex,profiles:WT_PROFILES,config,workers:workers||4,workerSource:JSON.parse(batchWorker.textContent)});
    try{return {results:await gen.generateCandidates(spec,19,32),mode:gen.status().mode};}finally{gen.close();window.Worker=native;}
   },{lex:snapshot.lex,spec,config,workers});assert.deepEqual(actual.results,expected);assert.equal(actual.mode,workers?'workers':'fallback');
  }
  await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});await page.$eval('[data-production="initialLetters"]',e=>{e.value='A B C';e.dispatchEvent(new Event('input',{bubbles:true}));});await page.screenshot({path:'/tmp/straight-generation-panel.png'});
  for(const name of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
   try{await exercise(offline,pathToFileURL(path.resolve(__dirname,'..',name)).href);}finally{await context.close();}
  }
  assert.deepEqual(errors,[]);console.log(`straight browser: per-batch initials, draft migration, persistence/continuation, ${entry.metrics.targetCount}-word arrangement/export/play, 1/4-worker and fallback parity, HTTP and both offline files passed`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
