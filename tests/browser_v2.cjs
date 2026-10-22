/* Requires puppeteer-core on NODE_PATH and Chromium. Start a static server first.
   BASE_URL defaults to the local validation server. Outputs go to /tmp. */
const puppeteer = require('puppeteer-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('../src/gen.js');
const {toGame} = require('../src/v2_adapter.js');
const lex = require('../src/lex.json'), profiles = require('../src/profiles.json');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000/';
const browserPath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';
(async () => {
  const browser = await puppeteer.launch({executablePath: browserPath, headless: true, args: ['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.setViewport({width:1440,height:1000});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    const openFile = async filename => {
      // Use the standard file input fallback, so the real Open button is exercised.
      await page.evaluate(() => { window.showOpenFilePicker = undefined; });
      const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('#btnOpen')]);
      await chooser.accept([filename]);
      await page.waitForSelector('#modal',{visible:true});
      await page.waitForFunction(()=>[...document.querySelectorAll('#modal button')].some(e=>e.textContent==='导入'));
      await page.evaluate(()=>[...document.querySelectorAll('#modal button')].find(e=>e.textContent==='导入').click());
      await page.waitForSelector('#modal',{hidden:true});
      await page.evaluate(()=>__desk.flush());
    };
    await page.goto(base + '?fresh=1', {waitUntil:'networkidle0'});
    await page.evaluate(() => window.__desk.ready());
    const counts = await page.evaluate(() => {
      const lex = JSON.parse(document.querySelector('#lex').textContent);
      return lex.reduce((n,x) => {n[x.role] = (n[x.role] || 0) + 1; return n;}, {});
    });
    assert.deepEqual(counts, {candidate:1627});
    await page.click('#btnBank');
    assert.match(await page.$eval('#bankMeta',e=>e.textContent),/1627 \/ 1627/);
    assert.match(await page.$eval('#libraryStats',e=>e.textContent),/1,627/);
    await page.select('#bankScope','catalog');
    assert.match(await page.$eval('#bankMeta',e=>e.textContent),/32268 \/ 32268/);
    await page.click('#bankClose');
    let firstLevels;
    for (const preset of ['list0','list5']) {
      const expected = E.generateRange(E.buildIndex(lex), profiles, {preset,seed:'QA-v2-2026',count:10,start:1,attempts:60,extraWeight:.9}).levels.map(toGame);
      assert.equal(expected.length,10);
      const fixture='/tmp/browser-v2-legacy-'+preset+'.json';fs.writeFileSync(fixture,JSON.stringify(expected));await openFile(fixture);
      const levels = await page.evaluate(()=>__desk.exportLevels());assert.equal(levels.length,10);
      // C.toLevel sorts targets/extras, which must preserve board, counts and word sets.
      for (let i=0;i<levels.length;i++) {
        assert.equal(levels[i].g,expected[i].g); assert.equal(levels[i].n,expected[i].n);
        assert.deepEqual(levels[i].t.split(' ').sort(),expected[i].t.split(' ').sort());
        assert.deepEqual(levels[i].e.split(' ').sort(),expected[i].e.split(' ').sort());
        assert.equal(levels[i].lv,'');
      }
      fs.writeFileSync('/tmp/browser-v2-'+preset+'.json',JSON.stringify(levels,null,2));
      if (preset==='list0') {
        firstLevels=levels;
        await page.screenshot({path:'/tmp/v2-generated-list.png'});
        // Drag through every required word in the first three levels using the UI hint.
        for (let i=0;i<3;i++) {
          await page.$eval('#srcJump',(e,n)=>{e.value=n;e.dispatchEvent(new Event('change'));},i+1);
          await page.click('#btnPlay'); await page.waitForSelector('#pHint',{visible:true});
          const rows=levels[i].g.split(','), width=rows[0].length, letters=rows.join('');
          let found=0;
          const targetCount=levels[i].t.split(' ').length;
          while (found<targetCount) {
            await page.click('#pHint');
            const word=await page.$eval('#pcur',e=>e.textContent.trim());
            const cells=await page.$$eval('#pgrid > *',es=>es.map((e,i)=>{
              const r=e.getBoundingClientRect();return {i,on:e.classList.contains('sel'),x:r.x+r.width/2,y:r.y+r.height/2};
            }));
            function path(prefix) {
              if (prefix.length===word.length) return prefix;
              for (const c of cells) {
                if (!c.on || prefix.includes(c.i) || letters[c.i]!==word[prefix.length]) continue;
                if (prefix.length) {const a=prefix.at(-1);if (Math.abs(a%width-c.i%width)+Math.abs(Math.floor(a/width)-Math.floor(c.i/width))!==1) continue;}
                const result=path([...prefix,c.i]); if(result) return result;
              }
              return null;
            }
            const solution=path([]); assert(solution,'hint must identify a traceable word');
            await page.mouse.move(cells[solution[0]].x,cells[solution[0]].y);await page.mouse.down();
            for(const j of solution.slice(1))await page.mouse.move(cells[j].x,cells[j].y,{steps:5});
            await page.mouse.up(); found++;
            await page.waitForFunction(n=>Number(document.querySelector('#pBoxProg').textContent.match(/\d+/)[0])===n,{},found);
            // Complete any in-flight letter animation before the next pointer action.
            await new Promise(r=>setTimeout(r,650));
          }
          await page.waitForSelector('#pdone',{visible:true});
          if(i===2)await page.screenshot({path:'/tmp/v2-completed-level.png'});
          await page.click('#pBack');
        }
        // A name edit preserves v2 counts; a board edit can be undone.
        await page.click('#levelList [data-level-index="2"] [data-level-action="detail"]');
        const before=await page.evaluate(()=>__desk.exportLevels());
        await page.$eval('#grid input',e=>{e.value='Q';e.dispatchEvent(new Event('input',{bubbles:true}));});
        await page.keyboard.down('Control');await page.keyboard.press('z');await page.keyboard.up('Control');
        await page.waitForFunction(letter=>document.querySelector('#grid input')?.value===letter,{},levels[2].g[0]);
        await page.evaluate(()=>__desk.flush());
        assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),before);
        await page.click('#btnBackToList');
      }
      // Game export and reopening the file through Open must be lossless.
      const packText=await page.evaluate(()=>__desk.packText());
      const pack=JSON.parse(packText);assert(Array.isArray(pack.books)&&Array.isArray(pack.daily));
      fs.writeFileSync('/tmp/browser-v2-'+preset+'-pack.json',packText);
      const before=await page.evaluate(()=>__desk.exportLevels());
      await openFile('/tmp/browser-v2-'+preset+'-pack.json');
      assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),before);
      await page.evaluate(()=>__desk.flush());
      await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());
      assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),before);
      console.log(preset+': legacy engine fixtures, export/import and persistence passed');
    }
    const saved=await page.evaluate(()=>__desk.exportLevels());
    // Historical rarity/type metadata and book/daily placement survive a round trip.
    const historical = saved.slice(0,2).map((l,i)=>({...l,id:String(i+1),name:'保留旧关 '+(i+1),lv:'2'.repeat(l.t.split(' ').length),ty:'1'.repeat(l.t.split(' ').length)}));
    const historicalPack={books:[{name:'已有分册',sub:'原副题',mix:[0,100,0,0,0],levels:[historical[0]]}],daily:[historical[1]]};
    fs.writeFileSync('/tmp/browser-v2-historical-pack.json',JSON.stringify(historicalPack));
    await openFile('/tmp/browser-v2-historical-pack.json');
    assert.deepEqual(JSON.parse(await page.evaluate(()=>__desk.packText())),historicalPack);
    console.log('historical lv/ty, book metadata, mix and daily placement preserved');
    // Check the self-contained HTML; respect managed browser restrictions on file URLs.
    const local=await browser.newPage();local.on('pageerror',e=>errors.push(e.message));
    try {
      await local.goto('file://' + require('node:path').resolve(__dirname,'../wordpages-level-desk.html')+'?fresh=1',{waitUntil:'load'});
    } catch (e) {
      if (!e.message.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) throw e;
      console.log('file:// navigation blocked by managed Chromium policy; validating standalone HTML via HTTP');
      await local.goto(new URL('wordpages-level-desk.html?fresh=1',base).href,{waitUntil:'networkidle0'});
    }
    await local.waitForFunction(()=>!!window.__desk);await local.evaluate(()=>__desk.ready());
    assert.equal(await local.evaluate(()=>JSON.parse(document.querySelector('#lex').textContent).length),1627);
    await local.close();
    assert.deepEqual(errors,[]);
    console.log('3 levels completed; edit/undo, standalone HTML, no page errors passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
