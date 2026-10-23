/* Extra dictionaries annotate completed boards; they never steer generation. */
const assert=require('node:assert/strict'),E=require('../src/gen'),L=require('../src/library'),P=require('../src/level_pool');
const data=require('../data/game_vocab/catalog.json'),profiles=require('../src/profiles.json'),table=require('../data/word_table.json');
const target=L.tieredRecipes(data).find(r=>r.id==='four-game-target-core');
const production=L.production(data,[target]),targetOnly=L.combine(data,{target:[target]});
const reference=Object.entries(table.entries).filter(([,row])=>row[0]==='extra').map(([word])=>word).sort();
assert.equal(reference.length,11692);
assert.deepEqual(production.lex.filter(x=>x.role==='extra').map(x=>x.word),reference,'full automatic reference matches the current raw word table');
assert.deepEqual(production.lex.filter(x=>x.role==='candidate'),targetOnly.lex);
L.validateSnapshot(JSON.parse(JSON.stringify(production.snapshot)));
const revised=structuredClone(target);revised.revision++;revised.extraPool=L.defaultRecipe(data).extraPool;
assert.equal(L.production(data,[revised]).targetKey,production.targetKey,'extra configuration edits cannot reset the generation cursor');
assert.equal(L.production(data,[target],{abbr:['CAT']}).lex.find(x=>x.word==='CAT').role,'extra');

const a=E.buildIndex(targetOnly.lex),b=E.buildIndex(production.lex),cfg={seed:'extras-are-checks',maxUse:13};
const project=result=>{
 if(!result)return result;
 const copy=structuredClone(result);delete copy.level?.extras;if(copy.level?.metrics)delete copy.level.metrics.extraCount;return copy;
};
let successful=0,changed=0,example;
for(const spec of [{width:4,height:2,targetCount:3},{width:3,height:3,targetCount:3},{width:4,height:3,targetCount:8},{width:5,height:3,targetCount:10}]){
 const plain=E.generatePoolAttempts(spec,a,profiles,cfg,0,64),checked=E.generatePoolAttempts(spec,b,profiles,{...cfg,extraWeight:10000},0,64);
 assert.deepEqual(checked.map(project),plain.map(project),'same attempts, boards, targets, paths, counts and scores with or without extra words');
 for(let i=0;i<plain.length;i++)if(plain[i]){
  successful++;const level=checked[i].level,validation=E.validate(level,b,E.DEFAULTS);
  assert.equal(validation.ok,true);assert.deepEqual(level.extras,validation.extras);assert.equal(level.metrics.extraCount,level.extras.length);
  assert(level.extras.every(word=>!level.targets.includes(word)&&b.byWord.has(word)));
  assert(plain[i].level.extras.every(word=>level.extras.includes(word)));
  if(level.extras.length>plain[i].level.extras.length)changed++;
  const entry=P.record(P.gameOf(level),production.snapshot,{ordinal:i},b);
  assert.deepEqual(P.importRecord(entry,{[production.snapshot.id]:production.snapshot}),entry);
  example??={spec,ordinal:i,level:plain[i].level};
 }
}
assert(successful>0);assert(changed>0,'extra words are still detected and recorded');
// A reachable extra-only word is recognized without promoting it to a target.
const pair=example.level.grid.slice(0,2).join(''),ix=E.buildIndex([...targetOnly.lex,{word:pair,role:'extra'}]);
const annotated=E.generatePoolAttempts(example.spec,ix,profiles,cfg,example.ordinal,1)[0].level;
assert(annotated.extras.includes(pair));assert(!annotated.targets.includes(pair));
assert.deepEqual(annotated.grid,example.level.grid);assert.deepEqual(annotated.targets,example.level.targets);
// Legacy best-candidate search must also ignore extra count and its former weight.
for(const n of [1,51]){
 const plain=E.generateOne(n,a,profiles,{...cfg,attempts:48}),checked=E.generateOne(n,b,profiles,{...cfg,attempts:48,extraWeight:10000});
 assert.deepEqual(project(plain),project(checked));
}
console.log(`extra calibration: full ${reference.length}-word reference, ${successful} identical candidate boards, ${changed} enriched extra lists, target-only scoring, deterministic cursors, legacy search and snapshot round trips passed`);
