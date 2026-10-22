/* Builds a real, validated 10k inventory for browser/storage acceptance. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const E=require('../src/gen'),P=require('../src/level_pool'),L=require('../src/library'),profiles=require('../src/profiles.json'),data=require('../data/game_vocab/catalog.json');
const snapshot=L.snapshot(data,L.tieredRecipes(data)[0]),ix=E.buildIndex(snapshot.lex),seed='inventory-scale-2026';
const specs=[{width:3,height:3,targetCount:3,quantity:4000},{width:4,height:2,targetCount:5,quantity:1000},{width:4,height:3,targetCount:9,quantity:4000},{width:5,height:3,targetCount:10,quantity:1000}];
const entries=[],seen=new Set();let attempts=0;const start=performance.now();
for(const spec of specs){
 let ordinal=0,made=0;
 while(made<spec.quantity&&ordinal<spec.quantity*300){
  const batch=E.generatePoolAttempts(spec,ix,profiles,{seed},ordinal,128);
  for(const result of batch){
   ordinal++;attempts++;
   if(!result)continue;
   const entry=P.record(P.gameOf(result.level),snapshot,{seed,ordinal:result.ordinal,maxUse:13},ix);
   if(seen.has(entry.id))continue;seen.add(entry.id);entries.push(entry);made++;
   if(entries.length%1000===0)console.log(JSON.stringify({validated:entries.length,attempts,seconds:((performance.now()-start)/1000).toFixed(1)}));
   if(made===spec.quantity)break;
  }
 }
 assert.equal(made,spec.quantity,JSON.stringify(spec));
}
assert.equal(entries.length,10000);
const file=P.exportFile({id:'scale-validated-10000',name:'万关验收库'},entries,{[snapshot.id]:snapshot});
const output=process.env.POOL_SCALE_FILE||path.join(os.tmpdir(),'wordpages-inventory-10000.json');fs.writeFileSync(output,JSON.stringify(file));
console.log(JSON.stringify({file:output,records:entries.length,bytes:fs.statSync(output).size,attempts,seconds:((performance.now()-start)/1000).toFixed(1)}));
