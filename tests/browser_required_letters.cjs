/* Board letters bind to final arrangement positions, not inventory production. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const puppeteer=require('puppeteer-core'),E=require('../src/gen'),P=require('../src/level_pool'),L=require('../src/library'),A=require('../src/arrangement');
const profiles=require('../src/profiles.json'),data=require('../data/game_vocab/catalog.json'),schedule=require('../data/required_letters.json');
const snapshot=L.combine(data,{target:[L.tieredRecipes(data)[0]],extra:[]}).snapshot,ix=E.buildIndex(snapshot.lex);
const config={...E.DEFAULTS,seed:'WT-2026',attempts:300,requiredLettersByLevel:schedule.levels};
const entries=Array.from({length:3},(_,i)=>{const result=E.generateOne(i+1,ix,profiles,config);assert(result.ok);return P.record(P.gameOf(result.level),snapshot,{seed:'fixture',ordinal:i});});
const file=P.exportFile({id:'required-letter-fixture',name:'字母验收库'},entries,{[snapshot.id]:snapshot});
const plan={kind:'wordpages-arrangement',schemaVersion:1,name:'字母验收',seed:'required-QA',budget:1000000,requiredLetters:schedule,overrides:{},segments:entries.map((e,i)=>({id:'segment-'+i,from:i+1,to:i+1,width:e.metrics.width,height:e.metrics.height,targetCount:e.metrics.targetCount,poolIds:[file.pool.id],rules:{maxTurns:null,repeatGap:0}}))};
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});
  await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());
  assert.deepEqual(await page.evaluate(()=>JSON.parse(document.getElementById('requiredLetters').textContent)),schedule);
  const original=await page.evaluate(()=>__desk.deskText());await page.evaluate(file=>__desk.workflow.importPool(file),file);await page.evaluate(plan=>__desk.workflow.setPlan(plan),plan);
  await page.click('#btnArrange');await page.waitForSelector('#arrange',{visible:true});assert.match(await page.$eval('#aSlots tbody',e=>e.textContent),/A B C/);
  await page.click('#aRun');await page.waitForFunction(()=>window.__lastArrangement);assert.equal(await page.evaluate(()=>__lastArrangement.status),'complete');assert.equal(await page.evaluate(()=>__desk.deskText()),original);
  await page.evaluate(()=>__desk.workflow.apply());const drafts=await page.evaluate(()=>__desk.campaign().levels);
  for(const [i,d] of drafts.entries()){assert([...schedule.levels[i+1]].every(c=>d.letters.includes(c)));assert(d.words.some(w=>[...schedule.levels[i+1]].some(c=>!w.includes(c))));assert.equal(d.arrangement.number,i+1);}
  const saved=await page.evaluate(()=>__desk.deskText()),games=await page.evaluate(()=>__desk.exportLevels());
  await page.click('#levelList [data-level-index="0"] [data-level-action="detail"]');
  for(const [i,c] of drafts[0].letters.entries())if(c==='B')await page.$eval('#grid input[data-i="'+i+'"]',e=>{e.value='E';e.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),false);assert.equal((await page.evaluate(()=>__desk.exportLevels())).length,0);
  await page.evaluate(text=>__desk.importText(text),saved);await page.waitForSelector('#modal',{visible:true});await page.evaluate(()=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent==='导入').click());await page.waitForSelector('#modal',{hidden:true});
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),games);await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());assert.deepEqual(await page.evaluate(()=>__desk.campaign().arrangement.plan.requiredLetters),schedule);
  const boundary={...plan,segments:[{...plan.segments[0],to:1001}]},slots=A.expand(boundary);assert.equal(slots[999].requiredLetters,[...new Set(schedule.levels[1000])].sort().join(''));assert.equal(slots[1000].requiredLetters,'');
  // Inventory attempts ignore the old sequential schedule, even when passed through a real worker.
  for(const workers of [1,4]){
   const actual=await page.evaluate(async({lex,config,workers})=>{const gen=WPBatchGenerator.create({lex,profiles:WT_PROFILES,config,workers,workerSource:JSON.parse(batchWorker.textContent)});try{return await gen.generateCandidates({width:3,height:3,targetCount:3},501,32)}finally{gen.close()}},{lex:snapshot.lex,config,workers});
   assert.deepEqual(actual,E.generatePoolAttempts({width:3,height:3,targetCount:3},ix,profiles,{...config,requiredLettersByLevel:undefined},501,32));
  }
  for(const name of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
   await offline.goto(pathToFileURL(path.resolve(__dirname,'..',name)).href,{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());await offline.evaluate(file=>__desk.workflow.importPool(file),file);await offline.evaluate(plan=>__desk.workflow.setPlan(plan),plan);await offline.evaluate(()=>__desk.workflow.run());assert.equal(await offline.evaluate(()=>__lastArrangement.status),'complete');await offline.evaluate(()=>__desk.workflow.apply());assert.equal(await offline.evaluate(()=>__desk.workflow.audit().ok),true);await context.close();
  }
  assert.deepEqual(errors,[]);console.log('required letters: final-position filtering, partial-word use, preview isolation, export guard, rule snapshot round trip, 1000/1001 boundary, unconstrained pool workers and both offline HTML files passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
