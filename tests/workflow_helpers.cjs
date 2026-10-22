/* Vocabulary regressions use neutral arrangement fixtures: this keeps source
   permission tests independent of curriculum/letter rules tested elsewhere. */
const assert=require('node:assert/strict');
async function produce(page,count=3,seed='source-QA'){
 const setup=await page.evaluate(async({count,seed})=>{
  window.__testPoolCounter=(window.__testPoolCounter||0)+1;
  const pool=await __desk.workflow.store.createPool('测试关卡库 '+__testPoolCounter);await __desk.workflow.refresh(pool.id);
  const row=document.querySelector('#productionTable tbody tr');row.querySelector('[data-production="size"]').value='3x3';row.querySelector('[data-production="targetCount"]').value=3;row.querySelector('[data-production="quantity"]').value=count;
  document.querySelector('#bSeed').value=seed+'-'+__testPoolCounter;document.querySelector('#bBudget').value=count*300;
  row.querySelector('[data-production="quantity"]').dispatchEvent(new Event('input',{bubbles:true}));return {poolId:pool.id};
 },{count,seed});
 if(await page.$eval('#batch',e=>e.hidden))await page.click('#btnBatch');
 await page.waitForSelector('#batch',{visible:true});await page.waitForFunction(()=>!document.querySelector('#bGo').disabled);
 await page.click('#bGo');await page.waitForFunction(()=>window.__lastBatch,{timeout:120000});await page.waitForFunction(()=>!document.querySelector('#bClose').disabled&&document.querySelector('#bStop').disabled);
 const result=await page.evaluate(()=>__lastBatch);assert.equal(result.made,count,JSON.stringify(result));
 return {result,poolId:setup.poolId};
}
async function produceAndApply(page,count=3,seed='source-QA',mode='replace'){
 const {result,poolId}=await produce(page,count,seed);
 if(!await page.$eval('#batch',e=>e.hidden))await page.click('#bClose');
 await page.evaluate(async({poolId,count,mode})=>{
  const old=__desk.campaign().arrangement?.plan,prefix=mode==='after'&&old?__desk.campaign().levels.length:0;
  const plan={kind:'wordpages-arrangement',schemaVersion:1,name:'词库验收关序',seed:'source-test',budget:1000000,requiredLetters:{id:'source-test-neutral',levels:Object.fromEntries(Array.from({length:1000},(_,i)=>[i+1,'']))},overrides:{},
   segments:[...(prefix?old.segments:[]),{id:'segment-'+poolId,from:prefix+1,to:prefix+count,width:3,height:3,targetCount:3,poolIds:[poolId],rules:{maxTurns:null,repeatGap:0}}]};
  await __desk.workflow.setPlan(plan);await __desk.workflow.run();
  if(__desk.workflow.preview()?.result.status!=='complete')throw new Error(JSON.stringify(__desk.workflow.preview()?.result));
  await __desk.workflow.apply();await __desk.flush();
 },{poolId,count,mode});
 return {result,poolId,levels:await page.evaluate(()=>__desk.exportLevels())};
}
module.exports={produce,produceAndApply};
