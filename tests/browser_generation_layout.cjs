/* Generation workbench: fixed controls, independent panes, live stock and settings. */
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),puppeteer=require('puppeteer-core');
const E=require('../src/gen'),P=require('../src/level_pool'),L=require('../src/library'),data=require('../data/game_vocab/catalog.json');
const snapshot=L.production(data,[L.tieredRecipes(data)[0]]).snapshot,ix=E.buildIndex(snapshot.lex),unique=new Map();
for(const r of E.generatePoolAttempts({width:3,height:3,initialLetters:'ABC'},ix,null,{seed:'generation-layout'},0,192))if(r){const e=P.record(P.gameOf(r.level),snapshot,{ordinal:r.ordinal,...r.level.construction},ix);unique.set(e.id,e);}
const entries=[...unique.values()].slice(0,64);assert.equal(entries.length,64);
const file=P.exportFile({id:'generation-layout',name:'前期直线关卡库'},entries,{[snapshot.id]:snapshot});
const base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function input(page,selector,value){await page.$eval(selector,(e,value)=>{e.value=String(value);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},value);}
async function bounded(page){
 const b=await page.evaluate(()=>{const root=document.querySelector('.generate-workbench'),footer=document.querySelector('.g-footer').getBoundingClientRect();return {sh:root.scrollHeight,h:root.clientHeight,sw:root.scrollWidth,w:root.clientWidth,bottom:footer.bottom,vh:innerHeight,controls:['bGo','bRunSettingsOpen','bClose',...(batch.dataset.generating==='true'?['bStop']:[])].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.width>0&&r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1;})};});
 assert(b.sh<=b.h+1&&b.sw<=b.w+1&&Math.abs(b.bottom-b.vh)<2&&b.controls,JSON.stringify(b));
}
async function confirm(page,label){await page.waitForSelector('#modal',{visible:true});await page.evaluate(label=>[...document.querySelectorAll('#mBtns button')].find(b=>b.textContent===label).click(),label);await page.waitForSelector('#modal',{hidden:true});}
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true}),errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:900});await page.goto(base,{waitUntil:'load'});await page.evaluate(()=>__desk.ready());
  const campaign=await page.evaluate(()=>__desk.deskText());await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});await bounded(page);
  assert.equal(await page.$eval('#bGo',e=>e.disabled),true);assert.match(await page.$eval('#poolEntries',e=>e.textContent),/先创建一个关卡库/);
  await page.evaluate(file=>__desk.workflow.importPool(file),file);assert.equal(await page.$$eval('#poolEntries tbody tr',es=>es.length),50);
  await page.click('#poolNext');await page.waitForFunction(()=>poolPage.textContent==='2 / 2');assert.equal(await page.$$eval('#poolEntries tbody tr',es=>es.length),14);await page.click('#poolPrev');await page.waitForFunction(()=>poolPage.textContent==='1 / 2');
  await page.click('#poolEntries [data-pool-preview]');await page.waitForSelector('#modal',{visible:true});assert.match(await page.$eval('#mBody',e=>e.textContent),/情绪分/);await confirm(page,'试玩');await page.waitForSelector('#play',{visible:true});await page.click('#pBack');assert.equal(await page.evaluate(()=>__desk.deskText()),campaign);await bounded(page);
  await page.click('#bPoolMenu summary');await page.click('#poolRename');await page.waitForSelector('#poolNameInput',{visible:true});await input(page,'#poolNameInput','直线库 · 布局验收');await confirm(page,'保存');await page.waitForFunction(()=>poolCount.textContent.includes('直线库 · 布局验收'));assert.equal(await page.$eval('#bPoolMenu',e=>e.open),false);
  // Lots of batches scroll inside their own pane; typing retains focus and the run button stays put.
  await page.evaluate(()=>{document.querySelector('[data-production="quantity"]').value=1;for(let i=0;i<23;i++){bAddRow.click();document.querySelector('#productionTable tbody tr:last-child [data-production="quantity"]').value=1;}document.querySelector('[data-production="quantity"]').dispatchEvent(new Event('input',{bubbles:true}));});
  await bounded(page);assert(await page.$eval('.g-batch-scroll',e=>e.scrollHeight>e.clientHeight));
  await page.click('#productionTable tbody tr:last-child [data-production="initialLetters"]');await page.keyboard.type('ABC');assert.equal(await page.evaluate(()=>document.activeElement.dataset.production),'initialLetters');
  await page.evaluate(()=>{while(document.querySelectorAll('#productionTable tbody tr').length>3)document.querySelector('#productionTable tbody tr:last-child [data-production-delete]').click();});
  await input(page,'#productionTable tbody tr:nth-child(2) [data-production="initialLetters"]','S T');await input(page,'#productionTable tbody tr:nth-child(3) [data-production="quantity"]',500);
  await page.click('[data-batch-library="target"][value="four-game-target-level1"]');assert.match(await page.$eval('#bLexNote',e=>e.textContent),/3,363/);
  // Runtime options are one native dialog; closing it preserves valid edits and restores focus.
  await page.click('#bRunSettingsOpen');await page.waitForSelector('#bRunSettings[open]');await page.select('#bThreads','2');await input(page,'#bBudget',9000);await page.keyboard.press('Escape');assert.equal(await page.$eval('#bRunSettings',e=>e.open),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'bRunSettingsOpen');
  await page.screenshot({path:'/tmp/generation-workbench-1440.png'});
  for(const [width,height] of [[1280,720],[1024,768],[820,650],[390,844]]){
   await page.setViewport({width,height});await bounded(page);await page.screenshot({path:'/tmp/generation-workbench-'+width+'.png'});
  }
  for(const pane of ['sources','inventory','batches']){await page.click('[data-generation-pane="'+pane+'"]');await bounded(page);assert.equal(await page.$eval('[data-generation-pane="'+pane+'"]',e=>e.getAttribute('aria-pressed')),'true');}
  await page.click('[data-generation-pane="inventory"]');assert(await page.$eval('.g-inventory-scroll',e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:'/tmp/generation-workbench-mobile-inventory.png'});
  await page.click('#bRunSettingsOpen');await page.waitForSelector('#bRunSettings[open]');assert(await page.$eval('#bRunSettings',e=>{const r=e.getBoundingClientRect();return r.bottom<=innerHeight&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth+1}));await page.screenshot({path:'/tmp/generation-workbench-mobile-settings.png'});await page.click('[data-generation-dialog-close]');
  await page.evaluate(()=>__desk.flush());const saved=await page.evaluate(()=>__desk.workflow.store.load('generation'));await page.reload({waitUntil:'load'});await page.evaluate(()=>__desk.ready());assert.deepEqual(await page.evaluate(()=>__desk.workflow.store.load('generation')),saved);
  await page.setViewport({width:1280,height:720});await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});
  // Start a deliberately paced run to observe partial writes and cancel from the fixed footer.
  await page.evaluate(()=>{while(document.querySelectorAll('#productionTable tbody tr').length>1)document.querySelector('#productionTable tbody tr:last-child [data-production-delete]').click();const q=document.querySelector('[data-production="quantity"]');q.value=1000;q.dispatchEvent(new Event('input',{bubbles:true}));window.__normalGenerator=WPBatchGenerator.create;WPBatchGenerator.create=options=>{const g=__normalGenerator(options),generate=g.generateCandidates.bind(g);g.generateCandidates=async(...args)=>{await new Promise(r=>setTimeout(r,120));return generate(...args)};return g;};});
  await page.click('#bGo');await page.waitForFunction(()=>batch.dataset.generating==='true');await bounded(page);
  assert.equal(await page.$eval('#poolSelect',e=>e.disabled),true);assert.equal(await page.$eval('#bTargetLibraries',e=>e.disabled),true);assert.equal(await page.$eval('#bPoolMenu',e=>e.inert),true);
  await page.waitForFunction(()=>__desk.workflow.pools().find(p=>p.id==='generation-layout').count>64&&batch.dataset.generating==='true',{timeout:30000});
  await page.click('#bRunSettingsOpen');assert.equal(await page.$eval('#bThreads',e=>e.disabled),true);assert.equal(await page.$eval('#bSeedHistory',e=>e.disabled),true);assert(await page.$eval('#bSeed',e=>e.value.startsWith('GEN-')));await page.click('[data-generation-dialog-close]');await bounded(page);
  await page.screenshot({path:'/tmp/generation-workbench-running.png'});await page.click('#bStop');await page.waitForFunction(()=>window.__lastBatch,{timeout:30000});
  const cancelled=await page.evaluate(()=>__lastBatch);assert(cancelled.cancelled&&cancelled.made>0);assert.equal(await page.$eval('#bStop',e=>e.hidden),true);assert.equal(await page.evaluate(()=>__desk.deskText()),campaign);assert.match(await page.$eval('#bOut',e=>e.textContent),/已中止/);await bounded(page);
  await page.evaluate(()=>{WPBatchGenerator.create=__normalGenerator;});
  await page.click('#bRunSettingsOpen');const firstHistory=await page.$eval('#bSeedHistory option:nth-child(2)',e=>e.value);await page.select('#bSeedHistory',firstHistory);await page.click('[data-generation-dialog-close]');assert.equal(await page.$eval('#bSeedMode',e=>e.value),'fixed');
  await input(page,'[data-production="quantity"]',2);await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch,{timeout:30000});assert.equal(await page.evaluate(()=>__lastBatch.made),2);
  await page.click('#bClose');assert.equal(await page.evaluate(()=>document.activeElement.id),'btnBatch');assert.equal(await page.evaluate(()=>__desk.deskText()),campaign);
  for(const name of ['index.html','wordpages-level-desk.html']){
   const context=await browser.createBrowserContext(),offline=await context.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.setViewport({width:1280,height:720});await offline.goto(pathToFileURL(path.resolve(__dirname,'..',name)).href,{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());await offline.evaluate(file=>__desk.workflow.importPool(file),file);await offline.click('#btnBatch');await offline.waitForSelector('#batch',{visible:true});await bounded(offline);await offline.click('#bRunSettingsOpen');await input(offline,'#bMaxN',10);await offline.click('[data-generation-dialog-close]');await offline.evaluate(()=>__desk.flush());await offline.reload({waitUntil:'load'});await offline.evaluate(()=>__desk.ready());assert.equal(await offline.$eval('#bMaxN',e=>e.value),'10');await context.close();
  }
  assert.deepEqual(errors,[]);console.log('generation layout: fixed frame at 1440/1280/1024/820/390, many batches, inventory paging/play, settings/history, live writes/cancel, locked run controls, saved configuration and both offline pages passed');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
