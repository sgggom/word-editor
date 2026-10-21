/* Real editor/worker checks for the supplied board-level letter schedule. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const puppeteer=require('puppeteer-core'),E=require('../src/gen'),profiles=require('../src/profiles.json'),lex=require('../src/lex.json'),schedule=require('../data/required_letters.json');
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});
  await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());await page.click('#btnBatch');
  assert.equal(await page.$eval('#bLetterMode',e=>e.value),'required');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(document.getElementById('requiredLetters').textContent)),schedule);
  const setRange=async(from,count)=>page.evaluate(({from,count})=>{bFrom.value=from;bCount.value=count;bCount.dispatchEvent(new Event('input',{bubbles:true}))},{from,count});
  const run=async()=>{await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch,{timeout:120000});return page.evaluate(()=>__lastBatch)};
  const restore=async text=>{await page.evaluate(text=>__desk.importText(text),text);await page.waitForSelector('#modal',{visible:true});await page.evaluate(()=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent==='导入').click());await page.waitForSelector('#modal',{hidden:true});};
  await setRange(1,5);await page.evaluate(()=>{bMode.value='replace';bThreads.value='2';bSeed.value='WT-2026';bAttempts.value=300});
  assert.match(await page.$eval('#bLetterPreview tbody',e=>e.textContent),/1A B C/);
  assert.match(await page.$eval('#bLetterNote',e=>e.textContent),/每个单词可以只用其中一部分/);
  await page.screenshot({path:'/tmp/required-letters-batch.png'});
  const result=await run();assert.equal(result.made,5,JSON.stringify(result));assert.equal(result.failed,0);assert.equal(result.execution,'workers');assert.equal(result.requiredLetterScheduleId,schedule.id);
  const drafts=await page.evaluate(()=>__desk.campaign().levels);
  for(const [i,d] of drafts.entries()){
   assert.equal(d.gen.no,i+1);assert.equal(d.gen.requiredLetters.join(''),schedule.levels[i+1]);
   assert(d.gen.requiredLetters.every(c=>d.letters.includes(c)));
   assert(d.words.some(w=>d.gen.requiredLetters.some(c=>!w.includes(c))));
  }
  const saved=await page.evaluate(()=>__desk.deskText()),games=await page.evaluate(()=>__desk.exportLevels());
  for(const game of games)assert.deepEqual(Object.keys(game).sort(),['curtains','e','g','id','lv','n','name','t','ty']);
  await page.click('#bClose');
  await page.click('#levelList [data-level-index="0"] [data-level-action="detail"]');
  assert.match(await page.$eval('#checks',e=>e.textContent),/必选字母：A B C/);
  const indices=drafts[0].letters.map((c,i)=>c==='B'?i:-1).filter(i=>i>=0);
  for(const i of indices)await page.$eval(`#grid input[data-i="${i}"]`,e=>{e.value='E';e.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.waitForFunction(()=>document.querySelector('#checks').textContent.includes('棋盘缺少 B'));
  assert.match(await page.$eval('#checks',e=>e.textContent),/棋盘缺少 B/);
  assert.equal((await page.evaluate(()=>__desk.exportLevels())).length,0,'missing required letters must block game export');
  await restore(saved);assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),games);
  assert.deepEqual(await page.evaluate(()=>__desk.campaign().levels.map(d=>d.gen.requiredLetters)),drafts.map(d=>d.gen.requiredLetters));
  await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());
  assert.deepEqual(await page.evaluate(()=>__desk.campaign().levels.map(d=>d.gen.requiredLetters)),drafts.map(d=>d.gen.requiredLetters));
  await page.click('#btnBatch');await setRange(1000,2);assert.equal(await page.$$eval('#bLetterPreview tbody tr',es=>es.length),1);
  await setRange(1001,2);assert.equal(await page.$eval('#bLetterDetails',e=>e.hidden),true);assert.deepEqual(await page.evaluate(()=>WTEngine.requiredLettersFor(1001,__desk.cfg())),[]);
  await page.select('#bLetterMode','none');assert.equal(await page.evaluate(()=>__desk.cfg().requiredLettersByLevel),undefined);
  await page.click('#bClose');await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());await page.click('#btnBatch');assert.equal(await page.$eval('#bLetterMode',e=>e.value),'none');
  await page.select('#bLetterMode','required');await setRange(1,3);await page.evaluate(()=>{bMode.value='replace';bAttempts.value=300;bSeed.value='WT-2026';const create=WPBatchGenerator.create;window.__letterOriginalCreate=create;window.__requestedLetterNumbers=[];WPBatchGenerator.create=options=>{const gen=create(options),run=gen.generateOne.bind(gen);gen.generateOne=(n,h)=>{__requestedLetterNumbers.push(n);return n===2?Promise.resolve({ok:false,reason:'QA: no valid board'}):run(n,h)};return gen};});
  const stopped=await run();assert.equal(stopped.made,1);assert.equal(stopped.failed,1);assert.equal(stopped.stoppedOnFailure,true);
  assert.deepEqual(await page.evaluate(()=>__requestedLetterNumbers),[1,2]);assert.deepEqual(await page.evaluate(()=>__desk.campaign().levels.map(d=>d.gen.no)),[1]);
  await page.evaluate(()=>{WPBatchGenerator.create=__letterOriginalCreate});
  // The same schedule travels through all real workers and the local fallback.
  const cfg={...E.DEFAULTS,attempts:300,requiredLettersByLevel:schedule.levels},ix=E.buildIndex(lex);
  for(const workers of [1,4])for(const number of [1,19,501,1000,1001]){
   const actual=await page.evaluate(async({lex,cfg,workers,number})=>{const gen=WPBatchGenerator.create({lex,profiles:WT_PROFILES,config:cfg,workers,workerSource:JSON.parse(batchWorker.textContent)});try{return await gen.generateOne(number)}finally{gen.close()}},{lex,cfg,workers,number});
   assert.deepEqual(actual,E.generateOne(number,ix,profiles,cfg));
  }
  const fallback=await page.evaluate(async({lex,cfg})=>{const native=Worker;window.Worker=undefined;const gen=WPBatchGenerator.create({lex,profiles:WT_PROFILES,config:cfg,workers:4,workerSource:JSON.parse(batchWorker.textContent)});try{return {result:await gen.generateOne(1),status:gen.status()}}finally{gen.close();window.Worker=native}},{lex,cfg});
  assert.equal(fallback.status.mode,'fallback');assert.deepEqual(fallback.result,E.generateOne(1,ix,profiles,cfg));
  for(const file of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));
   await offline.goto(pathToFileURL(path.resolve(__dirname,'..',file)).href,{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());await offline.click('#btnBatch');
   assert.equal(await offline.$eval('#bLetterMode',e=>e.value),'required');
   await offline.evaluate(()=>{bFrom.value=1;bCount.value=2;bMode.value='replace';bThreads.value='2';bAttempts.value=300;bSeed.value='WT-2026'});await offline.click('#bGo');await offline.waitForFunction(()=>__lastBatch,{timeout:60000});
   assert.equal(await offline.evaluate(()=>__lastBatch.made),2);assert(await offline.evaluate(()=>__desk.campaign().levels.every(d=>d.gen.requiredLetters.every(c=>d.letters.includes(c)))));
   await context.close();
  }
  assert.deepEqual(errors,[]);console.log('required-letter browser: actual grid constraints, partial-word use, editor checks, export guard, snapshots, preferences, failure numbering, 1/4 workers, fallback and both offline files passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
