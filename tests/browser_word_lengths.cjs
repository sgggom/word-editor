/* Length preferences in generation and hard length rules on final positions. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),puppeteer=require('puppeteer-core');
const W=require('../src/lengths'),E=require('../src/gen'),P=require('../src/level_pool'),L=require('../src/library'),data=require('../data/game_vocab/catalog.json');
const snapshot=L.production(data,[L.tieredRecipes(data)[0]]).snapshot,ix=E.buildIndex(snapshot.lex),entries=[];
for(const [width,height,mode] of [[3,3,'opening'],[3,3,'standard'],[4,3,'standard']]){
 const results=E.generatePoolAttempts({width,height,initialLetters:'ABC',wordLengths:{mode}},ix,null,{seed:'browser-lengths'},0,96).filter(Boolean);
 for(const r of results.slice(0,8))entries.push(P.record(P.gameOf(r.level),snapshot,{seed:'browser-lengths',ordinal:r.ordinal,...r.level.construction},ix));
}
const file=P.exportFile({id:'lengths-fixture',name:'词长规则验收'},entries,{[snapshot.id]:snapshot}),chosen=[entries[0],entries[1],entries[8],entries[16]];
const plan={kind:'wordpages-arrangement',schemaVersion:1,name:'词长验收',seed:'lengths-arrange',budget:100000,targetLengths:true,targetLengthVersion:W.VERSION,requiredLetters:{id:'neutral',levels:{}},overrides:{},segments:chosen.map((e,i)=>({id:'s'+i,from:i+1,to:i+1,width:e.metrics.width,height:e.metrics.height,targetCount:e.metrics.targetCount,poolIds:[file.pool.id],rules:{maxTurns:null,repeatGap:0}}))};
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function input(page,selector,value){await page.$eval(selector,(e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function run(page){await page.click('#aRun');await page.waitForFunction(()=>window.__lastArrangement,{timeout:60000});return page.evaluate(()=>__lastArrangement);}
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true}),errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:900});await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>__desk.ready());
  const paritySpec={width:4,height:3,initialLetters:'ABC',wordLengths:{mode:'standard',ratios:[50,35,15]}},parityConfig={seed:'length-parity'};
  const expected=E.generatePoolAttempts(paritySpec,ix,null,parityConfig,19,32);
  for(const threads of [1,4,0]){
   const actual=await page.evaluate(async({lex,spec,config,threads})=>{const native=Worker;if(!threads)window.Worker=undefined;const g=WPBatchGenerator.create({lex,profiles:WT_PROFILES,config,workers:threads||4,workerSource:JSON.parse(batchWorker.textContent)});try{return {results:await g.generateCandidates(spec,19,32),mode:g.status().mode};}finally{g.close();window.Worker=native;}},{lex:snapshot.lex,spec:paritySpec,config:parityConfig,threads});
   assert.deepEqual(actual.results,expected);assert.equal(actual.mode,threads?'workers':'fallback');
  }
  const original=await page.evaluate(()=>__desk.deskText());assert.equal((await page.evaluate(()=>__desk.workflow.plan())).targetLengths,true);
  await page.evaluate(file=>__desk.workflow.importPool(file),file);await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});assert.match(await page.$eval('#poolEntries',e=>e.textContent),/字母/);
  await page.click('#bLengthSettingsOpen');await page.waitForSelector('#bLengthSettings[open]');
  assert.deepEqual(await page.$$eval('[data-length-size="3x3"] input',es=>es.map(e=>Number(e.value))),W.DEFAULT_RATIOS['3x3']);
  await input(page,'[data-length-size="3x3"] [data-length-ratio="0"]',80);await page.click('#bLengthApply');assert.equal(await page.$eval('#bLengthSettings',e=>e.open),true);assert.match(await page.$eval('#bLengthError',e=>e.textContent),/100/);
  await page.keyboard.press('Escape');await page.click('#bLengthSettingsOpen');assert.deepEqual(await page.$$eval('[data-length-size="3x3"] input',es=>es.map(e=>Number(e.value))),W.DEFAULT_RATIOS['3x3']);
  for(const [i,value] of [70,20,10].entries())await input(page,'[data-length-size="3x3"] [data-length-ratio="'+i+'"]',value);
  await page.screenshot({path:'/tmp/word-length-ratios.png'});await page.click('#bLengthApply');assert.deepEqual((await page.evaluate(()=>__desk.cfg())).rows[0].wordLengths.ratios,[70,20,10]);
  const poolId=await page.evaluate(async()=>{const p=await __desk.workflow.store.createPool('词长生产验收');await __desk.workflow.refresh(p.id);return p.id;});
  await page.select('[data-production="lengthMode"]','opening');await input(page,'[data-production="quantity"]',3);assert.equal(await page.$eval('[data-production="size"]',e=>e.value),'3x3');
  await page.click('#bAddRow');await page.select('#productionTable tbody tr:nth-child(2) [data-production="size"]','4x3');await input(page,'#productionTable tbody tr:nth-child(2) [data-production="quantity"]',3);
  await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch,{timeout:60000});assert.equal((await page.evaluate(()=>__lastBatch)).made,6);
  const made=await page.evaluate(id=>__desk.workflow.store.allEntries(id),poolId);assert.equal(made.filter(e=>e.generation.wordLengths.mode==='opening').length,3);
  for(const e of made){assert.equal(e.generation.engine,E.LENGTH_SEARCH_VERSION);assert.deepEqual(W.errors(P.words(e.game.t),e.metrics.width,e.metrics.height,e.generation.wordLengths.mode),[]);assert.deepEqual(e.metrics.lengthCounts,W.metrics(e.game).lengthCounts);}
  assert.equal(await page.evaluate(()=>__desk.deskText()),original);await page.click('#bClose');await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());assert.deepEqual((await page.evaluate(()=>__desk.cfg())).rows[0].wordLengths.ratios,[100,0,0]);assert.deepEqual((await page.evaluate(()=>__desk.workflow.store.load('generation'))).lengthRatios['3x3'],[70,20,10]);
  // Existing inventory without length metrics is enriched when read, without rewriting IDs.
  const legacyFile=structuredClone(file);for(const e of legacyFile.entries){delete e.metrics.lengthCounts;e.metrics.longCount=9999;}
  await page.evaluate(file=>__desk.workflow.importPool(file),legacyFile);const reread=await page.evaluate(id=>__desk.workflow.store.allEntries(id),file.pool.id);for(const e of reread)assert.deepEqual(e.metrics.lengthCounts,W.metrics(e.game).lengthCounts);
  await page.evaluate(plan=>__desk.workflow.setPlan(plan),plan);await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});
  const result=await run(page);assert.equal(result.status,'complete');assert.equal(result.lengthVersion,W.VERSION);assert(result.audit.lengthCounts[5]>0);
  const selected=await page.evaluate(async()=>Promise.all(__lastArrangement.rows.map(row=>__desk.workflow.store.getEntry(row.choice.poolId,row.choice.id))));selected.forEach((e,i)=>assert.deepEqual(W.errors(P.words(e.game.t),e.metrics.width,e.metrics.height,i<2?'opening':'standard'),[]));
  await page.click('[data-row-detail="1"]');assert.match(await page.$eval('#aRowDetail',e=>e.textContent),/必答全为 3 字母/);await page.click('#aStatsTab');assert.match(await page.$eval('#aStatsBody',e=>e.textContent),/目标词长度/);await page.screenshot({path:'/tmp/word-length-arrangement-stats.png'});await page.click('#aLevelsTab');
  await page.click('#aLengthsOpen');await page.waitForSelector('#aLengthsEditor[open]');assert.equal(await page.$eval('#aEnableLengths',e=>e.checked),true);await page.screenshot({path:'/tmp/word-length-arrangement-rules.png'});await page.keyboard.press('Escape');assert.equal(await page.$eval('#aApply',e=>e.disabled),false,'viewing rules does not invalidate the preview');
  await page.evaluate(()=>__desk.workflow.apply());assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),true);assert.equal((await page.evaluate(()=>__desk.exportLevels())).length,4);assert.equal((await page.evaluate(()=>__desk.campaign().arrangement.plan)).targetLengths,true);
  const saved=await page.evaluate(()=>__desk.deskText());await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());assert.equal(await page.evaluate(()=>__desk.deskText()),saved);assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),true);
  // An old scheme opts in explicitly; disabling the new feature preserves legacy rules.
  const legacy=structuredClone(plan);delete legacy.targetLengths;delete legacy.targetLengthVersion;legacy.segments[0].width=4;legacy.segments[0].height=2;legacy.segments[0].targetCount=2;
  await page.evaluate(plan=>__desk.workflow.setPlan(plan),legacy);await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});await page.click('#aLengthsOpen');assert.equal(await page.$eval('#aEnableLengths',e=>e.checked),false);await page.click('#aEnableLengths');await page.click('#aLengthApply');const upgraded=await page.evaluate(()=>__desk.workflow.plan());assert.deepEqual(upgraded.overrides[1],{width:3,height:3,targetCount:3});assert.equal(upgraded.targetLengths,true);await page.click('[data-reset-slot="1"]');assert.deepEqual((await page.evaluate(()=>__desk.workflow.plan())).overrides[1],{width:3,height:3,targetCount:3},'reset preserves the opening geometry rule');
  await page.setViewport({width:390,height:844});await page.click('#aLengthsOpen');assert(await page.$eval('#aLengthsEditor',e=>{const r=e.getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight}));await page.keyboard.press('Escape');
  for(const name of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.setViewport({width:1280,height:720});await offline.goto(pathToFileURL(path.resolve(__dirname,'..',name)).href,{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());await offline.evaluate(file=>__desk.workflow.importPool(file),file);await offline.evaluate(plan=>__desk.workflow.setPlan(plan),plan);await offline.click('#btnArrange');await offline.waitForSelector('#arrange',{visible:true});assert.equal((await run(offline)).status,'complete');await offline.evaluate(()=>__desk.workflow.apply());assert.equal((await offline.evaluate(()=>__desk.exportLevels())).length,4);await context.close();
  }
  assert.deepEqual(errors,[]);console.log('word length browser: ratios, cancel/validation, per-batch opening mode, production, persistence, old stock, formal positions, rule toggle, statistics, export, mobile and both offline files passed');
 }finally{const timer=setTimeout(()=>browser.process()?.kill('SIGTERM'),10000);try{await browser.close()}finally{clearTimeout(timer)}}
})().catch(error=>{console.error(error);process.exitCode=1});
