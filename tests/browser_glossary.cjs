/* Bilingual glossary, IPA status, word lookup and standalone HTML acceptance. */
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const puppeteer = require('puppeteer-core');
const L = require('../src/library');
const data = require('../data/game_vocab/catalog.json');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000/';
const chrome = process.env.CHROMIUM_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const samples = [
  ['four-game-target-core', 'CAT'], ['four-game-extra-core', 'AIDES'],
  ['four-game-target-level1', 'ABANDON'], ['four-game-extra-level1', 'ABET'],
  ['four-game-target-level2', 'ABACUS'], ['four-game-extra-level2', 'ABACI'],
  ['four-game-target-level3', 'ABALONE'], ['four-game-extra-level3', 'AAHED']
];
for (const [id, word] of samples) {
  assert(L.compile(data, L.tieredRecipes(data).find(r => r.id === id)).words.includes(word));
}
async function findWord(page, word) {
  await page.$eval('#bankFind', (el, word) => {
    el.value = word;
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }, word);
  await page.waitForFunction(word => {
    const heading = document.querySelector('#bankCard .g-top b');
    const definition = document.querySelector('#bankDef');
    return heading?.textContent === word && definition && !definition.textContent.includes('正在加载');
  }, {}, L.normalize(word));
}
async function checkDefinition(page, word, root = '#bankDef') {
  const actual = await page.evaluate(({word, root}) => {
    const row = JSON.parse(document.querySelector('#defaultGlossary').textContent).entries[word.toLowerCase()];
    const el = document.querySelector(root);
    return {
      row, ipa: el.querySelector('.g-ipa')?.textContent,
      zh: el.querySelector('.g-zh')?.textContent,
      en: el.querySelector('.g-en')?.textContent,
      labels: [...el.querySelectorAll('dt')].map(e => e.textContent), text: el.textContent
    };
  }, {word, root});
  assert(actual.row, word + ' is embedded');
  assert(actual.row[1] && actual.row[2], word + ' has both definitions');
  assert.equal(actual.zh, actual.row[1], word + ': Chinese definition');
  assert.equal(actual.en, actual.row[2], word + ': English definition');
  if (actual.row[0]) assert.equal(actual.ipa, actual.row[0], word + ': IPA');
  if (actual.row[3]?.ipaStatus === 'derived') assert(actual.labels.some(label => label.includes('推导')), word + ': derived IPA label');
  if (actual.row[3]?.ipaStatus === 'unverified') assert(actual.labels.some(label => label.includes('待核实')), word + ': unverified IPA label');
  assert.equal(await page.$eval(root, el => !!el.querySelector('.g-review-pending')), actual.row[3]?.reviewStatus === 'pending', word + ': unresolved review marker');
  assert(!/释义需本地服务|释义需要在线打开|释义未加载/.test(actual.text), word + ': lookup available');
}
(async () => {
  const browser = await puppeteer.launch({executablePath: chrome, headless: true, args: ['--no-sandbox']});
  const errors = [];
  try {
    const urls = [base, ...['index.html', 'wordpages-level-desk.html'].map(file => pathToFileURL(path.resolve(__dirname, '..', file)).href)];
    for (const [index, url] of urls.entries()) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      const requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({width: 1440, height: 1000});
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (/\/dict\/[^/]+\.json(?:\?|$)/.test(request.url())) {
          requests.push(request.url());
          request.abort();
        } else request.continue();
      });
      await page.goto(url, {waitUntil: 'load'});
      await page.evaluate(() => __desk.ready());
      await page.click('#btnBank');
      // Restrict the query before changing scope so the complete catalog's
      // unrelated words cannot trigger legacy shard loads in this assertion.
      await findWord(page, 'CAT');
      await page.select('#bankScope', 'catalog');
      requests.length = 0;
      for (const [, word] of samples) {
        await findWord(page, word);
        await checkDefinition(page, word);
        await page.waitForFunction(() => {
          const text = document.querySelector('#bankList .bzh')?.textContent;
          return text && text !== '…' && text !== '释义未加载';
        });
        assert.notEqual(await page.$eval('#bankList .bzh', e => e.textContent), '暂无释义', word + ': list preview');
      }
      for (const word of ['CONNECTION', 'SOLUTIONS']) {
        await findWord(page, word);
        await checkDefinition(page, word);
      }
      for (const word of ['CUS', 'AHIS', 'EATS', 'MAMS', 'PECHED', 'SANG', 'SHOES', 'TAXER', 'VINES', 'WORE', 'WOUND', 'ARGAL', 'PIRAYA', 'ADOPTION', 'EDEN', 'EDITOR', 'DWELLED', 'WHITE', 'PLASMA', 'TYPO', 'AURATE']) {
        await findWord(page, word);
        await checkDefinition(page, word);
      }
      for (const word of ['ACMIC', 'ALANS', 'ANDROS', 'APOS', 'AREAE', 'ATES', 'BAALIM', 'BESES', 'COMPAS', 'DOLCI', 'DUCI', 'FARC', 'FILLES', 'GIGHE', 'INIA', 'OIG', 'PHT', 'RENATE', 'UMA']) {
        await findWord(page, word);
        await checkDefinition(page, word);
      }
      await findWord(page, 'CUS');
      assert.match(await page.$eval('#bankDef .g-zh', el => el.textContent), /因为/);
      assert.match(await page.$eval('#bankDef .g-en', el => el.textContent), /because/);
      assert(!/导尿|metallic|copper/i.test(await page.$eval('#bankDef', el => el.textContent)));
      await page.hover('#bankList .gw');
      await page.waitForFunction(() => !document.querySelector('#gloss').hidden && document.querySelector('#gloss .g-top b')?.textContent === 'CUS');
      await checkDefinition(page, 'CUS', '#gloss');
      if (index === 0) await page.screenshot({path: '/tmp/bilingual-glossary-cus.png'});
      await page.mouse.move(20, 20);
      const longWord = await page.evaluate(() => Object.entries(JSON.parse(document.querySelector('#defaultGlossary').textContent).entries)
        .find(([word, row]) => /^[a-z]{3,}$/.test(word) && row[2].length > 481)?.[0].toUpperCase());
      assert(longWord, 'a long definition is available to exercise preview truncation');
      await findWord(page, longWord);
      await checkDefinition(page, longWord);
      await page.hover('#bankList .gw');
      await page.waitForFunction(() => !document.querySelector('#gloss').hidden && document.querySelector('#gloss').textContent.includes('点击单词查看完整释义'));
      assert((await page.$eval('#gloss .g-en', e => e.textContent.length)) <= 481, 'long hover remains a short preview');
      assert((await page.$eval('#bankDef .g-en', e => e.textContent.length)) > 481, 'the full definition remains available in the card');
      await page.mouse.move(20, 20);
      // The same shared renderer labels pronunciation provenance in cards and hovers.
      const statusWords = await page.evaluate(() => {
        const rows = Object.entries(JSON.parse(document.querySelector('#defaultGlossary').textContent).entries);
        return ['derived', 'unverified'].map(status => rows.find(([word, row]) => /^[a-z]{3,}$/.test(word) && row[3]?.ipaStatus === status)?.[0]).filter(Boolean);
      });
      for (const word of [...statusWords, 'CAT']) {
        await findWord(page, word.toUpperCase());
        await checkDefinition(page, word);
        await page.hover('#bankList .gw');
        await page.waitForFunction(word => !document.querySelector('#gloss').hidden && document.querySelector('#gloss .g-top b')?.textContent === word && document.querySelector('#gloss .g-definitions'), {}, word.toUpperCase());
        await checkDefinition(page, word, '#gloss');
        await page.mouse.move(20, 20);
      }
      const pendingWord = await page.evaluate(() => Object.entries(JSON.parse(document.querySelector('#defaultGlossary').textContent).entries)
        .find(([word, row]) => /^[a-z]{3,}$/.test(word) && row[3]?.reviewStatus === 'pending' && row[1].length <= 180 && row[2].length <= 480)?.[0].toUpperCase());
      if (pendingWord) {
        await findWord(page, pendingWord);
        await checkDefinition(page, pendingWord);
        await page.hover('#bankList .gw');
        await page.waitForFunction(word => !document.querySelector('#gloss').hidden && document.querySelector('#gloss .g-top b')?.textContent === word, {}, pendingWord);
        await checkDefinition(page, pendingWord, '#gloss');
        await page.mouse.move(20, 20);
      }
      if (index === 0) await page.screenshot({path: '/tmp/bilingual-glossary-desktop.png'});
      assert.deepEqual(requests, [], url + ': covered glossary never fetches dictionary shards');
      // Source-only accented terms and unknown strings must still finish their lookup.
      await findWord(page, 'CAFE\u0301');
      assert.equal(await page.$eval('#bankCard .g-top b', e => e.textContent), 'CAFÉ');
      await findWord(page, '<svg onload=alert(1)>');
      assert.equal(await page.$('#bankCard svg'), null);
      assert.match(await page.$eval('#bankDef', e => e.textContent), /暂无释义/);
      await context.close();
      console.log(url + ': all eight library samples, long words, bilingual cards, IPA labels and hover passed');
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
