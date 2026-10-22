/* Real Blob workers: determinism, response ordering, cancellation, fallback and cleanup. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {produce}=require('./workflow_helpers.cjs');
const puppeteer=require('puppeteer-core'),E=require('../src/gen'),L=require('../src/library'),A=require('../src/v2_adapter');
const profiles=require('../src/profiles.json'),data=require('../data/game_vocab/catalog.json'),tiers=L.tieredRecipes(data);
const lex=L.combine(data,{target:tiers.filter(r=>r.targetPool.sources.length),extra:tiers.filter(r=>r.extraPool.sources.length)}).lex;
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});
  await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());
  await page.evaluate(lex=>{
   window.__workerLex=lex;window.__nativeWorker=Worker;window.__liveWorkers=0;window.__workerUrls=new Set();
   const make=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
   URL.createObjectURL=x=>{const url=make(x);__workerUrls.add(url);return url};URL.revokeObjectURL=url=>{__workerUrls.delete(url);revoke(url)};
   window.__trackedWorker=class extends __nativeWorker{constructor(url){super(url);this.live=true;__liveWorkers++}terminate(){if(this.live){this.live=false;__liveWorkers--}super.terminate()}};
   window.Worker=__trackedWorker;
   window.__runWorkerRange=async({workers,config,count=4,start=51,...tuning})=>{
    const begin=performance.now(),engine=WPBatchGenerator.create({lex:__workerLex,profiles:WT_PROFILES,config,workers,workerSource:JSON.parse(batchWorker.textContent),...tuning}),history={usage:{},recent:new Map()},levels=[],failures=[];
    let pulses=0;const pulse=setInterval(()=>pulses++,10);
    try{for(let i=0;i<count;i++){const n=start+i,r=await engine.generateOne(n,history);if(r.ok){levels.push(r.level);for(const w of r.level.targets){history.usage[w]=(history.usage[w]||0)+1;history.recent.set(w,n)}}else failures.push(r)}return{levels,failures,status:engine.status(),pulses,ms:performance.now()-begin}}
    finally{clearInterval(pulse);engine.close()}
   };
  },lex);
  const config={...E.DEFAULTS,seed:'worker-parity-QA',attempts:100,preset:'list0'},expected=E.generateRange(E.buildIndex(lex),profiles,{...config,start:51,count:6});
  const one=await page.evaluate(config=>__runWorkerRange({workers:1,config,count:6}),config);
  const four=await page.evaluate(config=>__runWorkerRange({workers:4,config,count:6}),config);
  assert.deepEqual(one.levels,expected.levels);assert.deepEqual(four.levels,one.levels);assert.deepEqual(four.failures,one.failures);assert.equal(four.status.mode,'workers');assert.equal(four.status.workers,4);assert(four.pulses>0);
  assert.equal(await page.evaluate(()=>__liveWorkers+__workerUrls.size),0);
  const eight=await page.evaluate(config=>__runWorkerRange({workers:8,config,count:2}),config);
  assert.equal(eight.status.workers,8);assert.deepEqual(eight.levels,expected.levels.slice(0,2));
  assert.equal(await page.evaluate(()=>__liveWorkers+__workerUrls.size),0);
  for(const preset of ['list0','list5'])for(const start of [1,501]){
   const cfg={...config,preset},actual=await page.evaluate(args=>__runWorkerRange(args),{workers:4,config:cfg,count:3,start});
   assert.deepEqual(actual.levels,E.generateRange(E.buildIndex(lex),profiles,{...cfg,start,count:3}).levels);
   fs.writeFileSync('/tmp/workers-'+preset+'-'+start+'-levels.json',JSON.stringify(actual.levels.map(A.toGame)));
  }
  fs.writeFileSync('/tmp/workers-lex.json',JSON.stringify(lex));
  // Completion order cannot affect which candidate wins.
  await page.evaluate(()=>{window.Worker=class extends __trackedWorker{postMessage(m){if(m.type==='attempts'&&m.start===0)setTimeout(()=>{if(this.live)super.postMessage(m)},35);else super.postMessage(m)}}});
  const reordered=await page.evaluate(config=>__runWorkerRange({workers:4,config,count:6}),config);assert.deepEqual(reordered.levels,one.levels);
  // Unavailable workers, startup timeout and a mid-search failure retry the same deterministic search.
  const expectedOne=expected.levels.slice(0,1);
  for(const mode of ['unavailable','timeout','crash']){
   await page.evaluate(mode=>{
    if(mode==='unavailable')window.Worker=undefined;
    if(mode==='timeout')window.Worker=class extends __trackedWorker{postMessage(m){if(m.type!=='init')super.postMessage(m)}};
    if(mode==='crash'){window.__crashed=false;window.Worker=class extends __trackedWorker{postMessage(m){if(m.type==='attempts'&&!__crashed){__crashed=true;setTimeout(()=>this.onerror?.({message:'QA worker failure',preventDefault(){}}),0)}else super.postMessage(m)}}}
   },mode);
   const actual=await page.evaluate(config=>__runWorkerRange({workers:4,config,count:1,startupTimeoutMs:40}),config);
   assert.equal(actual.status.mode,'fallback',mode);assert.deepEqual(actual.levels,expectedOne,mode);assert.equal(await page.evaluate(()=>__liveWorkers+__workerUrls.size),0,mode);
  }
  await page.evaluate(()=>{window.Worker=__trackedWorker});
  // Inventory ranges keep every valid candidate and remain deterministic at nonzero offsets.
  const spec={width:3,height:3,targetCount:3},poolExpected=E.generatePoolAttempts(spec,E.buildIndex(lex),profiles,config,513,64);
  await page.evaluate(()=>{window.__runPool=async({config,spec,workers=4})=>{const gen=WPBatchGenerator.create({lex:__workerLex,profiles:WT_PROFILES,config,workers,startupTimeoutMs:40,workerSource:JSON.parse(batchWorker.textContent)});try{return {results:await gen.generateCandidates(spec,513,64),status:gen.status()}}finally{gen.close()}}});
  for(const mode of ['normal','reordered','unavailable','timeout','crash']){
   await page.evaluate(mode=>{
    window.Worker=__trackedWorker;
    if(mode==='reordered')window.Worker=class extends __trackedWorker{postMessage(m){if(m.poolSpec&&m.start===513)setTimeout(()=>{if(this.live)super.postMessage(m)},30);else super.postMessage(m)}};
    if(mode==='unavailable')window.Worker=undefined;
    if(mode==='timeout')window.Worker=class extends __trackedWorker{postMessage(m){if(m.type!=='init')super.postMessage(m)}};
    if(mode==='crash'){window.__crashed=false;window.Worker=class extends __trackedWorker{postMessage(m){if(m.poolSpec&&!__crashed){__crashed=true;setTimeout(()=>this.onerror?.({message:'inventory failure',preventDefault(){}}),0)}else super.postMessage(m)}}}
   },mode);
   const actual=await page.evaluate(args=>__runPool(args),{config,spec});assert.deepEqual(actual.results,poolExpected,mode);
   if(['unavailable','timeout','crash'].includes(mode))assert.equal(actual.status.mode,'fallback',mode);
   assert.equal(await page.evaluate(()=>__liveWorkers+__workerUrls.size),0,mode);
  }
  await page.evaluate(()=>{window.Worker=__trackedWorker});
  const original=await page.evaluate(()=>__desk.deskText());
  await page.evaluate(async()=>{const p=await __desk.workflow.store.createPool('取消验收');await __desk.workflow.refresh(p.id)});
  await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});await page.select('#bThreads','4');
  await page.evaluate(()=>{document.querySelector('[data-production="quantity"]').value=100;bBudget.value=5000;__desk.startBatch();bStop.click()});
  await page.waitForFunction(()=>window.__lastBatch);assert.equal(await page.evaluate(()=>__lastBatch.cancelled),true);assert.equal(await page.evaluate(()=>__lastBatch.made),0);assert.equal(await page.evaluate(()=>__desk.deskText()),original);
  assert.equal(await page.evaluate(()=>__liveWorkers+__workerUrls.size),0);
  // Cancel during the second chunk: committed candidates survive; no late writes are accepted.
  await page.evaluate(()=>{
   window.__originalCreate=WPBatchGenerator.create;window.__chunkCalls=0;
   WPBatchGenerator.create=opts=>{const gen=__originalCreate(opts),generate=gen.generateCandidates.bind(gen);gen.generateCandidates=(...args)=>{const promise=generate(...args);if(++__chunkCalls===2)bStop.click();return promise};return gen};
   bSeed.value='partial-pool-cancel-QA';__desk.startBatch();
  });
  await page.waitForFunction(()=>window.__lastBatch);const partial=await page.evaluate(()=>__lastBatch);assert(partial.made>0);assert.equal(partial.cancelled,true);
  const count=await page.evaluate(async()=> (await __desk.workflow.store.allEntries(poolSelect.value)).length);assert.equal(count,partial.made);
  await new Promise(r=>setTimeout(r,100));assert.equal(await page.evaluate(async()=> (await __desk.workflow.store.allEntries(poolSelect.value)).length),count);
  assert.equal(await page.evaluate(()=>__desk.deskText()),original);assert.equal(await page.evaluate(()=>__liveWorkers+__workerUrls.size),0);
  await page.evaluate(()=>{WPBatchGenerator.create=__originalCreate});
  // Campaign edits during production persist independently of the inventory run.
  await page.evaluate(()=>{document.querySelector('[data-production="quantity"]').value=3;__desk.startBatch();__desk.campaign().levels[0].name='生成期间的编辑'});
  await page.waitForFunction(()=>window.__lastBatch);assert.equal(await page.evaluate(()=>__lastBatch.made),3);assert.equal(await page.evaluate(()=>__desk.campaign().levels[0].name),'生成期间的编辑');
  assert.equal(await page.evaluate(()=>__liveWorkers+__workerUrls.size),0);await page.click('#bClose');
  for(const name of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.goto(pathToFileURL(path.resolve(__dirname,'..',name)).href,{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());
   await offline.evaluate(()=>{bThreads.value='2'});const {result}=await produce(offline,2,'offline-workers-QA');assert.equal(result.execution,'workers');assert.equal(result.workers,2);await context.close();
  }
  assert.deepEqual(errors,[]);console.log('workers: Node parity, 1/4 threads, out-of-order results, history, responsiveness, fallback, timeout, crash recovery, inventory range parity, immediate/partial cancellation, cleanup and both offline HTML files passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
