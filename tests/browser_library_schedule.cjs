/* Cumulative unlocks in the real editor, with per-stage immutable snapshots. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core'),L=require('../src/library'),S=require('../src/library_schedule'),E=require('../src/gen'),A=require('../src/v2_adapter');
const data=require('../data/game_vocab/catalog.json'),profiles=require('../src/profiles.json'),recipes=L.tieredRecipes(data),defaults=S.defaults(recipes);
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const out='/tmp/word-schedule-validation';fs.mkdirSync(out,{recursive:true});const checks=[];
const unlock=(kind,tier)=>'[data-batch-unlock="'+kind+'"][data-library-id="four-game-'+kind+'-'+tier+'"]';
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});
  const ready=async()=>{await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready())};
  const setUnlock=async(kind,tier,from)=>page.$eval(unlock(kind,tier),(e,from)=>{e.value=from;e.dispatchEvent(new Event('input',{bubbles:true}))},from);
  const setRange=async(start,count)=>page.evaluate(({start,count})=>{bFrom.value=start;bCount.value=count;bCount.dispatchEvent(new Event('input',{bubbles:true}))},{start,count});
  await ready();await page.click('#btnBatch');assert.equal(await page.$eval('#bLibraryMode',e=>e.value),'fixed');
  await page.select('#bLibraryMode','staged');
  assert.equal(await page.$$eval('[data-batch-library]:checked',es=>es.length),8);
  for(const kind of ['target','extra'])for(const [i,tier] of ['core','level1','level2','level3'].entries())assert.equal(await page.$eval(unlock(kind,tier),e=>Number(e.value)),[1,101,201,501][i]);
  await setRange(98,405);assert.equal(await page.$$eval('#bStagePreview tbody tr',es=>es.length),4);
  assert.match(await page.$eval('#bStagePreview',e=>e.textContent),/10,748/);assert.match(await page.$eval('#bStagePreview',e=>e.textContent),/11,692/);
  await page.screenshot({path:'/tmp/batch-library-stages.png'});
  await setUnlock('extra','level1',301);assert.equal(await page.$$eval('#bStagePreview tbody tr',es=>es.length),5);
  await setUnlock('extra','level1',101);await setRange(1,3);await setUnlock('target','core',2);
  assert(await page.$eval('#bGo',e=>e.disabled));assert.match(await page.$eval('#bLexNote',e=>e.textContent),/1 关没有生效必答/);
  const untouched=await page.evaluate(()=>__desk.deskText());await page.evaluate(()=>__desk.startBatch());assert.equal(await page.evaluate(()=>__desk.deskText()),untouched);
  await setUnlock('target','core',1);await setUnlock('target','level1','101.5');assert(await page.$eval('#bGo',e=>e.disabled));
  await setUnlock('target','level1',101);assert.equal(await page.$eval('#bGo',e=>e.disabled),false);
  // Switching view never mixes the two independent sets of preferences.
  await page.select('#bLibraryMode','fixed');assert.equal(await page.$$eval('[data-batch-library]:checked',es=>es.length),1);
  await page.select('#bLibraryMode','staged');assert.equal(await page.$$eval('[data-batch-library]:checked',es=>es.length),8);
  await page.click('#bClose');await page.evaluate(()=>__desk.flush());await ready();await page.click('#btnBatch');
  assert.equal(await page.$eval('#bLibraryMode',e=>e.value),'staged');
  await page.evaluate(()=>{const create=WPBatchGenerator.create;window.__stageWorkerInits=[];WPBatchGenerator.create=options=>{
   __stageWorkerInits.push(options.lex.length);if(!bLibraryMode.disabled||!bTargetLibraries.disabled||!bExtraLibraries.disabled)throw new Error('词库设置未锁定');return create(options)
  }});
  for(const preset of ['list0','list5'])for(const start of [99,199,499]){
   await setRange(start,4);
   await page.evaluate(preset=>{bMode.value='replace';bThreads.value='4';bPreset.value=preset;bAttempts.value=160;bSeed.value='stage-boundary-QA';__stageWorkerInits=[]},preset);
   await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch,{timeout:120000});
   const result=await page.evaluate(()=>({summary:__lastBatch,campaign:JSON.parse(__desk.deskText()),levels:__desk.exportLevels(),inits:__stageWorkerInits,cfg:__desk.cfg()}));
   assert.equal(result.summary.failed,0,JSON.stringify(result.summary));assert.equal(result.summary.made,4);assert.equal(result.summary.libraryMode,'staged');
   assert.equal(result.summary.execution,'workers');assert.equal(result.inits.length,2);assert.equal(result.summary.librarySnapshotIds.length,2);
   const plan=S.compile(data,recipes,{mode:'staged',targetIds:defaults.stagedIds.target,extraIds:defaults.stagedIds.extra,unlockAt:defaults.unlockAt},{},{start,count:4});
   const history={usage:{},recent:new Map()};
   for(let i=0;i<4;i++){
    const n=start+i,stage=S.stageFor(plan,n),draft=result.campaign.levels[i],snap=result.campaign.librarySnapshots[draft.librarySnapshotId];
    assert.deepEqual(snap,stage.plan.snapshot);assert.deepEqual(draft.gen.libraryStage,{from:stage.unlockFrom,to:stage.unlockTo});
    const expected=E.generateOne(n,E.buildIndex(snap.lex),profiles,result.cfg,history);assert(expected.ok);
    const game=A.toGame(expected.level),actual=result.levels[i];assert.equal(actual.g,game.g);assert.equal(actual.n,game.n);
    for(const key of ['t','e'])assert.deepEqual(actual[key].split(' ').filter(Boolean).sort(),game[key].split(' ').filter(Boolean).sort());
    for(const w of expected.level.targets){history.usage[w]=(history.usage[w]||0)+1;history.recent.set(w,n)}
   }
   for(const [i,stage] of plan.stages.entries()){
    const name=preset+'-'+start+'-'+i,levelsFile=path.join(out,name+'-levels.json'),lexFile=path.join(out,name+'-lex.json');
    const levels=result.levels.filter((_,i)=>result.campaign.levels[i].librarySnapshotId===stage.plan.snapshot.id);
    fs.writeFileSync(levelsFile,JSON.stringify(levels));fs.writeFileSync(lexFile,JSON.stringify(stage.plan.lex));checks.push({file:levelsFile,lexFile,count:levels.length});
   }
  }
  // Cancel while the second stage is starting; accept only the completed first stage.
  await setRange(99,4);
  await page.evaluate(()=>{
   const create=WPBatchGenerator.create;window.__stageCreate=create;window.__stageStarts=0;
   WPBatchGenerator.create=options=>{const generator=create(options);if(++__stageStarts===2)setTimeout(()=>bStop.click(),0);return generator};
   bSeed.value='stage-boundary-QA';bPreset.value='list0';
  });
  await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch);
  assert.equal(await page.evaluate(()=>__lastBatch.cancelled),true);assert.equal(await page.evaluate(()=>__lastBatch.made),2);
  assert.deepEqual(await page.evaluate(()=>__desk.campaign().levels.map(d=>d.gen.no)),[99,100]);
  // A worker failure after the boundary retries with the newly unlocked vocabulary.
  await page.evaluate(()=>{
   WPBatchGenerator.create=__stageCreate;window.__nativeStageWorker=Worker;window.__stageStarts=0;
   WPBatchGenerator.create=options=>{if(++__stageStarts===2)window.Worker=undefined;return __stageCreate(options)};
  });
  await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch);
  assert.equal(await page.evaluate(()=>__lastBatch.made),4);assert.equal(await page.evaluate(()=>__lastBatch.execution),'mixed');
  assert.equal(await page.evaluate(()=>__desk.campaign().librarySnapshots[__desk.campaign().levels[2].librarySnapshotId].recipe.selection.target.length),2);
  await page.evaluate(()=>{Worker=__nativeStageWorker;WPBatchGenerator.create=__stageCreate});
  const preserved=await page.evaluate(()=>__desk.deskText());
  await setRange(100,2);await page.evaluate(()=>{bMaxN.value=1;bAttempts.value=10});await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch);
  assert.equal(await page.evaluate(()=>__lastBatch.made),0);assert.equal(await page.evaluate(()=>__desk.deskText()),preserved);
  await page.evaluate(()=>{bMaxN.value=13;bAttempts.value=160});
  // All four stages in one run; both pool thresholds are editable and saved independently.
  for(const kind of ['target','extra'])for(const [i,tier] of ['level1','level2','level3'].entries())await setUnlock(kind,tier,i+2);
  await setRange(1,4);await page.evaluate(()=>{bPreset.value='list0';bSeed.value='all-stages-QA'});await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch);
  assert.equal(await page.evaluate(()=>__lastBatch.made),4);assert.equal(await page.evaluate(()=>__lastBatch.librarySnapshotIds.length),4);
  const saved=await page.evaluate(()=>__desk.deskText()),savedLevels=await page.evaluate(()=>__desk.exportLevels());
  await setUnlock('extra','level1',9);assert.equal(await page.evaluate(()=>__desk.deskText()),saved);
  await page.click('#bClose');await page.evaluate(()=>__desk.flush());await ready();await page.click('#btnBatch');
  assert.equal(await page.$eval(unlock('extra','level1'),e=>Number(e.value)),9);assert.equal(await page.$eval(unlock('target','level1'),e=>Number(e.value)),2);
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),savedLevels);await page.click('#bClose');
  await page.evaluate(text=>__desk.importText(text),saved);await page.waitForSelector('#modal',{visible:true});
  await page.evaluate(()=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent==='导入').click());await page.waitForSelector('#modal',{hidden:true});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(__desk.deskText()).librarySnapshots),JSON.parse(saved).librarySnapshots);
  const pack=JSON.parse(await page.evaluate(()=>__desk.packText()));assert.deepEqual(Object.keys(pack).sort(),['books','daily']);
  for(const level of pack.books.flatMap(b=>b.levels).concat(pack.daily))assert.deepEqual(Object.keys(level).sort(),['curtains','e','g','id','lv','n','name','t','ty']);
  // New generation can cross boundaries without a server in either distributable HTML.
  for(const file of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
   await offline.goto('file://'+path.resolve(__dirname,'..',file),{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());await offline.click('#btnBatch');await offline.select('#bLibraryMode','staged');
   await offline.evaluate(()=>{bFrom.value=100;bCount.value=2;bMode.value='replace';bThreads.value='2';bSeed.value='offline-stages-QA'});
   await offline.click('#bGo');await offline.waitForFunction(()=>window.__lastBatch,{timeout:60000});
   assert.equal(await offline.evaluate(()=>__lastBatch.made),2);assert.equal(await offline.evaluate(()=>__lastBatch.librarySnapshotIds.length),2);assert.equal(await offline.evaluate(()=>__lastBatch.execution),'workers');await context.close();
  }
  fs.writeFileSync(path.join(out,'runs.json'),JSON.stringify(checks,null,2));assert.deepEqual(errors,[]);
  console.log('staged libraries: all boundaries on both profiles, independent pools, worker switches, Node parity with continuous history, frozen snapshots, preferences, file round trips and both offline HTML files passed');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
