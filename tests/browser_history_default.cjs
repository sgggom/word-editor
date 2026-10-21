/* Start a static server; requires puppeteer-core on NODE_PATH and Chromium. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const puppeteer = require('puppeteer-core');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000/';
const chrome = process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-default-history-'));
  const browser = await puppeteer.launch({executablePath: chrome, headless: true});
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({width: 1440, height: 1000});
    const ready = async () => page.evaluate(() => __desk.ready());
    const confirm = async label => {
      await page.waitForSelector('#modal', {visible: true});
      await page.evaluate(label => [...document.querySelectorAll('#mBtns button')].find(b => b.textContent === label).click(), label);
      await page.waitForSelector('#modal', {hidden: true});
    };
    const pack = () => page.evaluate(() => JSON.parse(__desk.packText()));
    const openHistory = async () => {
      await page.click('#btnHistory');
      await page.waitForSelector('#hist', {visible: true});
    };
    const openDefault = async () => {
      await openHistory();
      await page.click('[data-hdefault]');
      await confirm('导入');
      await page.waitForSelector('#hist', {hidden: true});
    };
    await page.goto(base, {waitUntil: 'networkidle0'}); await ready();
    const defaults = await page.evaluate(() => JSON.parse(document.getElementById('sample').textContent));
    const count = defaults.books.reduce((n, b) => n + b.levels.length, defaults.daily.length);
    await openHistory();
    assert.equal(await page.$$eval('#histList [data-hid]', es => es.length), 0);
    assert.equal(await page.$eval('#histList .hrow:first-child .hopen', e => e.hasAttribute('data-hdefault')), true);
    assert.match(await page.$eval('[data-hdefault]', e => e.textContent), new RegExp('默认关卡' + count + ' 关'));
    assert.equal(await page.$$eval('[data-hdefault] + [data-hdel]', es => es.length), 0);
    await page.click('#histClose');

    const original = {books: [{...defaults.books[0], name: '本地关序', levels: defaults.books[0].levels.slice(0, 2)}], daily: []};
    const filename = path.join(temp, 'local-levels.json');
    fs.writeFileSync(filename, JSON.stringify(original));
    await (await page.$('#file')).uploadFile(filename); await confirm('导入');
    await page.waitForFunction(() => __desk.file() && __desk.campaign().levels.length === 2);
    await page.evaluate(() => __desk.flush());
    const originalFile = await page.evaluate(() => __desk.file().id);
    const before = await page.evaluate(() => __desk.deskText());
    const libraries = await page.evaluate(() => __desk.libraries().recipes);
    await openHistory();
    await page.screenshot({path: '/tmp/history-default.png'});
    await page.click('[data-hdefault]'); await confirm('取消');
    assert.equal(await page.evaluate(() => __desk.deskText()), before);
    assert.equal(await page.evaluate(() => __desk.file().id), originalFile);
    assert.equal(await page.$eval('#hist', e => e.hidden), false);
    await page.click('[data-hdefault]'); await confirm('导入');
    await page.waitForSelector('#hist', {hidden: true});
    assert.deepEqual(await pack(), defaults);
    assert.equal(await page.evaluate(() => __desk.campaign().index), 0);
    assert.equal(await page.evaluate(() => __desk.campaign().name), '示例关序');
    assert.equal(await page.evaluate(() => __desk.file()), null);
    assert.deepEqual(await page.evaluate(() => __desk.libraries().recipes), libraries);

    await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
    await page.waitForFunction(id => __desk.file()?.id === id, {}, originalFile);
    assert.equal(await page.evaluate(() => __desk.deskText()), before);
    await openDefault();
    await page.reload({waitUntil: 'networkidle0'}); await ready();
    assert.deepEqual(await pack(), defaults);
    assert.equal(await page.evaluate(() => __desk.file()), null);
    await openHistory();
    assert.equal(await page.$$eval('#histList [data-hid]', es => es.length), 1, 'built-in default must not create duplicate history records');
    await page.click('#histList [data-hid] .hopen'); await confirm('导入');
    await page.waitForSelector('#hist', {hidden: true});
    assert.deepEqual(await pack(), original, 'opening defaults must preserve the original cached file');
    await openHistory(); await page.click('#histList [data-hdel]');
    await page.waitForFunction(() => !document.querySelector('#histList [data-hid]'));
    assert.equal(await page.$$eval('[data-hdefault]', es => es.length), 1, 'default remains after deleting the last recent file');

    for (const file of ['index.html', 'wordpages-level-desk.html']) {
      const context = await browser.createBrowserContext(), offline = await context.newPage();
      offline.on('pageerror', e => errors.push(e.message));
      try {
        await offline.goto(pathToFileURL(path.resolve(__dirname, '..', file)).href + '?fresh=1', {waitUntil: 'load'});
        await offline.evaluate(() => __desk.ready());
        await offline.click('#btnHistory'); await offline.waitForSelector('#hist', {visible: true});
        await offline.click('[data-hdefault]');
        await offline.evaluate(() => [...document.querySelectorAll('#mBtns button')].find(b => b.textContent === '导入').click());
        await offline.waitForSelector('#hist', {hidden: true});
        assert.deepEqual(await offline.evaluate(() => JSON.parse(__desk.packText())), defaults);
      } finally { await context.close(); }
    }
    assert.deepEqual(errors, []);
    console.log('default history: empty/listed history, cancel, exact pack restore, undo/file binding, persistence, cached-file preservation and both offline files passed');
  } finally {
    await browser.close();
    fs.rmSync(temp, {recursive: true, force: true});
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
