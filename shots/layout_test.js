const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  for (const N of [500, 1000]) for (const W of [1280, 1600]) {
    const pg = await b.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.setViewport({ width: W, height: 900 });
    await pg.goto('file:///workspace/level-desk-v4/wordpages-level-desk.html?fresh=1');
    await pg.click('#btnBatch');
    await pg.evaluate(N => { bCount.value = N; bMode.value = 'replace'; bSeed.value = 's' + N; }, N);
    await pg.click('#bGo');
    await pg.waitForFunction(() => window.__lastBatch, { timeout: 900000, polling: 1000 });
    await pg.click('#bClose');
    await pg.evaluate(() => { jumpLv.value = 250; jumpLv.dispatchEvent(new Event('change')); });
    await new Promise(r => setTimeout(r, 500));
    const m = await pg.evaluate(() => {
      const de = document.documentElement, vis = [...document.querySelectorAll('.top-actions button')].map(x => { const r = x.getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0 && r.width > 0; });
      const on = document.querySelector('#pace button.on').getBoundingClientRect(), pc = pace.getBoundingClientRect();
      return { sw: de.scrollWidth, cw: de.clientWidth, bsw: document.body.scrollWidth, btns: vis.every(Boolean), made: __lastBatch.made, curInView: on.left >= pc.left && on.right <= pc.right, paceScroll: pace.scrollWidth > pace.clientWidth };
    });
    console.log(N, W, JSON.stringify(m), 'errors', errs.length, errs.slice(0, 3));
    await pg.screenshot({ path: `/workspace/level-desk-v4/shots/shot_${N}_${W}.png` });
    await pg.close();
  }
  await b.close();
})();
