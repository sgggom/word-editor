/* Each attempt can run independently; ordered reduction preserves the sequential search. */
const assert=require('node:assert/strict'),E=require('../src/gen'),P=require('../src/batch_generator'),L=require('../src/library');
const data=require('../data/game_vocab/catalog.json'),profiles=require('../src/profiles.json'),tiers=L.tieredRecipes(data);
const all=L.combine(data,{target:tiers.filter(r=>r.targetPool.sources.length),extra:tiers.filter(r=>r.extraPool.sources.length)}).lex;
assert.equal(P.threadCount('auto',16),4);assert.equal(P.threadCount('auto',2),1);assert.equal(P.threadCount('8',4),4);assert.equal(P.threadCount('2',8),2);
for(const lex of [require('../src/lex.json'),all]){
 const ix=E.buildIndex(lex);
 for(const preset of ['list0','list5'])for(const n of [1,51,501]){
  const cfg={...E.DEFAULTS,preset,seed:'independent-attempts-QA',attempts:36};
  const history=E.historyFromLevels([{number:n-1,targets:['CAT','DOG','ALERT']},{number:n-3,targets:['CAT']}]);
  const before=structuredClone(history),reference=E.generateOne(n,ix,profiles,cfg,history);
  const whole=E.generateAttempts(n,ix,profiles,cfg,history,0,cfg.attempts);
  assert.deepEqual(E.generateAttempts(n,ix,profiles,cfg,history,5,7),whole.slice(5,12));
  let best=null;
  for(let i=0;i<whole.length;i++){const r=whole[i];if(r&&(!best||r.score>best.score))best=r;if(E.stopAfterAttempt(best,r,i,cfg.attempts))break}
  assert.deepEqual(E.finishGeneration(n,profiles,cfg,best),reference);assert.deepEqual(history,before);
  if(reference.ok)assert.equal(E.validate(reference.level,ix,cfg).ok,true);
 }
}
const cfg={...E.DEFAULTS,attempts:8,maxUse:1},ix=E.buildIndex([{word:'CAT',role:'candidate'}]);
assert(E.generateAttempts(501,ix,profiles,cfg,{},0,8).every(x=>x===null));assert.equal(E.generateOne(501,ix,profiles,cfg).ok,false);
console.log('generation attempts: independent ranges, history immutability, deterministic reduction, safety validation, failure budgets and thread limits passed');
