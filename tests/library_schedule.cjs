const assert = require('node:assert/strict');
const L = require('../src/library'), S = require('../src/library_schedule'), data = require('../data/game_vocab/catalog.json');
const recipes = L.tieredRecipes(data), defaults = S.defaults(recipes);
const selection = {mode:'staged',targetIds:defaults.stagedIds.target,extraIds:defaults.stagedIds.extra,unlockAt:defaults.unlockAt};
const full = S.compile(data,recipes,selection,{}, {start:1,count:700});
assert.deepEqual(full.stages.map(s=>[s.from,s.to,s.plan.stats.candidates,s.plan.stats.extras]),
  [[1,100,1627,177],[101,200,3363,1686],[201,500,6006,6277],[501,700,10748,11692]]);
for (const [n,count] of [[1,1],[100,1],[101,2],[200,2],[201,3],[500,3],[501,4],[700,4]]) {
  const stage=S.stageFor(full,n);
  assert.equal(stage.targetLibraryIds.length,count);assert.equal(stage.extraLibraryIds.length,count);
  const expected=L.combine(data,{target:recipes.filter(r=>stage.targetLibraryIds.includes(r.id)),extra:recipes.filter(r=>stage.extraLibraryIds.includes(r.id))});
  assert.deepEqual(stage.plan.snapshot,expected.snapshot);assert(stage.plan.lex.every(x=>x.word.length>=3));
}
assert.throws(()=>S.stageFor(full,701));
const middle=S.compile(data,recipes,selection,{}, {start:200,count:2});
assert.deepEqual(middle.stages.map(s=>[s.from,s.to,s.unlockFrom,s.unlockTo]),[[200,200,101,200],[201,201,201,500]]);
const late=S.compile(data,recipes,selection,{}, {start:5000,count:3});
assert.equal(late.stages.length,1);assert.equal(late.stages[0].plan.stats.candidates,10748);
const independent=structuredClone(selection);independent.unlockAt.extra['four-game-extra-level1']=301;
const separate=S.compile(data,recipes,independent,{}, {start:101,count:201});
assert.equal(S.stageFor(separate,200).plan.stats.extras,177);
assert.equal(S.stageFor(separate,201).plan.stats.extras,4768); // Core + level 2, independently selected.
assert.equal(S.stageFor(separate,301).plan.stats.extras,6277);
const fixed=S.compile(data,recipes,{...selection,mode:'fixed'}, {}, {start:99,count:405});
assert.equal(fixed.stages.length,1);assert.equal(fixed.stages[0].plan.stats.candidates,10748);
const duplicated={...selection,targetIds:[...selection.targetIds,...selection.targetIds]};
assert.deepEqual(S.compile(data,recipes,duplicated,{}, {start:1,count:700}),full);
const noExtras=S.compile(data,recipes,{...selection,extraIds:[]},{}, {start:1,count:700});
assert(noExtras.stages.every(s=>s.plan.stats.extras===0));
const empty=S.compile(data,recipes,{...selection,targetIds:[]},{}, {start:1,count:700});
assert(empty.stages.every(s=>s.plan.stats.candidates===0));
for (const from of [0,-1,1.5,100000,NaN,'101']) {
  const invalid=structuredClone(selection);invalid.unlockAt.target['four-game-target-level1']=from;
  assert.throws(()=>S.compile(data,recipes,invalid,{}, {start:1,count:2}),/解锁关号/);
}
assert.throws(()=>S.compile(data,recipes,{...selection,targetIds:['deleted']}));
assert.throws(()=>S.compile(data,recipes,selection,{}, {start:1,count:0}));
const custom={...recipes[0],id:'custom',name:'自定义',revision:9};
const customPlan=S.compile(data,[...recipes,custom],{mode:'staged',targetIds:['custom'],extraIds:[],unlockAt:{target:{custom:5}}},{abbr:['CAT']},{start:1,count:6});
assert.equal(customPlan.stages[0].plan.stats.candidates,0);assert.equal(customPlan.stages[1].plan.snapshot.recipe.selection.target[0].revision,9);
assert(customPlan.stages[1].plan.lex.some(x=>x.word==='CAT'&&x.role==='extra'));
const saved=JSON.stringify(customPlan);custom.targetPool.sources=[];assert.equal(JSON.stringify(customPlan),saved);
assert.deepEqual(S.defaults(recipes.filter(r=>r.id!=='four-game-target-level1')).stagedIds.target,selection.targetIds.filter(id=>id!=='four-game-target-level1'));
console.log('schedule: cumulative boundaries, independent pools, fixed mode, middle/late starts, duplicates, empty stages, invalid unlocks, custom recipes, bans and immutable snapshots passed');
