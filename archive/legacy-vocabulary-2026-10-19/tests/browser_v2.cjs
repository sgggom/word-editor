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
    await page.goto(base + '?fresh=1', {waitUntil:'networkidle0'});
    await page.evaluate(() => window.__desk.ready());
    const counts = await page.evaluate(() => {
      const lex = JSON.parse(document.querySelector('#lex').textContent);
      return lex.reduce((n,x) => {n[x.role] = (n[x.role] || 0) + 1; return n;}, {});
    });
    assert.deepEqual(counts, {candidate:4600, extra:2595, pending:2260});
    // The bank must expose pending entries while keeping them out of generation.
    await page.click('#btnBank');
    assert.match(await page.$eval('#bankMeta', e=>e.textContent), /9455/);
    assert.match(await page.$eval('#bankFilters', e=>e.textContent), /待审核2260/);
    for (const [word, role] of [['DOS','仅额外'],['GOOS','待审核'],['HOTS','待审核']]) {
      await page.$eval('#bankFind',(e,w)=>{e.value=w;e.dispatchEvent(new Event('input',{bubbles:true}));},word);
      await page.waitForFunction(([word,role])=>document.querySelector('#bankCard').textContent.includes(word)&&document.querySelector('#bankCard').textContent.includes('角色：'+role),{},[word,role]);
    }
    const findWord = async word => {
      await page.$eval('#bankFind',(e,w)=>{e.value=w;e.dispatchEvent(new Event('input',{bubbles:true}));},word);
      if (word) await page.waitForFunction(w=>document.querySelector('#bankCard .g-top b')?.textContent===w,{},word);
      else await page.waitForFunction(()=>document.querySelector('#bankCard').hidden);
    };
    await findWord('');
    await page.waitForFunction(()=>document.querySelector('#bankMeta').textContent.startsWith('9455 /'));
    assert.match(await page.$eval('#bankFilters',e=>e.textContent),/稳定必答4002/);
    assert.match(await page.$eval('#bankFilters',e=>e.textContent),/条件必答50/);
    await page.click('.bchip[data-g="tier"][data-v="1"]');
    assert.match(await page.$eval('#bankMeta',e=>e.textContent),/^50 \/ 9455/);
    const conditionals = await page.$$eval('#bankList .brow',es=>es.map(e=>e.dataset.w));
    assert.equal(conditionals.length,50);
    assert(conditionals.every(w=>w.length===3&&conditionals.includes([...w].reverse().join(''))));
    await page.click('.bchip[data-g="tier"][data-v=""]');
    await page.click('.bchip[data-g="confidence"][data-v="high"]');
    assert.match(await page.$eval('#bankMeta',e=>e.textContent),/^1855 \/ 9455/);
    await page.click('.bchip[data-g="confidence"][data-v=""]');
    await page.click('.bchip[data-g="audit"][data-v="reviewed"]');
    assert.match(await page.$eval('#bankMeta',e=>e.textContent),/^127 \/ 9455/);
    await findWord('ACTOR');
    const actorCard=await page.$eval('#bankCard',e=>e.textContent);
    assert.match(actorCard,/当前生成角色：待审核/);
    assert.match(actorCard,/审核建议：必答候选/);
    assert.match(actorCard,/WT 必答与 Zen 仅额外/);
    await findWord('CAFE');
    assert.equal(await page.$eval('.audit-sources a',e=>e.href),'https://www.oxfordlearnersdictionaries.com/definition/english/cafe');
    await page.click('.bchip[data-g="audit"][data-v=""]');
    await findWord('PAT');
    const patCard=await page.$eval('#bankCard',e=>e.textContent);
    assert.match(patCard,/三字母倒读词对：PAT \/ TAP/);
    assert.match(patCard,/额外的 16 次/);
    await page.screenshot({path:'/tmp/word-selection-audit-bank.png'});
    // Inspect the exported payload without writing into the user's Downloads.
    await page.evaluate(()=>{
      window.__auditOriginalUrl=URL.createObjectURL;
      window.__auditOriginalClick=HTMLAnchorElement.prototype.click;
      URL.createObjectURL=function(blob){blob.text().then(t=>window.__auditCsv=t);return __auditOriginalUrl.call(URL,blob);};
      HTMLAnchorElement.prototype.click=function(){if(!this.download)__auditOriginalClick.call(this);};
    });
    await page.click('#bankCsv');
    await page.waitForFunction(()=>typeof window.__auditCsv==='string');
    const auditCsv=E.parseCSV(await page.evaluate(()=>__auditCsv));
    assert.equal(auditCsv.length,1);assert.equal(auditCsv[0].word,'PAT');
    assert.equal(auditCsv[0].audit_category,'conditional_target');
    assert.equal(auditCsv[0].reverse_pair,'TAP');assert.equal(auditCsv[0].wt_extras,'16');
    assert.equal(auditCsv[0].role,'candidate');assert.equal(auditCsv[0].recommended_role,'candidate');
    await page.evaluate(()=>{URL.createObjectURL=__auditOriginalUrl;HTMLAnchorElement.prototype.click=__auditOriginalClick;});
    await findWord('');
    console.log('word audit: categories, confidence, reviews, source links, role separation and CSV passed');
    await page.click('#bankClose');
    let firstLevels;
    for (const preset of ['list0','list5']) {
      await page.click('#btnBatch');
      await page.evaluate(preset => {
        bFrom.value=1; bCount.value=10; bMode.value='replace'; bPreset.value=preset;
        bAttempts.value=60; bExtraWeight.value=.9; bSeed.value='QA-v2-2026';
      }, preset);
      await page.click('#bGo');
      await page.waitForFunction(()=>window.__lastBatch, {timeout:120000});
      const summary = await page.evaluate(()=>__lastBatch);
      assert.equal(summary.engine,'v2'); assert.equal(summary.preset,preset);
      assert.equal(summary.made,10); assert.equal(summary.failed,0);
      await page.click('#bClose');
      const levels = await page.evaluate(()=>__desk.exportLevels());
      assert.equal(levels.length,10);
      const expected = E.generateRange(E.buildIndex(lex), profiles, {preset,seed:'QA-v2-2026',count:10,start:1,attempts:60,extraWeight:.9}).levels.map(toGame);
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
        await page.click('#btnLevelView');
        const before=await page.evaluate(()=>__desk.exportLevels());
        await page.$eval('#grid input',e=>{e.value='Q';e.dispatchEvent(new Event('input',{bubbles:true}));});
        await page.click('#btnUndo');
        assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),before);
        await page.click('#btnLevelView');
      }
      // Game export and reimport through the existing import dialog must be lossless.
      const packText=await page.evaluate(()=>__desk.packText());
      const pack=JSON.parse(packText);assert(Array.isArray(pack.books)&&Array.isArray(pack.daily));
      fs.writeFileSync('/tmp/browser-v2-'+preset+'-pack.json',packText);
      const before=await page.evaluate(()=>__desk.exportLevels());
      await page.click('#btnImport');
      await page.$eval('#modal textarea',(e,text)=>e.value=text,packText);
      await page.evaluate(()=>[...document.querySelectorAll('#modal button')].find(e=>e.textContent==='读取').click());
      await page.waitForFunction(()=>[...document.querySelectorAll('#modal button')].some(e=>e.textContent==='导入'));
      await page.evaluate(()=>[...document.querySelectorAll('#modal button')].find(e=>e.textContent==='导入').click());
      await page.waitForSelector('#modal',{hidden:true});
      assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),before);
      await page.evaluate(()=>__desk.flush());
      await page.goto(base,{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());
      assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),before);
      console.log(preset+': exact engine parity, generation, export/import, persistence passed');
    }
    // Impossible constraints must report failure and leave the existing sequence intact.
    const saved=await page.evaluate(()=>__desk.exportLevels());
    await page.click('#btnBatch');await page.evaluate(()=>{bFrom.value=1001;bCount.value=1;bMaxN.value=1;bMode.value='replace';bAttempts.value=10;});
    await page.click('#bGo');await page.waitForFunction(()=>__lastBatch,{timeout:120000});
    assert.equal(await page.evaluate(()=>__lastBatch.failed),1);
    assert.deepEqual(await page.evaluate(()=>__desk.exportLevels()),saved);
    await page.click('#bClose');
    // Historical rarity/type metadata and book/daily placement survive a round trip.
    const historical = saved.slice(0,2).map((l,i)=>({...l,id:String(i+1),name:'保留旧关 '+(i+1),lv:'2'.repeat(l.t.split(' ').length),ty:'1'.repeat(l.t.split(' ').length)}));
    const historicalPack={books:[{name:'已有分册',sub:'原副题',mix:[0,100,0,0,0],levels:[historical[0]]}],daily:[historical[1]]};
    await page.click('#btnImport');
    await page.$eval('#modal textarea',(e,t)=>e.value=t,JSON.stringify(historicalPack));
    await page.evaluate(()=>[...document.querySelectorAll('#modal button')].find(e=>e.textContent==='读取').click());
    await page.evaluate(()=>[...document.querySelectorAll('#modal button')].find(e=>e.textContent==='导入').click());
    await page.waitForSelector('#modal',{hidden:true});
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
    assert.equal(await local.evaluate(()=>JSON.parse(document.querySelector('#lex').textContent).length),9455);
    await local.close();
    assert.deepEqual(errors,[]);
    console.log('3 levels completed; edit/undo, failure preservation, standalone HTML, no page errors passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
