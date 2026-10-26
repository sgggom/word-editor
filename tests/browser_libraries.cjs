const {produceAndApply}=require('./workflow_helpers.cjs');
/* Browser acceptance for vocabulary recipes, immutable level snapshots and provenance. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core'),L=require('../src/library'),E=require('../src/gen');
const data=require('../data/game_vocab/catalog.json');
const base=process.env.BASE_URL||'http://127.0.0.1:8000/';
const chrome=process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function nameLibrary(page, button, name) {
 await page.click(button);await page.waitForSelector('#libraryNameDialog[open]');
 await page.$eval('#libraryName',(el,name)=>{el.value=name;el.dispatchEvent(new Event('input',{bubbles:true}));},name);
 await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('#libraryNameDialog').open);
}
(async()=>{
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1440,height:1000});
  const ready=async(url=base)=>{await page.goto(url,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());};
  const setValue=async(selector,value)=>page.$eval(selector,(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
  const save=async(revision)=>{await page.click('#librarySave');await page.waitForFunction(rev=>document.querySelector('#libraryStatus').textContent.startsWith('已保存 · v'+rev),{},revision);};
  const confirmImport=async(text)=>{await page.evaluate(text=>__desk.importText(text),text);await page.waitForSelector('#modal',{visible:true});await page.evaluate(()=>[...document.querySelectorAll('#mBtns button')].find(x=>x.textContent==='导入').click());await page.waitForSelector('#modal',{hidden:true});await page.evaluate(()=>__desk.flush());};
  const generate=async(count=3)=>(await produceAndApply(page,count,'library-browser-QA')).levels;
  await ready(base+'?fresh=1');
  // The requested eight presets replace old recipes once; level snapshots survive.
  const oldRecipe={id:'word-tiles-main',name:'Word Tiles 两版并集',revision:1,datasetHash:data.datasetHash,
    targetPool:{operation:'union',sources:[{gameId:'07_Word_Tiles',configId:'*',roles:['target']}]},
    extraPool:{operation:'union',sources:[{gameId:'07_Word_Tiles',configId:'*',roles:['extra']}]}};
  const oldSnap=L.snapshot(data,oldRecipe),keptRecipe={...structuredClone(oldRecipe),id:'kept-custom',name:'已保存配置'};
  await page.evaluate(()=>__desk.flush());
  await page.evaluate(async ({oldRecipe,keptRecipe,oldSnap})=>{
    const camp=JSON.parse(__desk.deskText());camp.index=0;camp.levels[0].librarySnapshotId=oldSnap.id;camp.librarySnapshots={[oldSnap.id]:oldSnap};
    const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('wp.leveldesk',1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
    await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put({schemaVersion:1,presetVersion:'four-games-v1',recipes:[oldRecipe,keptRecipe],defaultId:keptRecipe.id},'libraries');tx.objectStore('kv').put(camp,'campaign');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
  },{oldRecipe,keptRecipe,oldSnap});
  await ready();
  const upgrade=await page.evaluate(()=>({state:__desk.libraries(),campaign:__desk.campaign()}));
  assert.equal(upgrade.state.defaultId,'four-game-target-core');
  assert.deepEqual(upgrade.state.recipes,L.tieredRecipes(data));
  assert.equal(upgrade.state.recipes.find(r=>r.id===keptRecipe.id),undefined);
  assert.deepEqual(upgrade.campaign.librarySnapshots[oldSnap.id],oldSnap);
  assert.equal(upgrade.campaign.levels[0].librarySnapshotId,oldSnap.id);
  await page.click('#btnBank');
  assert.equal(await page.$('#bank #libraryName'),null);
  const beforeNaming=await page.evaluate(()=>__desk.libraries());
  await page.click('#libraryNew');assert(await page.$eval('#libraryName',e=>document.activeElement===e));
  assert.deepEqual(await page.evaluate(()=>__desk.libraries()),beforeNaming);
  await setValue('#libraryName','   ');await page.keyboard.press('Enter');
  assert.match(await page.$eval('#libraryNameError',e=>e.textContent),/请输入词库名称/);
  assert(await page.$eval('#libraryNameDialog',e=>e.open));
  await page.keyboard.press('Escape');assert.equal(await page.$eval('#bank',e=>e.hidden),false);
  assert.equal(await page.$eval('#libraryNameDialog',e=>e.open),false);
  assert.deepEqual(await page.evaluate(()=>__desk.libraries()),beforeNaming);
  assert.match(await page.$eval('#libraryStats',e=>e.textContent),/1,627/);
  for(const recipe of L.tieredRecipes(data)) {
    await page.select('#librarySelect',recipe.id);
    assert.deepEqual((await page.evaluate(()=>__desk.libraries())).preview,L.compile(data,recipe).stats);
  }
  await page.select('#librarySelect','four-game-extra-core');await page.click('[data-library-view="range"]');
  assert.equal(await page.$eval('#libraryRangePool',e=>e.value),'extraPool');
  assert.match(await page.$eval('#libraryRangeCaption',e=>e.textContent),/已剔除/);
  assert.match(await page.$eval('#bankMeta',e=>e.textContent),/^177 \/ 177/);
  await page.click('[data-library-view="list"]');
  assert.equal(await page.$eval('[data-exclude-targets="extraPool"]',e=>e.checked),true);
  await page.click('[data-exclude-targets="extraPool"]');assert.equal((await page.evaluate(()=>__desk.libraries())).preview.extras,617);
  await page.click('[data-exclude-targets="extraPool"]');assert.equal((await page.evaluate(()=>__desk.libraries())).preview.extras,177);
  await nameLibrary(page,'#libraryNew','四游戏并集验收');
  assert.match(await page.$eval('#libraryStats',e=>e.textContent),/10,748/);
  const gameIds=['07_Word_Tiles','06_Zen_Word','05_Words_of_Wonders','04_Wordscapes'];
  for(const key of ['targetPool','extraPool']) assert.deepEqual(await page.$$eval('[data-pool="'+key+'"] [data-field="game"]',es=>es.map(e=>e.value)),gameIds);
  await page.select('[data-operation="targetPool"]','intersection');
  assert.equal((await page.evaluate(()=>__desk.libraries())).preview.candidates,1627);
  assert.equal((await page.evaluate(()=>__desk.libraries())).draft.extraPool.operation,'union');
  await page.select('[data-operation="extraPool"]','intersection');
  assert.equal((await page.evaluate(()=>__desk.libraries())).preview.extras,579);
  await page.select('[data-operation="targetPool"]','union');await page.select('[data-operation="extraPool"]','union');
  await page.screenshot({path:'/tmp/four-game-default.png'});
  await nameLibrary(page,'#libraryCopy','交集验收');
  assert((await page.evaluate(()=>__desk.libraries())).recipes.some(r=>r.name==='交集验收' && r.revision===1));
  for(const pool of ['targetPool','extraPool']) for(const i of [3,2,1]) await page.click('[data-pool="'+pool+'"][data-index="'+i+'"] [data-remove-source]');
  await page.select('[data-pool="targetPool"][data-index="0"] [data-field="config"]','list0');
  await page.click('[data-add-source="targetPool"]');
  await page.select('[data-pool="targetPool"][data-index="1"] [data-field="game"]','04_Wordscapes');
  await page.select('[data-pool="targetPool"][data-index="1"] [data-field="config"]','base');
  await page.select('[data-operation="targetPool"]','intersection');
  await page.select('[data-pool="extraPool"] [data-field="game"]','06_Zen_Word');
  assert.equal(await page.$$eval('[data-pool="extraPool"] [data-field="role"]:checked',es=>es.length),3);
  const beforeSave=await page.evaluate(()=>__desk.libraries());
  const expected=L.compile(data,beforeSave.draft);
  assert.deepEqual(beforeSave.preview,expected.stats);assert(expected.stats.candidates>1000);
  await save(2);const customId=await page.$eval('#librarySelect',e=>e.value);
  await page.click('#librarySetDefault');await page.waitForFunction(id=>__desk.libraries().defaultId===id,{},customId);
  await page.screenshot({path:'/tmp/library-intersection.png'});
  await page.click('#bankClose');await ready();
  assert.equal((await page.evaluate(()=>__desk.libraries())).defaultId,customId);
  const generated=await generate(); const desk=await page.evaluate(()=>__desk.deskText()); const saved=JSON.parse(desk);
  assert.equal(Object.keys(saved.librarySnapshots).length,1);const snapshotId=saved.levels[0].librarySnapshotId;
  assert(saved.levels.every(d=>d.librarySnapshotId===snapshotId));assert.deepEqual(saved.librarySnapshots[snapshotId].lex,expected.lex);
  fs.writeFileSync('/tmp/library-browser-levels.json',JSON.stringify(generated));fs.writeFileSync('/tmp/library-browser-lex.json',JSON.stringify(expected.lex));
  await page.click('#btnBank');
  await page.select('[data-operation="targetPool"]','union');
  const beforeRename=await page.evaluate(()=>__desk.libraries());
  await page.click('#libraryRename');await setValue('#libraryName','取消的名称');await page.click('#libraryNameCancel');
  assert.deepEqual(await page.evaluate(()=>__desk.libraries()),beforeRename);
  await nameLibrary(page,'#libraryRename','修改后的词库');
  const renamed=await page.evaluate(()=>__desk.libraries());
  assert.equal(renamed.recipes.find(r=>r.id===customId).name,'修改后的词库');
  assert.equal(renamed.recipes.find(r=>r.id===customId).targetPool.operation,'intersection');
  assert.equal(renamed.draft.targetPool.operation,'union');
  assert.match(await page.$eval('#libraryStatus',e=>e.textContent),/配置未保存/);
  await save(4);
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),generated);
  assert.equal(await page.evaluate(()=>__desk.campaign().levels[0].librarySnapshotId),snapshotId);
  // An explicit rebind changes only the selected level; undo restores its snapshot.
  await page.click('#libraryApplyLevel');await page.waitForFunction(id=>__desk.campaign().levels[0].librarySnapshotId!==id,{},snapshotId);
  const bound=await page.evaluate(()=>__desk.campaign().levels.map(d=>d.librarySnapshotId));assert.equal(bound[1],snapshotId);
  await page.click('#bankClose');await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');await page.waitForFunction(id=>__desk.campaign().levels[0].librarySnapshotId===id,{},snapshotId);
  await page.click('#btnBank');await page.click('#libraryDelete');await page.waitForFunction(id=>!__desk.libraries().recipes.some(r=>r.id===id),{},customId);
  await page.click('#bankClose');await page.evaluate(()=>__desk.flush());await ready();
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),generated);
  assert.equal(await page.evaluate(()=>__desk.campaign().levels[0].librarySnapshotId),snapshotId);
  await generate(1);await confirmImport(desk);
  assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),generated);
  assert.deepEqual(JSON.parse(await page.evaluate(()=>__desk.deskText())).librarySnapshots,saved.librarySnapshots);
  for(const damage of [x=>x.librarySnapshots={},x=>x.librarySnapshots[snapshotId].lex.pop()]){
   const bad=JSON.parse(desk);damage(bad);await page.evaluate(text=>__desk.importText(text),JSON.stringify(bad));
   assert.match(await page.$eval('#toast',e=>e.textContent),/导入失败/);
   assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),generated);
  }
  console.log('recipes: UI intersection, save, default, generate, revise, explicit rebind, undo, delete, reload and desk import/export passed');
  // Empty candidate configurations remain editable/exportable but cannot generate.
  await page.click('#btnBank');await nameLibrary(page,'#libraryNew','空交集');
  for(const key of ['targetPool','extraPool']) assert.deepEqual((await page.evaluate(()=>__desk.libraries())).draft[key].sources.map(s=>s.gameId),gameIds);
  for(const pool of ['targetPool','extraPool']) for(const i of [3,2,1,0]) await page.click('[data-pool="'+pool+'"][data-index="'+i+'"] [data-remove-source]');
  await save(2);
  const emptyId=await page.$eval('#librarySelect',e=>e.value);await page.click('#librarySetDefault');await page.waitForFunction(id=>__desk.libraries().defaultId===id,{},emptyId);
  await page.evaluate(()=>{window.__downloads=[];const old=URL.createObjectURL;URL.createObjectURL=function(blob){blob.text().then(text=>__downloads.push(text));return old.call(URL,blob)};HTMLAnchorElement.prototype.click=function(){};});
  await page.click('#libraryExport');await page.waitForFunction(()=>__downloads.length===1);
  const configuration=await page.evaluate(()=>__downloads[0]);assert.equal(JSON.parse(configuration).kind,'wordpages-library');
  fs.writeFileSync('/tmp/library-config-roundtrip.json',configuration);
  await (await page.$('#libraryFile')).uploadFile('/tmp/library-config-roundtrip.json');
  await page.waitForFunction(()=>__desk.libraries().recipes.some(r=>r.name==='空交集 · 导入'));
  await page.click('#bankClose');await page.click('#btnBatch');await page.waitForSelector('#batch',{visible:true});assert(await page.$eval('#bGo',e=>e.disabled));
  await page.evaluate(()=>__desk.startBatch());assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),generated);await page.click('#bClose');
  await page.click('#btnBank');await page.select('#bankScope','catalog');assert.match(await page.$eval('#bankMeta',e=>e.textContent),/^32268 \/ 32268/);
  await setValue('#bankFind','CAFE\u0301');await page.waitForFunction(()=>document.querySelector('#bankMeta').textContent.startsWith('1 /'));
  assert.equal(await page.$eval('#bankCard .g-top b',e=>e.textContent),'CAFÉ');
  await setValue('#bankFind','DISNEY');await page.waitForFunction(()=>document.querySelector('#bankCard .g-top b')?.textContent==='DISNEY');
  await page.click('#bankSources summary');await page.waitForFunction(()=>document.querySelector('#bankProvenance .lib-provenance'),{timeout:60000});
  const provenance=await page.$eval('#bankProvenance',e=>e.textContent);assert.match(provenance,/Crossword Go/);assert.match(provenance,/DISNEY/);assert.match(provenance,/答案补全/);
  await page.click('#bankCsv');await page.waitForFunction(()=>__downloads.length>=2);assert.match(await page.evaluate(()=>__downloads.at(-1)),/DISNEY/);
  console.log('empty recipes, JSON roundtrip, source search, NFC, provenance/completion and CSV passed');
  // A two-letter extra is playable, with the library embedded in the editor file.
  const twoRecipe=L.defaultRecipe(data);twoRecipe.id='two-letter-test';twoRecipe.name='两字母额外验收';
  twoRecipe.extraPool.sources=[{gameId:'06_Zen_Word',configId:'*',roles:L.ROLES}];const twoSnap=L.snapshot(data,twoRecipe);
  const found=E.scan('CATOIN'.split(''),3,2,E.buildIndex(twoSnap.lex)).map(x=>x.word);
  const draft={name:'two-letter',W:3,H:2,letters:'CATOIN'.split(''),words:['CAT','COIN'],extras:found.filter(w=>!['CAT','COIN'].includes(w)),types:[0,0],tiers:[0,0],curtains:[],librarySnapshotId:twoSnap.id};
  assert(draft.extras.includes('IN'));
  await page.click('#bankClose');await confirmImport(JSON.stringify({kind:'wordpages-desk',levels:[draft],librarySnapshots:{[twoSnap.id]:twoSnap}}));
  await page.click('#btnPlay');await page.waitForSelector('#pgrid',{visible:true});
  const cells=await page.$$eval('#pgrid > *',es=>es.map(e=>{const r=e.getBoundingClientRect();return {i:Number(e.dataset.i),x:r.x+r.width/2,y:r.y+r.height/2}}).sort((a,b)=>a.i-b.i));
  await page.mouse.move(cells[4].x,cells[4].y);await page.mouse.down();await page.mouse.move(cells[5].x,cells[5].y,{steps:5});await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#pExtra').textContent.startsWith('1 /'));await page.click('#pBack');
  // Legacy drafts receive the new default without losing their word/board data.
  const legacy=structuredClone(draft);delete legacy.librarySnapshotId;await confirmImport(JSON.stringify({kind:'wordpages-desk',levels:[legacy]}));
  const migrated=await page.evaluate(()=>__desk.campaign());assert(migrated.librarySnapshots[migrated.levels[0].librarySnapshotId]);
  for(const key of ['letters','words','extras'])assert.deepEqual(migrated.levels[0][key],legacy[key]);
  assert.equal(migrated.librarySnapshots[migrated.levels[0].librarySnapshotId].recipe.id,'four-game-target-core');
  const offline=await browser.newPage();offline.on('pageerror',e=>errors.push(e.message));
  await offline.goto('file://'+path.resolve(__dirname,'../wordpages-level-desk.html')+'?fresh=1',{waitUntil:'load'});await offline.evaluate(()=>__desk.ready());
  await offline.click('#btnBank');await nameLibrary(offline,'#libraryCopy','离线配置');await offline.waitForFunction(()=>__desk.libraries().recipes.some(r=>r.name==='离线配置'));
  await offline.click('#bankClose');await produceAndApply(offline,1,'offline-library-QA');
  await offline.close();assert.deepEqual(errors,[]);
  console.log('two-letter extra play, legacy migration and true file:// configuration/generation passed; no page errors');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
