/* Word length preferences, optional five-letter words and final-position rules. */
const assert=require('node:assert/strict'),W=require('../src/lengths'),E=require('../src/gen'),P=require('../src/level_pool'),L=require('../src/library'),A=require('../src/arrangement');
const data=require('../data/game_vocab/catalog.json'),snapshot=L.production(data,[L.tieredRecipes(data)[0]]).snapshot,ix=E.buildIndex(snapshot.lex);
let s=W.statistics(['CAT','TREE']);assert.equal(s.longMinLength,4);assert.equal(s.mediumCount,0);assert.equal(s.longCount,1);
s=W.statistics(['CAT','TREE','APPLE','LONGER']);assert.equal(s.longMinLength,5);assert.equal(s.mediumCount,1);assert.equal(s.longCount,2);assert.equal(s.lengthCounts[5],1);
assert.deepEqual(W.errors(['CAT','TREE'],3,3),[]);assert.deepEqual(W.errors(['CAT','TREE','APPLE'],3,3),[]);
assert(W.errors(['CAT','TREE','LONGER'],3,3).length);assert(W.errors(['CAT','TREE','LONGER'],4,3).length,'six letters do not substitute for the required five');
assert.deepEqual(W.errors(['CAT','TREE','APPLE','LONGER'],4,3),[]);
assert.deepEqual(W.errors(['CAT','DOG','SUN'],3,3,'opening'),[]);assert(W.errors(['CAT','DOG','TREE'],3,3,'opening').length);
assert(W.errors(['CAT','DOG','SUN'],4,2,'opening').length);assert.throws(()=>W.ratios([60,30,30],'3x3'),/100/);
assert.throws(()=>W.production({width:4,height:2,wordLengths:{mode:'opening'}}),/3×3/);
const allRecords=[],opening=[];let checked=0,smallWithoutFive=0,smallWithFive=0;
for(const [width,height,mode] of [[3,3,'opening'],[4,2,'standard'],[3,3,'standard'],[4,3,'standard'],[5,3,'standard']]){
 const spec={width,height,initialLetters:'ABC',wordLengths:{mode}},cfg={seed:'length-QA'},results=E.generatePoolAttempts(spec,ix,null,cfg,0,160),valid=results.filter(Boolean);
 assert(valid.length,JSON.stringify(spec));assert.deepEqual(E.generatePoolAttempts(spec,ix,null,cfg,19,13),results.slice(19,32));
 const only=E.buildIndex(snapshot.lex.filter(x=>x.role==='candidate'));
 const stripped=result=>{if(!result)return result;const c=structuredClone(result);delete c.level.extras;delete c.level.metrics.extraCount;return c;};
 assert.deepEqual(E.generatePoolAttempts(spec,only,null,cfg,19,13).map(stripped),results.slice(19,32).map(stripped));
 for(const result of valid){
  const lv=result.level;assert.equal(lv.construction.strategy,E.LENGTH_SEARCH_VERSION);assert.equal(lv.number,undefined);assert.deepEqual(W.errors(lv.targets,width,height,mode),[]);
  const allowed=E.scanTargets(lv.grid,width,height,ix,32).filter(x=>x.safe&&x.length>=3&&x.length<=lv.construction.wordLengths.maxLength).map(x=>x.word).sort();
  assert.deepEqual(lv.targets,allowed,'retain every playable word in the allowed lengths, never trim to hit a ratio');
  assert(lv.construction.placements.filter(p=>p.phase==='initials').every(p=>'ABC'.includes(p.word[0])&&E.turns(p.path,width)===0));
  assert(E.validate(lv,ix,E.DEFAULTS).ok);
  const entry=P.record(P.gameOf(lv),snapshot,{seed:cfg.seed,ordinal:result.ordinal,...lv.construction},ix);assert.deepEqual(P.importRecord(entry,{[snapshot.id]:snapshot}),entry);
  if(mode==='opening')opening.push(entry);else if(width===3){if(entry.metrics.lengthCounts[5])smallWithFive++;else smallWithoutFive++;}
  allRecords.push(entry);checked++;
 }
}
assert(smallWithoutFive&&smallWithFive,'3×3 accepts both 3/4 and 3/4/5');
const zeroFive=E.generatePoolAttempts({width:3,height:3,initialLetters:'',wordLengths:{mode:'standard',ratios:[70,30,0]}},ix,null,{seed:'length-zero-five'},0,512).filter(Boolean);
assert(zeroFive.some(r=>r.level.targets.some(w=>w.length===5)),'zero planting preference must still keep scanned five-letter targets');
const old=structuredClone(allRecords[0]);delete old.metrics.lengthCounts;old.metrics.longCount=9999;
const file=P.exportFile({id:'lengths',name:'词长验收'},[old],{[snapshot.id]:snapshot});assert.deepEqual(file.entries[0].metrics,W.enrich(allRecords[0]).metrics);
assert.deepEqual(P.importRecord(file.entries[0],file.librarySnapshots).metrics,allRecords[0].metrics);
const first=opening[0],second=opening.find(e=>e.playKey!==first.playKey&&e.metrics.targetCount===first.metrics.targetCount),small=allRecords.find(e=>e.generation.mode!=='opening'&&e.metrics.width===3&&e.metrics.lengthCounts[4]),large=allRecords.find(e=>e.metrics.width===4&&e.metrics.height===3);assert(second&&small&&large);
const records=[first,second,small,large].map(e=>P.summary({...e,poolId:'lengths'}));
const plan={kind:'wordpages-arrangement',schemaVersion:1,name:'词长关序',seed:'qa',budget:10000,targetLengths:true,targetLengthVersion:W.VERSION,requiredLetters:{id:'neutral',levels:{}},overrides:{},segments:records.map((e,i)=>({id:'s'+i,from:i+1,to:i+1,width:e.width,height:e.height,targetCount:e.targetCount,poolIds:['lengths'],rules:{maxTurns:null,repeatGap:0}}))};
const result=A.solve(plan,records);assert.equal(result.status,'complete');assert(result.audit.lengthCounts[5]>0);
const slots=A.expand(plan);assert.equal(slots[0].lengthRule,'opening');assert.equal(slots[2].lengthRule,'standard');
assert(!A.staticMatch(slots[0],{...records[0],targets:['CAT','TREE','SUN']}));assert(!A.staticMatch(slots[3],{...records[3],targets:['CAT','TREE','LONGER']}));
assert(A.verify(slots,[{...records[0],targets:['CAT','TREE','SUN']},...records.slice(1)]).errors.some(e=>e.type==='static'));
const legacy=structuredClone(plan);delete legacy.targetLengths;delete legacy.targetLengthVersion;assert(!A.expand(legacy)[0].lengthRule);
assert.throws(()=>A.expand({...plan,overrides:{1:{width:4,height:2}}}),/前 2/);
assert.throws(()=>A.expand({...plan,targetLengthVersion:'unknown'}),/版本/);
console.log(`word lengths: ${checked} valid candidates; optional five-letter words, four-letter fallback, opening/big-board rules, seeded ranges, full extra calibration, metrics upgrade, imports, formal positions and audit passed`);
