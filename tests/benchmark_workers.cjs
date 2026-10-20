/* Optional desktop benchmark; timings are measurements, never a CI pass threshold. */
const puppeteer=require('puppeteer-core'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage();await page.goto(process.env.BASE_URL||'http://127.0.0.1:8000/',{waitUntil:'networkidle0'});await page.evaluate(()=>__desk.ready());
  const output=[];
  for(const scope of ['core','all']){
   const samples={1:[],4:[]};let signature;
   for(let rep=0;rep<3;rep++)for(const workers of [1,4]){
    const result=await page.evaluate(async({scope,workers})=>{
     const data=JSON.parse(gameVocab.textContent),recipes=WPLibrary.tieredRecipes(data),lex=scope==='core'?WPLibrary.compile(data,recipes[0]).lex:WPLibrary.combine(data,{target:recipes.filter(r=>r.targetPool.sources.length),extra:recipes.filter(r=>r.extraPool.sources.length)}).lex;
     const config={...WTEngine.DEFAULTS,preset:'list0',seed:'parallel-benchmark',attempts:120},history={usage:{},recent:new Map()},start=51,count=40,levels=[];let failed=0;
     const t=performance.now(),pool=WPBatchGenerator.create({lex,profiles:WT_PROFILES,config,workers,workerSource:JSON.parse(batchWorker.textContent)});
     try{for(let n=start;n<start+count;n++){const r=await pool.generateOne(n,history);if(r.ok){levels.push(r.level);for(const w of r.level.targets){history.usage[w]=(history.usage[w]||0)+1;history.recent.set(w,n)}}else failed++}
      return{ms:performance.now()-t,generated:levels.length,failed,status:pool.status(),signature:JSON.stringify(levels.map(l=>[l.number,l.grid,l.targets,l.extras,l.counts]))};
     }finally{pool.close()}
    },{scope,workers});
    assert.equal(result.status.mode,'workers');assert.equal(result.generated,40);assert.equal(result.failed,0);if(signature)assert.equal(result.signature,signature);else signature=result.signature;samples[workers].push(Math.round(result.ms));
   }
   const median=a=>[...a].sort((a,b)=>a-b)[1],single=median(samples[1]),parallel=median(samples[4]);
   const row={scope,levels:40,attempts:120,from:51,samplesMs:samples,singleMs:single,fourWorkersMs:parallel,speedup:+(single/parallel).toFixed(2)};output.push(row);console.log(JSON.stringify(row));
  }
  fs.writeFileSync('/tmp/word-worker-benchmark.json',JSON.stringify({browser:await browser.version(),reportedLogicalCpus:await page.evaluate(()=>navigator.hardwareConcurrency),results:output},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
