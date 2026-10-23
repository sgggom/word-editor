/* Run inventory_scale.cjs first. This imports real validated records, not mocks. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),puppeteer=require('puppeteer-core');
const file=JSON.parse(fs.readFileSync(process.env.POOL_SCALE_FILE||path.join(os.tmpdir(),'wordpages-inventory-10000.json'),'utf8'));
const required=require('../data/required_letters.json'),base=process.env.BASE_URL||'http://127.0.0.1:8000/',chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1100});await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());
  const before=await page.evaluate(()=>__desk.deskText());
  await page.evaluate(()=>{window.__heartbeat={ticks:0,maxGap:0,last:performance.now()};window.__heartbeatTimer=setInterval(()=>{const now=performance.now();__heartbeat.maxGap=Math.max(__heartbeat.maxGap,now-__heartbeat.last);__heartbeat.last=now;__heartbeat.ticks++},50)});
  const start=Date.now(),imported=await page.evaluate(file=>__desk.workflow.importPool(file),file);assert.equal(imported.added,10000);const importMs=Date.now()-start;
  assert.equal((await page.evaluate(()=>__desk.workflow.pools()))[0].count,10000);assert.equal(await page.evaluate(()=>__desk.deskText()),before);
  await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});assert.equal(await page.$$eval('#poolEntries tbody tr',es=>es.length),50);await page.click('#poolNext');await page.waitForFunction(()=>document.querySelector('#poolPage').textContent.startsWith('2 /'));await page.screenshot({path:'/tmp/pool-split-10000.png'});await page.click('#bClose');
  const exported=await page.evaluate(()=>__desk.workflow.exportPool());assert.equal(exported.entries.length,10000);assert.equal(Object.keys(exported.librarySnapshots).length,1);assert.deepEqual(exported.entries.map(e=>e.id).sort(),file.entries.map(e=>e.id).sort());
  const plan={kind:'wordpages-arrangement',schemaVersion:1,name:'千关排布验收',seed:'scale-arrangement',budget:1000000,requiredLetters:required,overrides:{},segments:[{id:'s',from:1,to:1000,width:3,height:3,targetCount:3,poolIds:[file.pool.id],rules:{maxTurns:1,repeatGap:20}}]};
  await page.evaluate(plan=>__desk.workflow.setPlan(plan),plan);const arrangeStart=Date.now();await page.evaluate(()=>__desk.workflow.run());const arrangeMs=Date.now()-arrangeStart;
  const preview=await page.evaluate(()=>__desk.workflow.preview());assert.equal(preview.result.rows.length,1000);assert(preview.result.audit.errors.every(e=>e.type==='missing'),'no occupied position may violate a hard rule');
  assert.equal(await page.evaluate(()=>__desk.deskText()),before);const heartbeat=await page.evaluate(()=>{clearInterval(__heartbeatTimer);return __heartbeat});assert(heartbeat.ticks>10);assert(heartbeat.maxGap<1500,JSON.stringify(heartbeat));
  await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());assert.equal((await page.evaluate(()=>__desk.workflow.pools()))[0].count,10000);assert.equal((await page.evaluate(()=>__desk.workflow.preview())).result.rows.length,1000);
  console.log(JSON.stringify({records:10000,positions:1000,importMs,arrangeMs,status:preview.result.status,matched:preview.result.audit.filled,checks:preview.result.checks,heartbeat}));
  // A neutral schedule fixture isolates full 1000-level apply/save/export capacity
  // from insufficient stock for the real curriculum tested above. Records stay real.
  const fullPlan={...plan,name:'千关应用容量验收',requiredLetters:{id:'capacity-fixture',levels:{}},overrides:Object.fromEntries(file.entries.slice(0,1000).map((e,i)=>[i+1,{width:e.metrics.width,height:e.metrics.height,targetCount:e.metrics.targetCount}])),segments:[{...plan.segments[0],rules:{maxTurns:null,repeatGap:0}}]};
  await page.evaluate(()=>{window.__applyHeartbeat={ticks:0,maxGap:0,last:performance.now()};window.__applyTimer=setInterval(()=>{const now=performance.now();__applyHeartbeat.maxGap=Math.max(__applyHeartbeat.maxGap,now-__applyHeartbeat.last);__applyHeartbeat.last=now;__applyHeartbeat.ticks++},50)});
  await page.evaluate(plan=>__desk.workflow.setPlan(plan),fullPlan);const fullStart=Date.now();await page.evaluate(()=>__desk.workflow.run());assert.equal(await page.evaluate(()=>__lastArrangement.status),'complete');const fullArrangeMs=Date.now()-fullStart;
  const applyStart=Date.now();await page.evaluate(()=>__desk.workflow.apply());const applyMs=Date.now()-applyStart;
  assert.equal(await page.evaluate(()=>__desk.campaign().levels.length),1000);assert.equal(await page.evaluate(()=>__desk.workflow.audit().ok),true);
  assert.equal(await page.evaluate(()=>__desk.exportLevels().length),1000);assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(__desk.deskText()).librarySnapshots).length),1);assert.equal((await page.evaluate(()=>__desk.workflow.pools()))[0].count,10000);
  const applyHeartbeat=await page.evaluate(()=>{clearInterval(__applyTimer);return __applyHeartbeat});assert(applyHeartbeat.maxGap<1500,JSON.stringify(applyHeartbeat));
  await page.evaluate(()=>__desk.flush());await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());assert.equal(await page.evaluate(()=>__desk.exportLevels().length),1000);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({fullRealRecords:1000,fullArrangeMs,applyMs,applyHeartbeat}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
