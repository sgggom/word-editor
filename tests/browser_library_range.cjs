/* Both views edit the same persistent, executable pool recipe. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core'),L=require('../src/library'),O=require('../src/library_overlap');
const data=require('../data/game_vocab/catalog.json'),baseline=L.defaultRecipe(data);
const chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const base=process.env.BASE_URL||'http://127.0.0.1:8000/';
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
  const ready=async(url=base)=>{await page.goto(url,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready())};
  const state=()=>page.evaluate(()=>__desk.libraries());
  const count=()=>page.$eval('#bankMeta',e=>Number(e.textContent.split(' / ')[0]));
  const setValue=async(selector,value)=>page.$eval(selector,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))},value);
  const save=async(rev)=>{await page.click('#librarySave');await page.waitForFunction(rev=>document.querySelector('#libraryStatus').textContent.startsWith('已保存 · v'+rev),{},rev)};
  await ready(base+'?fresh=1');await page.click('#btnBank');
  assert.deepEqual(await page.$$eval('[data-library-view]',es=>es.map(e=>e.textContent)),['列表','饼图']);
  await page.click('#libraryCopy');await setValue('#libraryName','饼图多选验收');
  await page.click('[data-library-view="range"]');assert.equal(await count(),10758);
  assert.equal(await page.$$eval('[data-range-mask][aria-pressed="true"]',es=>es.length),15);
  assert.equal(await page.$eval('#libraryRangeChart [data-mask="15"]',e=>e.getAttribute('aria-pressed')),'true');
  await page.click('#libraryRangeChart [data-mask="15"]');assert.equal(await count(),9131);
  assert(!(await state()).draft.targetPool.selectedRegions.includes('15'));
  assert.equal(await page.$('#libraryRangeChart [data-selection-mask="15"]'),null);
  await page.click('#libraryRangeChart [data-mask="15"]');assert.equal(await count(),10758);
  // Keyboard toggles preserve focus and act like repeated clicks.
  await page.$eval('#libraryRangeChart [data-mask="15"]',e=>e.focus());await page.keyboard.press('Enter');assert.equal(await count(),9131);
  await page.keyboard.press('Space');assert.equal(await count(),10758);
  await page.click('#libraryRangeClear');assert.equal(await count(),0);assert.equal((await state()).preview.candidates,0);
  await page.click('#libraryRangeChart [data-mask="15"]');await page.click('#libraryRangeChart [data-mask="8"]');assert.equal(await count(),4372);
  assert.deepEqual((await state()).draft.targetPool.selectedRegions,['8','15']);
  assert.deepEqual(await page.$$eval('#libraryRangeChart [data-selection-mask]',es=>es.map(e=>e.dataset.selectionMask).sort()),['15','8']);
  const partial=(await state()).draft;
  await page.click('[data-library-view="list"]');assert.deepEqual((await state()).draft,partial);
  assert.equal(await page.$eval('[data-operation="targetPool"]',e=>e.value),'regions');
  assert.match(await page.$eval('.lib-region-summary',e=>e.textContent),/已选 2 个区域/);
  await page.click('[data-library-view="range"]');assert.equal(await count(),4372);
  // A click on the colored area itself (outside a numeric chip) also toggles.
  const areaPoint=async()=>page.evaluate(()=>{
    const d=__desk.libraryData(),r=__desk.libraries().draft,m=WPLibraryOverlap.buildModel(d,r,'targetPool',WPLibrary.compile(d,r));
    const chart=ProportionalVenn.buildProportionalVenn(m.entries,{regions:new Map([...m.regions].map(([k,w])=>[Number(k),w]))},8,'test',{selectedMasks:[...m.selectedMasks].map(Number)});
    const witness=chart.diagnostics.regions.find(x=>x.mask===8).witness,svg=document.querySelector('#libraryRangeChart svg');
    for(const [dx,dy] of [[0,40],[40,0],[-40,0],[0,-40],[35,35],[-35,-35]]){
      if(ProportionalVenn.maskAt(witness.x+dx,witness.y+dy,chart.geometry)!==8)continue;
      const p=svg.createSVGPoint();p.x=witness.x+dx;p.y=witness.y+dy;const q=p.matrixTransform(svg.getScreenCTM());
      const el=document.elementFromPoint(q.x,q.y);if(el?.closest('#libraryRangeChart svg')&&!el.closest('[data-mask]'))return{x:q.x,y:q.y};
    }
    throw new Error('No clickable area witness');
  });
  let point=await areaPoint();await page.mouse.click(point.x,point.y);assert.equal(await count(),1627);
  point=await areaPoint();await page.mouse.click(point.x,point.y);assert.equal(await count(),4372);
  await page.screenshot({path:'/tmp/library-pie-multiselect.png'});
  await page.select('#libraryRangePool','extraPool');await page.click('#libraryRangeClear');
  await page.click('[data-range-mask="15"]');await page.click('[data-range-mask="8"]');
  assert.deepEqual((await state()).draft.extraPool.selectedRegions,['8','15']);
  assert.deepEqual((await state()).draft.targetPool.selectedRegions,['8','15']);
  const recipe=(await state()).draft,compiled=L.compile(data,recipe),extraExpected=O.buildModel(data,recipe,'extraPool',compiled).result;
  assert.equal(await count(),extraExpected.length);
  await save(1);const customId=(await state()).draft.id;
  await page.click('#librarySetDefault');await page.waitForFunction(id=>__desk.libraries().defaultId===id,{},customId);
  await page.evaluate(()=>{window.__downloads=[];const old=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(t=>__downloads.push(t));return old.call(URL,blob)};HTMLAnchorElement.prototype.click=function(){}});
  await page.click('#libraryExport');await page.waitForFunction(()=>__downloads.length===1);
  const exportText=await page.evaluate(()=>__downloads[0]);const exported=JSON.parse(exportText);
  assert.deepEqual(exported.recipe.targetPool.selectedRegions,['8','15']);assert.deepEqual(exported.snapshot.lex,compiled.lex);
  fs.writeFileSync('/tmp/library-regions-config.json',exportText);
  await page.click('#bankTxt');await page.waitForFunction(()=>__downloads.length===2);
  assert.deepEqual((await page.evaluate(()=>__downloads[1])).trim().split('\n'),extraExpected);
  await ready();await page.click('#btnBank');await page.click('[data-library-view="range"]');
  assert.deepEqual((await state()).draft.targetPool.selectedRegions,['8','15']);assert.deepEqual((await state()).draft.extraPool.selectedRegions,['8','15']);assert.equal(await count(),4372);
  await page.click('#bankClose');await page.click('#btnBatch');
  await page.evaluate(()=>{bCount.value=3;bMode.value='replace';bFrom.value=1;bAttempts.value=120;bSeed.value='pie-regions-QA'});
  await page.click('#bGo');await page.waitForFunction(()=>__lastBatch,{timeout:120000});assert.equal(await page.evaluate(()=>__lastBatch.made),3);
  await page.click('#bClose');const levels=await page.evaluate(()=>__desk.exportLevels());
  const campaign=await page.evaluate(()=>__desk.campaign()),snap=campaign.librarySnapshots[campaign.levels[0].librarySnapshotId];
  assert.deepEqual(snap.lex,compiled.lex);assert.deepEqual(snap.recipe.targetPool.selectedRegions,['8','15']);
  const targets=new Set(compiled.targetWords);assert(levels.every(l=>l.t.split(' ').every(w=>targets.has(w))));
  fs.writeFileSync('/tmp/library-regions-levels.json',JSON.stringify(levels));fs.writeFileSync('/tmp/library-regions-lex.json',JSON.stringify(compiled.lex));
  // Editing only one pool's sources invalidates only that pool's old area binding.
  await page.click('#btnBank');await page.click('#libraryRangeEdit');
  await page.select('[data-pool="targetPool"][data-index="0"] [data-field="config"]','list0');
  assert.deepEqual((await state()).draft.targetPool.selectedRegions,[]);assert.deepEqual((await state()).draft.extraPool.selectedRegions,['8','15']);
  assert.equal((await state()).preview.candidates,0);await save(2);
  await page.click('#bankClose');await page.click('#btnBatch');assert(await page.$eval('#bGo',e=>e.disabled));await page.click('#bClose');
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),levels);
  await page.click('#btnBank');await (await page.$('#libraryFile')).uploadFile('/tmp/library-regions-config.json');
  await page.waitForFunction(()=>__desk.libraries().draft.name==='饼图多选验收 · 导入');
  assert.deepEqual((await state()).draft.targetPool.selectedRegions,['8','15']);assert.deepEqual((await state()).draft.extraPool.selectedRegions,['8','15']);
  await page.click('[data-library-view="range"]');await page.click('[data-range-kind="common"]');assert.equal(await count(),1627);
  await page.click('[data-library-view="list"]');assert.equal(await page.$eval('[data-operation="targetPool"]',e=>e.value),'intersection');
  await page.select('[data-operation="targetPool"]','union');await page.click('[data-library-view="range"]');assert.equal(await count(),10758);
  assert.equal(await page.$$eval('[data-range-mask][aria-pressed="true"]',es=>es.length),15);
  // Empty pools and more than seven sources use the same persisted region semantics.
  const many=structuredClone(baseline);many.targetPool.sources=data.games.flatMap(g=>g.configs.map(c=>({gameId:g.id,configId:c.id,roles:['target']})));
  await page.evaluate(r=>__desk.editLibrary(r),many);assert.equal(await page.$('#libraryRangeChart svg'),null);
  await page.click('#libraryRangeClear');const row=await page.$eval('[data-range-mask]',e=>e.dataset.rangeMask);await page.click('[data-range-mask="'+row+'"]');
  assert.deepEqual((await state()).draft.targetPool.selectedRegions,[row]);await page.click('[data-range-mask="'+row+'"]');assert.deepEqual((await state()).draft.targetPool.selectedRegions,[]);
  const offline=await browser.newPage();offline.on('pageerror',e=>errors.push(e.message));await offline.setViewport({width:1440,height:1000});
  await offline.goto('file://'+path.resolve(__dirname,'../wordpages-level-desk.html')+'?fresh=1',{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());
  await offline.click('#btnBank');await offline.click('#libraryCopy');await offline.click('[data-library-view="range"]');await offline.click('#libraryRangeClear');
  await offline.click('#libraryRangeChart [data-mask="15"]');await offline.click('#libraryRangeChart [data-mask="8"]');await offline.click('#librarySave');
  await offline.waitForFunction(()=>document.querySelector('#libraryStatus').textContent.startsWith('已保存 · v1'));await offline.click('#librarySetDefault');
  await offline.waitForFunction(()=>__desk.libraries().defaultId===__desk.libraries().draft.id);await offline.reload({waitUntil:'load'});await offline.evaluate(()=>__desk.ready());
  await offline.click('#btnBank');await offline.click('[data-library-view="range"]');assert.deepEqual(await offline.evaluate(()=>__desk.libraries().draft.targetPool.selectedRegions),['8','15']);
  assert.deepEqual(errors,[]);
  console.log('pie configuration: toggle/multiselect/highlights, keyboard and area clicks, list synchronization, JSON/refresh/offline persistence, real generation, empty selection and source changes passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
