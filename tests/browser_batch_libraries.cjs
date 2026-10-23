const {produceAndApply}=require('./workflow_helpers.cjs');
/* Target selection, automatic full extra calibration, snapshots and persistence. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core'),L=require('../src/library'),data=require('../data/game_vocab/catalog.json');
const base=process.env.BASE_URL||'http://127.0.0.1:8000/';
const chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const core='four-game-target-core',level1='four-game-target-level1',extraLevel1='four-game-extra-level1';
const updatedCoreRevision=L.tieredRecipes(data).find(r=>r.id===core).revision+1;
const checkbox=(kind,id)=>'[data-batch-library="'+kind+'"][value="'+id+'"]';
const chosen=(page,kind)=>page.$$eval('[data-batch-library="'+kind+'"]:checked',es=>es.map(e=>e.value).sort());
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
  const ready=async(url=base)=>{await page.goto(url,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready())};
  const generate=async(count=3,mode='replace',tag='combined')=>{
   const {result}=await produceAndApply(page,count,'batch-library-QA',mode);
   const bundle=await page.evaluate(id=>{
    const c=__desk.campaign(),levels=__desk.exportLevels();
    return {snapshot:c.librarySnapshots[id],levels:levels.filter((l,i)=>c.levels[i].librarySnapshotId===id)};
   },result.librarySnapshotId);
   fs.writeFileSync('/tmp/batch-library-'+tag+'-levels.json',JSON.stringify(bundle.levels));
   fs.writeFileSync('/tmp/batch-library-'+tag+'-lex.json',JSON.stringify(bundle.snapshot.lex));
   return {result,...bundle};
  };
  await ready(base+'?fresh=1');await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});
  assert.equal(await page.$$eval('[data-batch-library="target"]',es=>es.length),4);
  assert.equal(await page.$$eval('[data-batch-library="extra"]',es=>es.length),0);
  assert.equal(await page.$('#bExtraLibraries'),null);assert.deepEqual(await chosen(page,'target'),[core]);
  await page.click(checkbox('target',level1));
  assert.match(await page.$eval('#bLexNote',e=>e.textContent),/3,363/);assert.match(await page.$eval('#bLexNote',e=>e.textContent),/全量.*校对，共 11,692/);
  await page.screenshot({path:'/tmp/batch-target-only-sources.png'});
  await page.click('#bClose');await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});assert.deepEqual(await chosen(page,'target'),[core,level1]);
  await page.click('#bClose');await page.evaluate(()=>__desk.flush());await ready();await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});
  assert.deepEqual(await chosen(page,'target'),[core,level1]);assert.equal(await page.$('[data-batch-library="extra"]'),null);
  await page.evaluate(()=>{
   const original=WPBatchGenerator.create;
   WPBatchGenerator.create=function(...args){window.__batchLockObserved=bTargetLibraries.disabled && bThreads.disabled;return original.apply(this,args)};
  });
  const first=await generate();assert(await page.evaluate(()=>__batchLockObserved));
  const recipes=L.tieredRecipes(data),expected=L.production(data,recipes.filter(r=>[core,level1].includes(r.id)));
  assert.deepEqual(first.snapshot,expected.snapshot);
  assert.deepEqual(first.result.targetLibraryIds,[core,level1]);assert.deepEqual(first.result.extraLibraryIds,['four-game-extra-validation']);
  const originalLevels=await page.evaluate(()=>__desk.exportLevels()),originalDesk=await page.evaluate(()=>__desk.deskText());
  assert.equal(await page.evaluate(()=>__desk.libraries().recipes.length),8);
  assert.match(await page.$eval('#levelLibraryName',e=>e.title),/一级/);

  // Saved source changes update future combinations without mutating earlier snapshots.
  await page.click('#btnBank');await page.select('#librarySelect',core);await page.select('[data-operation="targetPool"]','union');
  await page.click('#librarySave');await page.waitForFunction(revision=>document.querySelector('#libraryStatus').textContent.startsWith('已保存 · v'+revision),{},updatedCoreRevision);
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),originalLevels);
  assert.deepEqual(await page.evaluate(id=>__desk.campaign().librarySnapshots[id],first.snapshot.id),first.snapshot);
  const revised=await page.evaluate(()=>__desk.libraries().recipes);
  await page.click('#bankClose');await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});
  assert.deepEqual(await chosen(page,'target'),[core,level1]);assert.match(await page.$eval('#bLexNote',e=>e.textContent),/10,748/);
  const second=await generate(1,'after','revised');assert.notEqual(second.snapshot.id,first.snapshot.id);
  assert.deepEqual(second.snapshot,L.production(data,revised.filter(r=>[core,level1].includes(r.id))).snapshot);
  assert.equal(second.snapshot.recipe.selection.target.find(r=>r.id===core).revision,updatedCoreRevision);
  assert.deepEqual(await page.evaluate(id=>__desk.campaign().librarySnapshots[id],first.snapshot.id),first.snapshot);

  await page.click('#btnBank');await page.select('#librarySelect',extraLevel1);await page.click('#libraryDelete');
  await page.waitForFunction(id=>!__desk.libraries().recipes.some(r=>r.id===id),{},extraLevel1);
  await page.click('#bankClose');await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});assert.match(await page.$eval('#bLexNote',e=>e.textContent),/11,692/);
  assert.deepEqual(await page.evaluate(id=>__desk.campaign().librarySnapshots[id],first.snapshot.id),first.snapshot);
  await page.click('[data-batch-select="target"][data-select-all="0"]');assert(await page.$eval('#bGo',e=>e.disabled));
  const preserved=await page.evaluate(()=>__desk.deskText());await page.evaluate(()=>__desk.startBatch());
  assert.equal(await page.evaluate(()=>__desk.deskText()),preserved);
  await page.click('#bClose');await page.evaluate(()=>__desk.flush());await ready();await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});
  assert.deepEqual(await chosen(page,'target'),[]);assert(await page.$eval('#bGo',e=>e.disabled));
  await page.click(checkbox('target',core));
  assert.equal(await page.$eval('#bGo',e=>e.disabled),false);assert.match(await page.$eval('#bLexNote',e=>e.textContent),/11,692/);
  const automatic=await generate(1,'after','automatic-extras');
  assert.equal(automatic.snapshot.lex.filter(x=>x.role==='extra').length,11692,'deleting an editable extra library cannot shrink the automatic reference');
  assert.deepEqual(automatic.snapshot.recipe.selection.extra.map(r=>r.id),['four-game-extra-validation']);
  assert(automatic.levels.some(l=>l.e),'reachable extras are still recorded');

  // Editor round trips keep source versions after those configurations were changed/deleted.
  await page.evaluate(text=>__desk.importText(text),originalDesk);await page.waitForSelector('#modal',{visible:true});
  await page.evaluate(()=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent==='导入').click());
  await page.waitForSelector('#modal',{hidden:true});await page.evaluate(()=>__desk.flush());
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),originalLevels);
  const restored=JSON.parse(await page.evaluate(()=>__desk.deskText()));assert.deepEqual(restored.librarySnapshots[first.snapshot.id],first.snapshot);
  const pack=JSON.parse(await page.evaluate(()=>__desk.packText()));
  assert.deepEqual(Object.keys(pack).sort(),['books','daily']);
  for(const level of pack.books.flatMap(b=>b.levels).concat(pack.daily)) assert.deepEqual(Object.keys(level).sort(),['curtains','e','g','id','lv','n','name','t','ty']);
  await ready();assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),originalLevels);
  console.log('production sources: target selection, full automatic extra reference, persistence, frozen snapshots, revisions/deletions, empty targets, editor round trip and game format passed');

  const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.setViewport({width:1440,height:1000});
  await offline.goto('file://'+path.resolve(__dirname,'../wordpages-level-desk.html'),{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());await offline.click('#btnBatch');await offline.waitForSelector('#batch',{visible:true});
  await offline.click('[data-batch-select="target"][data-select-all="1"]');
  assert.equal((await chosen(offline,'target')).length,4);assert.equal(await offline.$('[data-batch-library="extra"]'),null);
  assert.match(await offline.$eval('#bLexNote',e=>e.textContent),/10,748/);assert.match(await offline.$eval('#bLexNote',e=>e.textContent),/11,692/);
  await produceAndApply(offline,1,'offline-multi-QA');
  const saved=await offline.evaluate(()=>{const c=__desk.campaign();return c.librarySnapshots[c.levels[0].librarySnapshotId]});assert.deepEqual(saved.lex,L.compile(data,L.defaultRecipe(data)).lex.filter(x=>x.word.length!==2));
  await offline.evaluate(()=>__desk.flush());await offline.reload({waitUntil:'load'});await offline.evaluate(()=>__desk.ready());await offline.click('#btnBatch');await offline.waitForSelector('#batch',{visible:true});
  assert.equal((await chosen(offline,'target')).length,4);assert.equal(await offline.$('[data-batch-library="extra"]'),null);
  await offline.setViewport({width:390,height:844});await offline.screenshot({path:'/tmp/batch-target-only-mobile.png'});
  assert(await offline.$eval('#batch .workflow-panel',e=>e.scrollWidth<=e.clientWidth+1));await context.close();
  assert.deepEqual(errors,[]);console.log('standalone HTML: target-only selection, automatic calibration, combined snapshot, refresh persistence and narrow layout passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
