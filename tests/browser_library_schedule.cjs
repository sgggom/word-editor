/* Stage selection now belongs to arrangement segments, never candidate ordinals. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const puppeteer=require('puppeteer-core'),L=require('../src/library'),{produceAndApply}=require('./workflow_helpers.cjs');
const data=require('../data/game_vocab/catalog.json'),recipes=L.tieredRecipes(data);
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true}),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pool-segments-'));
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});
  await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});
  assert.equal(await page.$('#bLibraryMode'),null,'generation has no campaign-number unlock control');
  const first=await produceAndApply(page,3,'core-stage-QA');
  const firstSnapshot=await page.evaluate(id=>__desk.campaign().librarySnapshots[id],first.result.librarySnapshotId);
  assert.deepEqual(firstSnapshot,L.production(data,[recipes.find(r=>r.id==='four-game-target-core')]).snapshot);
  await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});await page.click('[data-batch-library="target"][value="four-game-target-level1"]');
  const second=await produceAndApply(page,3,'expanded-stage-QA','after');
  const campaign=await page.evaluate(()=>JSON.parse(__desk.deskText())),plan=campaign.arrangement.plan;
  assert.equal(campaign.levels.length,6);assert.equal(plan.segments.length,2);assert.deepEqual(plan.segments.map(s=>[s.from,s.to,s.poolIds]),[[1,3,[first.poolId]],[4,6,[second.poolId]]]);
  assert.deepEqual(campaign.levels.map(d=>d.arrangement.poolId),Array(3).fill(first.poolId).concat(Array(3).fill(second.poolId)));
  assert.deepEqual(campaign.levels.map(d=>d.librarySnapshotId),Array(3).fill(first.result.librarySnapshotId).concat(Array(3).fill(second.result.librarySnapshotId)));
  assert.deepEqual(campaign.librarySnapshots[first.result.librarySnapshotId],firstSnapshot);assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),true);
  // Candidate history has no formal number, and both production batches keep their explicit shape and scanned count.
  for(const id of [first.poolId,second.poolId]){
   const entries=await page.evaluate(id=>__desk.workflow.store.allEntries(id),id);
   assert(entries.every(e=>e.metrics.width===3&&e.metrics.height===3&&e.metrics.targetCount===e.game.t.split(" ").length&&!e.generation.number));
  }
  const saved=await page.evaluate(()=>__desk.deskText()),games=await page.evaluate(()=>__desk.exportLevels());
  await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());
  assert.equal(await page.evaluate(()=>__desk.deskText()),saved);assert.deepEqual(await page.evaluate(()=>__desk.workflow.plan()),plan);
  // Scheme file round trip is independent from the campaign and inventories.
  const file=path.join(temp,'stages.arrangement.json');fs.writeFileSync(file,JSON.stringify(plan));
  await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});
  await page.$eval('#aSeed',e=>{e.value='changed';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await (await page.$('#arrangementFile')).uploadFile(file);await page.waitForFunction(seed=>__desk.workflow.plan().seed===seed,{},plan.seed);
  assert.deepEqual(await page.evaluate(()=>__desk.workflow.plan()),plan);assert.equal(await page.evaluate(()=>__desk.workflow.preview()),null);assert.equal(await page.evaluate(()=>__desk.deskText()),saved);
  await page.click('#aRun');await page.waitForFunction(()=>window.__lastArrangement);assert.equal(await page.evaluate(()=>__lastArrangement.status),'complete');await page.click('#aClose');
  await page.evaluate(text=>__desk.importText(text),saved);await page.waitForSelector('#modal',{visible:true});await page.evaluate(()=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent==='导入').click());await page.waitForSelector('#modal',{hidden:true});
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),games);assert.deepEqual(await page.evaluate(()=>JSON.parse(__desk.deskText()).librarySnapshots),campaign.librarySnapshots);
  for(const game of games)assert.deepEqual(Object.keys(game).sort(),['curtains','e','g','id','lv','n','name','t','ty']);
  assert.deepEqual(errors,[]);console.log('pool segments: independent sources, explicit shape and scanned production count, per-segment selection, shared frozen snapshots, saved plan/import/export and campaign round trip passed');
 }finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
