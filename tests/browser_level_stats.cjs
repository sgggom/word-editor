/* List metrics in real source switching, edits/undo, persistence and offline pages. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), {pathToFileURL} = require('node:url');
const puppeteer = require('puppeteer-core');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000/';
const chrome = process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const output = path.resolve(__dirname, '../outputs/level-list-stats-2026-10-26');
const keys = ['straight','oneTurn','multiTurn','forward'];
const fixture = {id:'1',name:'列表统计验证',g:'ALE,MTL,OBE',t:'ALE MOB BELT MALE MALT',n:'332321121',e:'ALT LAM OBE BEL',lv:'',ty:'',curtains:[]};

async function values(page, row=0) {
  return page.$$eval('#levelList [data-level-index="'+row+'"] [data-path-stat]', es => es.map(e => e.textContent));
}
async function importFixture(page) {
  await page.evaluate(game => __desk.importText(JSON.stringify([game])), fixture);
  await page.waitForSelector('#modal', {visible:true});
  await page.evaluate(() => [...document.querySelectorAll('#mBtns button')].find(b => b.textContent === '导入').click());
  await page.waitForSelector('#modal', {hidden:true}); await page.evaluate(() => __desk.flush());
}
async function source(page, kind) {
  await page.click('[data-src="'+kind+'"]');
  await page.waitForFunction(kind => document.querySelector('#desk').dataset.source === kind && document.querySelector('#levelList [data-path-stat]'), {}, kind);
}

(async () => {
  fs.mkdirSync(output, {recursive:true});
  const browser = await puppeteer.launch({executablePath:chrome,headless:true}), errors=[];
  try {
    const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({width:1600,height:1000});
    await page.goto(base, {waitUntil:'load'}); await page.evaluate(() => __desk.ready());
    assert.deepEqual(await page.$$eval('#levelList th.level-path-stat', es=>es.map(e=>e.textContent)), ['直线词数','1 拐词数','多拐词数','正向词占比']);
    assert.deepEqual(await page.$$eval('#levelList tbody tr:first-child [data-path-stat]', es=>es.map(e=>e.dataset.pathStat)), keys);

    await source(page, 'wt');
    assert.equal(await page.$$eval('#levelList tbody tr', es=>es.length), 1500);
    assert.deepEqual(await values(page), ['1','2','0','100%']);
    assert.deepEqual(await values(page,1), ['2','1','0','100%']);
    assert.deepEqual(await values(page,2), ['3','0','1','100%']);
    assert.deepEqual(await values(page,3), ['3','0','0','0%']);
    assert.deepEqual(await values(page,4), ['1','2','3','83.3%']);
    assert.deepEqual(await values(page,13), ['1','2','2','80%']);
    assert.match(await page.$eval('#levelList [data-level-index="13"] [data-path-stat="forward"]',e=>e.title), /4 \/ 5 个必答词/);
    assert.match(await page.$eval('#levelList [data-level-index="13"] [data-path-stat="forward"]',e=>e.title), /ALE、BELT、MALE、MALT/);
    const allRows = await page.$$eval('#levelList tbody tr', es=>es.map(e=>[...e.querySelectorAll('[data-path-stat]')].map(e=>e.textContent)));
    await page.click('#paceExtra');
    assert.deepEqual(await page.$$eval('#levelList tbody tr', es=>es.map(e=>[...e.querySelectorAll('[data-path-stat]')].map(e=>e.textContent))), allRows, 'chart extras toggle does not change required-word counts');
    await page.click('#paceExtra');
    assert(await page.$eval('#levelList', e=>e.scrollWidth<=e.clientWidth+1), 'desktop columns fit inside the list');
    await (await page.$('#levelList')).screenshot({path:path.join(output,'level-list.png')});
    // On narrow screens only the table scrolls horizontally; action columns stay reachable.
    for (const width of [1024,390]) {
      await page.setViewport({width,height:900});
      const bounds = await page.$eval('#levelList',e=>({right:e.getBoundingClientRect().right,window:innerWidth,scroll:e.scrollWidth,client:e.clientWidth}));
      assert(bounds.right<=bounds.window+1); assert(bounds.scroll>bounds.client);
      await page.$eval('#levelList',e=>{e.scrollLeft=e.scrollWidth;});
      assert(await page.$eval('#levelList tbody tr:first-child [data-level-action="play"]',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
    }
    await page.setViewport({width:1600,height:1000}); await page.$eval('#levelList',e=>{e.scrollLeft=0;});
    await source(page,'zen'); assert.deepEqual(await values(page), ['—','—','—','—']);
    assert.match(await page.$eval('#levelList [data-path-stat]',e=>e.title), /没有棋盘/);
    await source(page,'ours');
    console.log('list columns: known Word Tiles counts, matching word tooltips, target-only scope, Zen and responsive scrolling passed');

    await importFixture(page); assert.deepEqual(await values(page), ['1','2','2','80%']);
    const original = await page.evaluate(() => __desk.packText());
    await page.click('#levelList [data-level-index="0"] [data-level-action="detail"]');
    await page.$eval('#grid input[data-i="0"]', e=>{e.value='Q';e.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.click('#btnBackToList');
    assert.deepEqual(await values(page), ['0','1','1','20%'], 'editing invalidates cached path statistics and keeps all targets in the denominator');
    assert.match(await page.$eval('#levelList [data-path-stat]',e=>e.title), /无法连出的必答词：ALE、MALE、MALT/);
    await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
    await page.waitForFunction(() => document.querySelector('#levelList [data-path-stat="straight"]').textContent === '1');
    assert.deepEqual(await values(page), ['1','2','2','80%']);
    assert.equal(await page.evaluate(() => __desk.packText()), original, 'statistics do not change game export');
    await page.evaluate(() => __desk.flush()); await page.reload({waitUntil:'load'}); await page.evaluate(() => __desk.ready());
    assert.deepEqual(await values(page), ['1','2','2','80%']);
    assert.equal(await page.evaluate(() => __desk.packText()), original);
    console.log('editing: cached counts update, unreachable words explained, undo/export and saved reload passed');

    for (const filename of ['index.html','wordpages-level-desk.html']) {
      const context=await browser.createBrowserContext(), offline=await context.newPage();
      offline.on('pageerror',e=>errors.push(e.message)); await offline.setViewport({width:1280,height:900});
      await offline.goto(pathToFileURL(path.resolve(__dirname,'..',filename)).href,{waitUntil:'load'}); await offline.evaluate(()=>__desk.ready());
      await importFixture(offline); assert.deepEqual(await values(offline), ['1','2','2','80%']);
      await context.close();
    }
    assert.deepEqual(errors,[]);
    console.log('both standalone HTML files and no page errors passed; screenshot: '+path.join(output,'level-list.png'));
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
