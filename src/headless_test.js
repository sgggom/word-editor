const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const pg = await b.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push('pageerror ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await pg.setViewport({ width: 1500, height: 950 });
  await pg.goto('file:///workspace/level-desk-v3/wordpages-level-desk.html?fresh=1', { waitUntil: 'load' });
  await pg.click('#btnBatch');
  await pg.evaluate(() => { document.querySelector('#bCount').value = 320; document.querySelector('#bFrom').value = 1; document.querySelector('#bMode').value = 'replace'; document.querySelector('#bSeed').value = 'test-320'; });
  await pg.screenshot({ path: '/workspace/level-desk-v3/src/shot_panel.png' });
  const t0 = Date.now();
  await pg.click('#bGo');
  await pg.waitForFunction(() => window.__lastBatch, { timeout: 600000, polling: 1000 });
  const sum = await pg.evaluate(() => window.__lastBatch);
  console.log('batch', JSON.stringify(sum), 'wall', Date.now() - t0);
  await pg.screenshot({ path: '/workspace/level-desk-v3/src/shot_done.png' });
  await pg.click('#bClose');
  const lv = await pg.evaluate(() => window.__desk.exportLevels());
  require('fs').writeFileSync('/workspace/level-desk-v3/src/exported_320.json', JSON.stringify(lv, null, 1));
  console.log('exported', lv.length);
  // browse some levels, edit one, play one
  for (const i of [0, 5, 50, 150, 319]) { await pg.evaluate(i => document.querySelectorAll('#pace button')[i].click(), i); await new Promise(r => setTimeout(r, 300)); }
  const checks = await pg.evaluate(() => document.querySelector('#checks').innerText);
  console.log(checks);
  await pg.screenshot({ path: '/workspace/level-desk-v3/src/shot_level.png' });
  await pg.click('#btnPlay'); await new Promise(r => setTimeout(r, 300));
  await pg.click('#pHint'); await new Promise(r => setTimeout(r, 300));
  await pg.screenshot({ path: '/workspace/level-desk-v3/src/shot_play.png' });
  await pg.click('#pBack');
  // hand edit: change a letter on current level
  await pg.evaluate(() => { const inp = document.querySelector('#grid input'); inp.value = 'Q'; inp.dispatchEvent(new Event('input', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 400));
  console.log('after edit:', await pg.evaluate(() => document.querySelector('#checks').innerText));
  await pg.click('#btnUndo'); await new Promise(r => setTimeout(r, 300));
  console.log('ERRORS', errs.length, errs.slice(0, 5));
  await b.close();
})();
