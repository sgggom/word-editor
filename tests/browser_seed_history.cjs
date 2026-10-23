/* Actual seed use, history reuse and persistence through both workflow tools. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const puppeteer=require('puppeteer-core');
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function makePool(page,name){return page.evaluate(async name=>{const pool=await __desk.workflow.store.createPool(name);await __desk.workflow.refresh(pool.id);return pool.id;},name);}
async function configureProduction(page,count=2){
 await page.bringToFront();
 await page.evaluate(count=>{document.querySelector('[data-production="quantity"]').value=count;bBudget.value=count*300;bThreads.value='2';document.querySelector('[data-production="quantity"]').dispatchEvent(new Event('input',{bubbles:true}));},count);
 if(await page.$eval('#batch',e=>e.hidden))await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});
}
async function produce(page){await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch,{timeout:60000});return page.evaluate(()=>__lastBatch);}
async function arrange(page){if(await page.$eval('#aRunSettings',e=>e.open))await page.click('#aRunSettings [data-arrange-dialog-close]');await page.click('#aRun');await page.waitForFunction(()=>window.__lastArrangement,{timeout:60000});return page.evaluate(()=>__lastArrangement);}
async function planFor(page,poolId,count=2){
 const entries=await page.evaluate(id=>__desk.workflow.store.allEntries(id),poolId);
 const overrides=Object.fromEntries(Array.from({length:count},(_,i)=>[i+1,{targetCount:entries[i%entries.length].metrics.targetCount}]));
 return {kind:'wordpages-arrangement',schemaVersion:1,name:'种子验收',seed:'imported-seed',budget:1000000,requiredLetters:{id:'seed-test-neutral',levels:{}},overrides,segments:[{id:'s',from:1,to:count,width:3,height:3,targetCount:entries[0].metrics.targetCount,poolIds:[poolId],rules:{maxTurns:null,repeatGap:0}}]};
}
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true}),temp=fs.mkdtempSync(path.join(os.tmpdir(),'word-seeds-')),errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>__desk.ready());
  const original=await page.evaluate(()=>__desk.deskText()),poolA=await makePool(page,'自动种子库');await configureProduction(page);
  assert.equal(await page.$eval('#bSeedMode',e=>e.value),'auto');assert.equal(await page.$eval('#bSeed',e=>e.readOnly),true);
  const first=await produce(page),second=await produce(page);assert.equal(first.made,2);assert.equal(second.made,2);assert.notEqual(first.seed,second.seed);
  assert.equal(await page.$eval('#bSeed',e=>e.value),second.seed);assert.equal(await page.$eval('#bSeedHistory',e=>e.value),'','history remains selectable even for the most recent run');
  const entries=await page.evaluate(id=>__desk.workflow.store.allEntries(id),poolA),firstEntries=entries.filter(e=>e.generation.seed===first.seed);assert.equal(firstEntries.length,2);assert.equal(entries.filter(e=>e.generation.seed===second.seed).length,2);
  let history=await page.evaluate(()=>__desk.workflow.store.load('seedHistory'));assert.deepEqual(history.generation.map(e=>e.seed),[second.seed,first.seed]);assert(history.generation.every(e=>e.status==='complete'&&e.made===2&&e.finishedAt>=e.startedAt));
  // Reusing a historical seed in a fresh pool exactly reproduces the same candidates.
  const poolB=await makePool(page,'种子复用库');await page.select('#bSeedHistory',history.generation[1].id);assert.equal(await page.$eval('#bSeedMode',e=>e.value),'fixed');assert.equal(await page.$eval('#bSeed',e=>e.readOnly),false);
  const reused=await produce(page);assert.equal(reused.seed,first.seed);const replay=await page.evaluate(id=>__desk.workflow.store.allEntries(id),poolB);assert.deepEqual(replay.map(e=>e.id).sort(),firstEntries.map(e=>e.id).sort());
  // The original pool keeps its continuation cursor instead of silently duplicating inventory.
  await page.select('#poolSelect',poolA);await page.waitForFunction(id=>document.querySelector('#poolSelect').value===id,{},poolA);const appended=await produce(page);assert.equal(appended.seed,first.seed);assert.equal(appended.made,2);
  const later=await page.evaluate(({id,seed})=>__desk.workflow.store.allEntries(id).then(es=>es.filter(e=>e.generation.seed===seed)),{id:poolA,seed:first.seed});assert.equal(later.length,4);assert.equal(new Set(later.map(e=>e.generation.ordinal)).size,4);
  await page.select('#bSeedMode','auto');await configureProduction(page,10000);await page.evaluate(async()=>{const run=__desk.startBatch();bStop.click();await run;});
  const cancelled=await page.evaluate(()=>__lastBatch);assert(cancelled.cancelled);assert.notEqual(cancelled.seed,first.seed);history=await page.evaluate(()=>__desk.workflow.store.load('seedHistory'));assert.equal(history.generation[0].status,'cancelled');assert.equal(history.generation[0].seed,cancelled.seed);
  const beforeInvalid=history.generation.length;await page.evaluate(async()=>{document.querySelector('[data-production="quantity"]').value=0;await __desk.startBatch()});assert.equal((await page.evaluate(()=>__desk.workflow.store.load('seedHistory'))).generation.length,beforeInvalid,'invalid configuration is not a seed use');
  await configureProduction(page,2);await page.screenshot({path:'/tmp/seed-history-generation.png'});await page.click('#bClose');await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());assert.equal(await page.evaluate(()=>__desk.deskText()),original);
  assert.equal(await page.$eval('#bSeedMode',e=>e.value),'auto');assert.deepEqual((await page.evaluate(()=>__desk.workflow.store.load('seedHistory'))).generation,history.generation);

  await page.evaluate(plan=>__desk.workflow.setPlan(plan),await planFor(page,poolA));await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});await page.select('#aSeedMode','auto');
  const arranged1=await arrange(page),arranged2=await arrange(page);assert.equal(arranged1.status,'complete');assert.equal(arranged2.status,'complete');assert.notEqual(arranged1.seed,arranged2.seed);
  assert.equal((await page.evaluate(()=>__desk.workflow.preview())).plan.seed,arranged2.seed);assert.equal(await page.$eval('#aSeed',e=>e.value),arranged2.seed);
  history=await page.evaluate(()=>__desk.workflow.store.load('seedHistory'));assert.deepEqual(history.arrangement.map(e=>e.seed),[arranged2.seed,arranged1.seed]);assert(history.arrangement.every(e=>e.status==='complete'&&e.matched===2));
  await page.click('#aRunSettingsOpen');await page.select('#aSeedHistory',history.arrangement[1].id);assert.equal(await page.$eval('#aSeedMode',e=>e.value),'fixed');const arrangedAgain=await arrange(page);assert.equal(arrangedAgain.seed,arranged1.seed);assert.deepEqual(arrangedAgain.rows,arranged1.rows);
  await page.screenshot({path:'/tmp/seed-history-arrangement.png'});
  const importPath=path.join(temp,'plan.json');fs.writeFileSync(importPath,JSON.stringify(await planFor(page,poolA)));await page.select('#aSeedMode','auto');await (await page.$('#arrangementFile')).uploadFile(importPath);await page.waitForFunction(()=>document.querySelector('#aSeedMode').value==='fixed'&&document.querySelector('#aSeed').value==='imported-seed');assert.equal((await arrange(page)).seed,'imported-seed','imported plans retain their recorded seed');
  await page.evaluate(plan=>__desk.workflow.setPlan(plan),await planFor(page,poolA,1000));await page.click('#aRunSettingsOpen');await page.click('#aRetry');assert.equal(await page.$eval('#aSeedMode',e=>e.value),'auto');await page.evaluate(async()=>{const run=__desk.workflow.run();aStop.click();await run;});assert.equal(await page.evaluate(()=>__lastArrangement.status),'cancelled');
  history=await page.evaluate(()=>__desk.workflow.store.load('seedHistory'));assert.equal(history.arrangement[0].status,'cancelled');assert.equal(history.arrangement[0].seed,await page.evaluate(()=>__lastArrangement.seed));assert.equal(await page.evaluate(()=>__desk.deskText()),original);
  await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());assert.deepEqual(await page.evaluate(()=>__desk.workflow.store.load('seedHistory')),history);assert.equal(await page.$eval('#aSeedMode',e=>e.value),'auto');

  // Two pages start from the same history snapshot; both new records must survive.
  const peer=await browser.newPage();peer.on('pageerror',e=>errors.push(e.message));await peer.setViewport({width:1440,height:1000});await peer.goto(base,{waitUntil:'load'});await peer.evaluate(()=>__desk.ready());
  await makePool(page,'并行窗口 A');await makePool(peer,'并行窗口 B');await configureProduction(page,1);await configureProduction(peer,1);await page.select('#bSeedMode','auto');await peer.select('#bSeedMode','auto');
  const parallel=await Promise.all([page,peer].map(p=>p.evaluate(async()=>{await __desk.startBatch();return __lastBatch;}))),merged=await page.evaluate(()=>__desk.workflow.store.load('seedHistory'));assert.equal(merged.generation.length,history.generation.length+2);for(const result of parallel)assert.equal(merged.generation.find(e=>e.seed===result.seed)?.status,'complete');
  await page.bringToFront();await page.click('#bClose');await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});assert.equal(await page.$$eval('#bSeedHistory option',es=>es.length),merged.generation.length+1);await peer.close();

  for(const name of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.setViewport({width:1440,height:1000});await offline.goto(pathToFileURL(path.resolve(__dirname,'..',name)).href,{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());
   // Upgrade preserves the old stored seed, without retaining the old fixed default.
   await offline.evaluate(()=>__desk.workflow.store.save('generation',{seed:'LEGACY-SAVED'}));await offline.reload({waitUntil:'load'});await offline.evaluate(()=>__desk.ready());assert.equal(await offline.$eval('#bSeedMode',e=>e.value),'auto');assert.equal((await offline.evaluate(()=>__desk.workflow.store.load('seedHistory'))).generation[0].seed,'LEGACY-SAVED');
   const id=await makePool(offline,'离线种子库');await configureProduction(offline,1);const a=await produce(offline),b=await produce(offline);assert.notEqual(a.seed,b.seed);await offline.click('#bClose');
   await offline.evaluate(plan=>__desk.workflow.setPlan(plan),await planFor(offline,id,1));await offline.click('#btnArrange');await offline.waitForSelector('#arrange',{visible:true});await offline.select('#aSeedMode','auto');const x=await arrange(offline),y=await arrange(offline);assert.notEqual(x.seed,y.seed);
   await offline.evaluate(()=>__desk.flush());await offline.reload({waitUntil:'load'});await offline.evaluate(()=>__desk.ready());const saved=await offline.evaluate(()=>__desk.workflow.store.load('seedHistory'));assert.equal(saved.generation.length,3);assert.equal(saved.arrangement.length,2);assert.equal(saved.arrangement[0].seed,y.seed);await context.close();
  }
  assert.deepEqual(errors,[]);console.log('seed history: fresh seeds on every automatic run, exact historical reuse, continuation, cancellation, invalid-input handling, scheme import, persistence, migration and both offline files passed');
 }finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
