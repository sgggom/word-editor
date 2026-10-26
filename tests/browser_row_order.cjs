/* Original-game row orientation, with real pointer/keyboard and file round trips. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), {pathToFileURL} = require('node:url');
const puppeteer = require('puppeteer-core');
const E = require('../src/gen'), P = require('../src/level_pool'), L = require('../src/library');
const data = require('../data/game_vocab/catalog.json');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000/';
const chrome = process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const output = path.resolve(__dirname, '../outputs/row-order-2026-10-26');
const sample = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8').match(/<script id="sample" type="application\/json">(.*?)<\/script>/s)[1]);
const snapshot = L.production(data, L.tieredRecipes(data).filter(r => r.targetPool.sources.length)).snapshot;
const index = E.buildIndex(snapshot.lex);
const fixture = {id:'1', name:'行序对照', g:'ALE,MTL,OBE', t:'ALE MOB BELT MALE MALT', n:'332321121', e:'', lv:'', ty:'', curtains:[]};
const games = [fixture, ...[[4,2], [4,3], [5,3]].map(([w,h]) => structuredClone(sample.books.flatMap(b => b.levels).find(l => l.g.split(',').length === h && l.g.split(',')[0].length === w)))];
for (const game of games) {
  const check = E.validate(P.parseGame(game), index, E.DEFAULTS);
  assert(check.ok, check.errors.join('; '));
  game.e = check.extras.join(' ');
}
const entries = games.map(game => P.record(game, snapshot, {}, index));
const pool = P.exportFile({id:'row-order-fixture', name:'行序验证'}, entries, {[snapshot.id]:snapshot});
const plan = {kind:'wordpages-arrangement', schemaVersion:1, name:'行序验证', seed:'row-order', budget:10000,
  requiredLetters:{id:'row-order-neutral', levels:{}}, overrides:{},
  segments:entries.map((entry,i) => ({id:'s'+i, from:i+1, to:i+1, width:entry.metrics.width, height:entry.metrics.height,
    targetCount:entry.metrics.targetCount, poolIds:[pool.pool.id], rules:{maxTurns:null, repeatGap:0}}))};

async function confirm(page, label) {
  await page.waitForSelector('#modal', {visible:true});
  await page.evaluate(label => [...document.querySelectorAll('#mBtns button')].find(b => b.textContent === label).click(), label);
  await page.waitForSelector('#modal', {hidden:true});
}
async function importGame(page, game) {
  await page.evaluate(game => __desk.importText(JSON.stringify([game])), game);
  await confirm(page, '导入');
  await page.evaluate(() => __desk.flush());
}
async function detail(page) {
  if (await page.$eval('#desk', e => e.dataset.view === 'list')) {
    const current = await page.evaluate(() => __desk.campaign().index);
    await page.click('#levelList [data-level-index="'+current+'"] [data-level-action="detail"]');
  }
  await page.waitForSelector('#grid input', {visible:true});
}
async function board(page, selector, rows, counts) {
  const cells = await page.$$eval(selector + ' > *', es => es.map(e => {
    const rect = e.getBoundingClientRect();
    return {letter:e.querySelector('input')?.value ?? e.querySelector('.ch')?.textContent ?? e.firstChild.textContent,
      count:e.querySelector('.cnt, .c, small')?.textContent, index:Number(e.dataset.i), x:rect.x, y:rect.y};
  }));
  assert.equal(cells.map(c => c.letter).join(''), rows.join(''), selector + ' reads top to bottom');
  if (counts) assert.equal(cells.map(c => c.count).join(''), counts, selector + ' counts stay on their letters');
  const width = rows[0].length;
  for (let i = 1; i < cells.length; i++) {
    if (i % width) assert(cells[i].x > cells[i-1].x && Math.abs(cells[i].y-cells[i-1].y) < 1, 'columns keep left-to-right order');
    else assert(cells[i].y > cells[i-1].y, 'rows physically run top to bottom');
  }
  return cells;
}
function visibleGame(game) {
  const rows = game.g.split(','), width = rows[0].length;
  return {rows:rows.slice().reverse(), counts:Array.from({length:rows.length}, (_,i) => game.n.slice(i*width,(i+1)*width)).reverse().join('')};
}
async function boardGame(page, selector, game) {
  const expected = visibleGame(game);
  return board(page, selector, expected.rows, expected.counts);
}
async function trace(page, indices, expectedWord) {
  const points = await page.$$eval('#pgrid > *', es => Object.fromEntries(es.map(e => {
    const r = e.getBoundingClientRect(); return [e.dataset.i, {x:r.x+r.width/2, y:r.y+r.height/2}];
  })));
  await page.mouse.move(points[indices[0]].x, points[indices[0]].y);
  await page.mouse.down();
  for (const i of indices.slice(1)) await page.mouse.move(points[i].x, points[i].y, {steps:5});
  assert.equal(await page.$eval('#pcur', e => e.textContent), expectedWord, 'pointer coordinates identify the visible letters');
  assert.deepEqual((await page.$$eval('#pgrid .sel', es => es.map(e => Number(e.dataset.i)))).sort((a,b)=>a-b), indices.slice().sort((a,b)=>a-b));
  await page.mouse.up();
}

(async () => {
  fs.mkdirSync(output, {recursive:true});
  const browser = await puppeteer.launch({executablePath:chrome, headless:true});
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({width:1440, height:1000});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion', value:'reduce'}]);
    await page.goto(base, {waitUntil:'load'}); await page.evaluate(() => __desk.ready());

    // User's screenshot is Word Tiles list0 level 14. Expected rows are explicit.
    await page.click('[data-src="wt"]');
    await page.waitForFunction(() => __desk.source().kind === 'wt');
    await page.$eval('#srcJump', e => {e.value=14; e.dispatchEvent(new Event('change'));});
    await detail(page);
    assert.deepEqual((await board(page, '#grid', ['OBE','MTL','ALE'], '121321332')).map(c => c.index), [6,7,8,3,4,5,0,1,2]);
    await page.click('#btnPlay'); await page.waitForSelector('#play', {visible:true});
    await board(page, '#pgrid', ['OBE','MTL','ALE'], '121321332');
    await (await page.$('#pgrid')).screenshot({path:path.join(output, 'board-after.png')});
    for (const i of [6,7,8,3,4,5,0,1,2]) await trace(page, [i], fixture.g.replaceAll(',', '')[i]);
    for (let found = 0; found < fixture.t.split(' ').length; found++) {
      await page.click('#pHint');
      const step = await page.evaluate(() => {
        const d=__desk.campaign().levels[__desk.campaign().index], word=document.querySelector('#pcur').textContent;
        const highlighted=new Set([...document.querySelectorAll('#pgrid .sel')].map(e=>Number(e.dataset.i)));
        return {word, path:WPEditorCore.pathsOf(d.letters,d.W,d.H,word).find(p=>p.every(i=>highlighted.has(i)))};
      });
      assert(step.path, 'hint highlights a real path');
      await trace(page, step.path, step.word);
      await page.waitForFunction(n => document.querySelector('#pBoxProg').textContent.startsWith(n+' /'), {}, found+1);
    }
    await page.waitForSelector('#pdone', {visible:true}); await page.click('#pBack');
    console.log('screenshot fixture: OBE on top, counts, all cell hits, hints and completion passed');

    await page.click('[data-src="ours"]'); await page.waitForFunction(() => __desk.source().kind === 'ours');
    await importGame(page, fixture); await detail(page);
    const before = await page.evaluate(() => __desk.exportLevels());
    await page.focus('#grid input[data-i="6"]');
    for (const [key, expected] of [['ArrowUp',6], ['ArrowLeft',6], ['ArrowDown',3], ['ArrowUp',6], ['ArrowRight',7], ['Tab',8], ['Tab',3]]) {
      await page.keyboard.press(key); assert.equal(await page.evaluate(() => Number(document.activeElement.dataset.i)), expected, key);
    }
    await page.$eval('#grid input[data-i="8"]', e => {e.focus(); e.select();}); await page.keyboard.type('E');
    assert.equal(await page.evaluate(() => Number(document.activeElement.dataset.i)), 3, 'typing wraps from the top row to the middle row');
    await page.$eval('#grid input[data-i="6"]', e => {e.focus(); e.select();}); await page.keyboard.type('Q');
    assert.equal(await page.evaluate(() => __desk.campaign().levels[0].letters[6]), 'Q');
    assert.equal(await page.evaluate(() => Number(document.activeElement.dataset.i)), 7);
    await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
    await page.waitForFunction(() => document.querySelector('#grid input[data-i="6"]').value === 'O');
    assert.deepEqual(await page.evaluate(() => __desk.exportLevels()), before);
    await page.evaluate(() => __desk.flush()); await page.reload({waitUntil:'load'}); await page.evaluate(() => __desk.ready());
    assert.deepEqual(await page.evaluate(() => __desk.exportLevels()), before, 'stored data stays unchanged');
    await detail(page); await boardGame(page, '#grid', fixture);

    // A top-left curtain still uses raw index 6 and opens after two words.
    const curtain = {id:'1',name:'幕布行序',g:'CAT,DOG,PIG',t:'CAT DOG PIG',n:'111111111',e:'',lv:'',ty:'',curtains:[{req:2,cells:[6]}]};
    await importGame(page, curtain); await detail(page);
    assert.equal(await page.$eval('#grid > :first-child', e => !!e.querySelector('.veil')), true);
    assert.deepEqual((await page.evaluate(() => __desk.exportLevels()))[0].curtains, curtain.curtains);
    await page.click('#btnPlay'); await page.waitForSelector('#play', {visible:true});
    await board(page, '#pgrid', ['PIG','DOG','CAT'], '111111111');
    assert.equal(await page.$eval('#pgrid > :first-child', e => e.classList.contains('curt')), true);
    await page.click('#pgrid > :first-child'); assert.equal(await page.$eval('#pcur',e=>e.textContent), '');
    await trace(page, [0,1,2], 'CAT'); await trace(page, [3,4,5], 'DOG');
    assert.equal(await page.$eval('#pgrid [data-i="6"]', e => e.classList.contains('curt')), false);
    await trace(page, [6,7,8], 'PIG'); await page.waitForSelector('#pdone', {visible:true}); await page.click('#pBack');
    console.log('editing: visual keyboard/typing order, undo, persistence, curtain positions and unlocking passed');

    await page.evaluate(file => __desk.workflow.importPool(file), pool);
    await page.click('#btnBatch'); await page.waitForSelector('#batch', {visible:true});
    for (const [i,entry] of entries.entries()) {
      await page.click('[data-pool-preview="'+entry.id+'"]'); await page.waitForSelector('#modal .inventory-board', {visible:true});
      await boardGame(page, '#modal .inventory-board', games[i]);
      await confirm(page, '试玩'); await page.waitForSelector('#play', {visible:true});
      await boardGame(page, '#pgrid', games[i]);
      // Exercise hit testing on each supported width/height.
      const topLeft = (games[i].g.split(',').length-1)*games[i].g.split(',')[0].length;
      await trace(page, [topLeft], games[i].g.split(',').at(-1)[0]);
      await page.click('#pBack');
    }
    assert.deepEqual((await page.evaluate(() => __desk.workflow.exportPool())).entries.map(e=>e.game).sort((a,b)=>a.g.localeCompare(b.g)), games.slice().sort((a,b)=>a.g.localeCompare(b.g)));
    await page.click('#bClose'); await page.evaluate(plan => __desk.workflow.setPlan(plan), plan);
    await page.click('#btnArrange'); await page.waitForSelector('#arrange', {visible:true});
    await page.click('#aRun'); await page.waitForFunction(() => window.__lastArrangement, {timeout:60000});
    assert.equal(await page.evaluate(() => __lastArrangement.status), 'complete');
    for (const [i,game] of games.entries()) {
      await page.click('[data-row-detail="'+(i+1)+'"]'); await page.waitForSelector('#aRowDetail .inventory-board');
      await boardGame(page, '#aRowDetail .inventory-board', game);
    }
    await page.evaluate(() => __desk.workflow.apply());
    assert.equal(await page.evaluate(() => __desk.workflow.audit().ok), true);
    assert.deepEqual((await page.evaluate(() => __desk.exportLevels())).map(g=>[g.g,g.n,g.curtains]), games.map(g=>[g.g,g.n,g.curtains]));
    const pack = await page.evaluate(() => __desk.packText());
    await page.evaluate(text => __desk.importText(text), pack); await confirm(page, '导入');
    assert.equal(await page.evaluate(() => __desk.packText()), pack, 'game export/reimport does not double flip');
    console.log('all four board sizes: inventory, previews, play, arrangement and game/pool export round trips passed');

    for (const filename of ['index.html','wordpages-level-desk.html']) {
      const context=await browser.createBrowserContext(), offline=await context.newPage();
      offline.on('pageerror', e => errors.push(e.message)); await offline.setViewport({width:1280,height:900});
      await offline.goto(pathToFileURL(path.resolve(__dirname,'..',filename)).href, {waitUntil:'load'}); await offline.evaluate(() => __desk.ready());
      await importGame(offline, fixture); await detail(offline); await boardGame(offline, '#grid', fixture);
      await offline.click('#btnPlay'); await offline.waitForSelector('#play', {visible:true}); await boardGame(offline, '#pgrid', fixture);
      await trace(offline, [6], 'O'); await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('both standalone HTML files passed; no page errors; screenshot: '+path.join(output,'board-after.png'));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
