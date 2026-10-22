/* Real editor flows. Requires a static server, puppeteer-core and Chromium. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const puppeteer=require('puppeteer-core'),E=require('../src/gen'),P=require('../src/level_pool'),L=require('../src/library');
const profiles=require('../src/profiles.json'),data=require('../data/game_vocab/catalog.json'),required=require('../data/required_letters.json');
const snapshot=L.snapshot(data,L.tieredRecipes(data)[0]),ix=E.buildIndex(snapshot.lex);
const tiers=L.tieredRecipes(data),fixtureSnapshot=L.combine(data,{target:tiers.filter(r=>r.targetPool.sources.length),extra:tiers.filter(r=>r.extraPool.sources.length)}).snapshot,fixtureIndex=E.buildIndex(fixtureSnapshot.lex);
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const defaults=JSON.parse(html.match(/<script id="sample" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const game=structuredClone(defaults.books[0].levels[0]);game.e=E.validate(P.parseGame(game),fixtureIndex,E.DEFAULTS).extras.join(' ');
const fixture=P.record(game,fixtureSnapshot,{seed:'fixture'}),poolFile=P.exportFile({id:'qa-fixture-pool',name:'排布验收库'},[fixture],{[fixtureSnapshot.id]:fixtureSnapshot});
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
function onePlan(poolId){return {kind:'wordpages-arrangement',schemaVersion:1,name:'验收关序',seed:'qa-arrange',budget:1000000,requiredLetters:required,overrides:{},segments:[{id:'first',from:1,to:1,width:3,height:3,targetCount:3,poolIds:[poolId],rules:{maxTurns:1,repeatGap:20}}]};}
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pool-split-browser-')),browser=await puppeteer.launch({executablePath:chrome,headless:true});
 const errors=[];let page;
 try{
  page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});
  const ready=()=>page.evaluate(()=>__desk.ready());
  const confirm=async label=>{await page.waitForSelector('#modal',{visible:true});await page.evaluate(label=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent===label).click(),label);await page.waitForSelector('#modal',{hidden:true});};
  await page.goto(base,{waitUntil:'networkidle0'});await ready();assert.equal(await page.evaluate(()=>__desk.campaign().levels.length),100);assert.deepEqual(await page.evaluate(()=>__desk.workflow.pools()),[]);
  const before=await page.evaluate(()=>__desk.deskText()),libraries=await page.evaluate(()=>__desk.libraries().recipes);
  await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});await page.click('#poolNew');await page.waitForSelector('#poolNameInput',{visible:true});await page.type('#poolNameInput','前期必答词关卡');await confirm('创建');
  await page.waitForFunction(()=>document.querySelector('#poolSelect').value&&!document.querySelector('#bGo').disabled);
  const producedPool=await page.$eval('#poolSelect',e=>e.value);
  await page.$eval('[data-production="quantity"]',e=>{e.value=5;e.dispatchEvent(new Event('input',{bubbles:true}));});await page.select('#bThreads','2');
  await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch,{timeout:90000});
  const generation=await page.evaluate(()=>__lastBatch);assert.equal(generation.made,5,JSON.stringify(generation));assert.equal(generation.execution,'workers');
  assert.equal(await page.evaluate(()=>__desk.deskText()),before,'generation must not modify the campaign');assert.deepEqual(await page.evaluate(()=>__desk.libraries().recipes),libraries);
  await page.waitForFunction(()=>document.querySelectorAll('#poolEntries [data-pool-preview]').length===5);
  const produced=await page.evaluate(id=>__desk.workflow.store.allEntries(id),producedPool);
  assert(produced.every(e=>e.metrics.width===3&&e.metrics.height===3&&e.metrics.targetCount===3));assert(!produced.some(e=>e.generation.number));
  const exported=await page.evaluate(()=>__desk.workflow.exportPool());assert.equal(exported.entries.length,5);assert.equal(Object.keys(exported.librarySnapshots).length,1);
  const duplicate=await page.evaluate(({file,id})=>__desk.workflow.importPool(file,id),{file:exported,id:producedPool});assert.equal(duplicate.added,0);
  const reordered=JSON.parse(JSON.stringify(exported));reordered.librarySnapshots=Object.fromEntries(Object.entries(reordered.librarySnapshots).map(([id,snap])=>[id,Object.fromEntries(Object.entries(snap).reverse())]));
  assert.equal((await page.evaluate(({file,id})=>__desk.workflow.importPool(file,id),{file:reordered,id:producedPool})).added,0,'JSON key order does not change snapshot identity');
  const rollback=await page.evaluate(async id=>{const store=__desk.workflow.store,entries=await store.allEntries(id),first=entries[0];try{await store.putEntries(id,[{...first,id:'rollback-probe'},{...first,signature:'conflicting-signature'}]);return false;}catch(error){return (await store.allEntries(id)).length===entries.length&&!(await store.getEntry(id,'rollback-probe'));}},producedPool);assert(rollback,'a rejected batch must roll back records and pool count together');
  await page.click('#poolEntries [data-pool-preview]');await confirm('试玩');await page.waitForSelector('#play',{visible:true});await page.click('#pBack');await page.waitForSelector('#play',{hidden:true});assert.equal(await page.evaluate(()=>__desk.deskText()),before,'inventory play must restore the original campaign');

  await page.$eval('#bBudget',e=>{e.value=1;e.dispatchEvent(new Event('input',{bubbles:true}));});await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch);assert.equal(await page.evaluate(()=>__lastBatch.attempted),1);assert((await page.evaluate(()=>__lastBatch.made))<5);assert.equal(await page.evaluate(()=>__desk.deskText()),before);
  await page.$eval('#bBudget',e=>{e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));});

  // Cancellation retains committed inventory and never touches the campaign.
  await page.$eval('[data-production="quantity"]',e=>{e.value=10000;e.dispatchEvent(new Event('input',{bubbles:true}));});await page.click('#bGo');await page.waitForFunction(()=>document.querySelector('#bStop').disabled===false);await page.click('#bStop');await page.waitForFunction(()=>window.__lastBatch,{timeout:30000});
  assert.equal(await page.evaluate(()=>__lastBatch.cancelled),true);assert.equal(await page.evaluate(()=>__desk.deskText()),before);
  const fixturePath=path.join(temp,'fixture.pool.json');fs.writeFileSync(fixturePath,JSON.stringify(poolFile));await (await page.$('#poolFile')).uploadFile(fixturePath);await confirm('导入');
  await page.waitForFunction(()=>document.querySelector('#poolSelect').value==='qa-fixture-pool');
  await page.screenshot({path:'/tmp/pool-split-generated.png'});await page.click('#bClose');
  await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});
  await page.$eval('[data-seg="to"]',e=>{e.value=1;e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.$$eval('[data-seg-pool]',els=>els.forEach(e=>{e.checked=e.value==='qa-fixture-pool';e.dispatchEvent(new Event('input',{bubbles:true}));}));
  await page.click('[data-segment-fill]');await page.waitForFunction(()=>!document.querySelector('#aRun').disabled);
  await page.click('#aRun');await page.waitForFunction(()=>window.__lastArrangement,{timeout:60000});assert.equal(await page.evaluate(()=>__lastArrangement.status),'complete');
  assert.equal(await page.evaluate(()=>__desk.deskText()),before,'arrangement preview must not modify the campaign');
  assert.equal(await page.$eval('#aApply',e=>e.disabled),false);await page.screenshot({path:'/tmp/pool-split-arranged.png'});
  await page.click('#aApply');await confirm('取消');assert.equal(await page.evaluate(()=>__desk.deskText()),before);
  await page.click('#aApply');await confirm('应用');await page.waitForSelector('#arrange',{hidden:true});assert.equal(await page.evaluate(()=>__desk.campaign().levels.length),1);
  assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),true);assert.equal(await page.evaluate(()=>__desk.file()),null);
  const arranged=await page.evaluate(()=>__desk.deskText()),games=await page.evaluate(()=>__desk.exportLevels());assert.equal(games[0].id,'1');assert.deepEqual(Object.keys(games[0]).sort(),['curtains','e','g','id','lv','n','name','t','ty']);
  await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'networkidle0'});await ready();assert.equal(await page.evaluate(()=>__desk.deskText()),arranged);assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),true);
  await page.click('#levelList [data-level-index="0"] [data-level-action="detail"]');
  await page.$eval('#grid input[data-i="2"]',e=>{e.value='Q';e.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal((await page.evaluate(()=>__desk.exportLevels())).length,0,'editing must recheck bound arrangement rules');
  await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');await page.waitForFunction(()=>__desk.workflow.audit().ok);assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),games);
  await page.click('#btnBackToList');
  const savedPath=path.join(temp,'arranged.wordpages.json');fs.writeFileSync(savedPath,arranged);await (await page.$('#file')).uploadFile(savedPath);await confirm('导入');await page.evaluate(()=>__desk.flush());assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),true);
  await page.click('#btnHistory');await page.waitForSelector('#hist',{visible:true});await page.click('[data-hdefault]');await confirm('导入');await page.waitForSelector('#hist',{hidden:true});
  assert.equal(await page.evaluate(()=>__desk.campaign().levels.length),100);assert.equal(await page.evaluate(()=>__desk.campaign().arrangement),null);assert.deepEqual(await page.evaluate(()=>JSON.parse(__desk.packText())),defaults);

  // Missing inventory creates a positional gap and cannot be applied/exported.
  const incomplete=onePlan('qa-fixture-pool');incomplete.segments[0].to=2;
  await page.evaluate(plan=>__desk.workflow.setPlan(plan),incomplete);await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});await page.click('#aRun');await page.waitForFunction(()=>window.__lastArrangement,{timeout:60000});
  assert.equal(await page.evaluate(()=>__lastArrangement.rows.length),2);assert.equal(await page.$eval('#aApply',e=>e.disabled),true);assert.equal(await page.evaluate(()=>__desk.campaign().levels.length),100);
  const storedPlan=await page.evaluate(()=>__desk.workflow.plan());await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'networkidle0'});await ready();assert.deepEqual(await page.evaluate(()=>__desk.workflow.plan()),storedPlan);assert.equal((await page.evaluate(()=>__desk.workflow.preview())).result.rows.length,2);

  const cancelPlan=onePlan('qa-fixture-pool');cancelPlan.segments[0].to=1000;await page.evaluate(plan=>__desk.workflow.setPlan(plan),cancelPlan);await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});
  await page.click('#aRun');await page.waitForFunction(()=>document.querySelector('#aProgress').textContent.startsWith('建立候选索引'));await page.click('#aStop');await page.waitForFunction(()=>window.__lastArrangement);
  assert.equal(await page.evaluate(()=>__lastArrangement.status),'cancelled');assert.equal(await page.evaluate(()=>__lastArrangement.rows.length),1000);assert.equal(await page.evaluate(()=>__desk.campaign().levels.length),100);await page.click('#aClose');

  // Real worker ordering and fallback deliver every successful candidate, not a best-only reduction.
  for(const workers of [1,4]){
   const actual=await page.evaluate(async({lex,workers})=>{const gen=WPBatchGenerator.create({lex,profiles:WT_PROFILES,config:{seed:'pool-parity'},workers,workerSource:JSON.parse(batchWorker.textContent)});try{return await gen.generateCandidates({width:3,height:3,targetCount:3},0,32)}finally{gen.close()}},{lex:snapshot.lex,workers});
   assert.deepEqual(actual,E.generatePoolAttempts({width:3,height:3,targetCount:3},ix,profiles,{seed:'pool-parity'},0,32));
  }
  const fallback=await page.evaluate(async lex=>{const native=Worker;window.Worker=undefined;const gen=WPBatchGenerator.create({lex,profiles:WT_PROFILES,config:{seed:'pool-parity'},workers:4,workerSource:JSON.parse(batchWorker.textContent)});try{return {status:gen.status(),results:await gen.generateCandidates({width:3,height:3,targetCount:3},0,32)}}finally{gen.close();window.Worker=native}},snapshot.lex);
  assert.equal(fallback.status.mode,'fallback');assert.deepEqual(fallback.results,E.generatePoolAttempts({width:3,height:3,targetCount:3},ix,profiles,{seed:'pool-parity'},0,32));
  for(const file of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
   try{
    await offline.goto(pathToFileURL(path.resolve(__dirname,'..',file)).href,{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());
    await offline.evaluate(file=>__desk.workflow.importPool(file),poolFile);await offline.evaluate(plan=>__desk.workflow.setPlan(plan),onePlan('qa-fixture-pool'));
    await offline.evaluate(()=>__desk.workflow.run());assert.equal(await offline.evaluate(()=>__lastArrangement.status),'complete');await offline.evaluate(()=>__desk.workflow.apply());assert.equal(await offline.evaluate(()=>__desk.campaign().levels.length),1);
    assert.equal(await offline.evaluate(()=>__desk.workflow.audit().ok),true);
   }finally{await context.close();}
  }
  assert.deepEqual(errors,[]);console.log('inventory/arrangement browser: production isolation, shared snapshots, duplicate merge, inventory play, cancellation, UI arrangement/apply, export guard, file round trip, default compatibility, positional gaps, persistence, worker parity, fallback and both offline files passed');
 }catch(error){if(page&&!page.isClosed())console.error('UI state',await page.evaluate(()=>({toast:document.querySelector('#toast').textContent,progress:document.querySelector('#aProgress').textContent,generation:document.querySelector('#bOut').textContent})));throw error;}
 finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
