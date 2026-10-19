const assert = require('node:assert/strict');
const fs = require('node:fs');
const L = require('../src/library');
const E = require('../src/gen');
const data = require('../data/game_vocab/catalog.json');
const recipe = L.defaultRecipe(data);
const compiled = L.compile(data, recipe);
assert.equal(data.games.length, 7);
assert.equal(data.games.reduce((n,g)=>n+g.configs.length,0), 25);
assert.equal(L.catalogIndex(data).size, 32268);
assert.deepEqual(compiled.stats, {target:10758,extra:16286,overlap:4564,total:22480,candidates:10748,extras:11720,excluded:12,downgraded:0});
const defaultGames=['07_Word_Tiles','06_Zen_Word','05_Words_of_Wonders','04_Wordscapes'];
for(const key of ['targetPool','extraPool']) {
  assert.deepEqual(recipe[key].sources.map(s=>s.gameId),defaultGames);
  assert(recipe[key].sources.every(s=>s.configId==='*'));
}
const fourIntersection=structuredClone(recipe);
fourIntersection.targetPool.operation='intersection';fourIntersection.extraPool.operation='intersection';
assert.deepEqual(L.compile(data,fourIntersection).stats,{target:1627,extra:617,overlap:38,total:2206,candidates:1627,extras:579,excluded:0,downgraded:0});
// Explicit, disjoint chart regions are the actual pool recipe, not a display filter.
const partition=L.partitionPool(data,recipe.targetPool), selected=structuredClone(recipe);
selected.targetPool=L.withRegionSelection(selected.targetPool,['15','8']);
const selectedWords=[...partition.regions.get('15'),...partition.regions.get('8')].sort();
assert.deepEqual(L.compile(data,selected).targetWords,selectedWords);
assert.equal(L.compile(data,selected).stats.candidates,4372);
const selectedSnapshot=L.snapshot(data,selected);L.validateSnapshot(JSON.parse(JSON.stringify(selectedSnapshot)));
assert.deepEqual(selectedSnapshot.recipe.targetPool.selectedRegions,['8','15']);
const zero=structuredClone(selected);zero.targetPool=L.withRegionSelection(zero.targetPool,[]);
assert.equal(L.compile(data,zero).stats.candidates,0);
assert.equal(L.compile(data,zero).stats.target,0);
const repeated=structuredClone(selected);repeated.targetPool.sources.push(repeated.targetPool.sources[0]);
assert.deepEqual(L.compile(data,repeated).targetWords,selectedWords);
for (const mutate of [
  x=>x.targetPool.selectedRegions=['0'], x=>x.targetPool.selectedRegions=['16'],
  x=>x.targetPool.selectedRegions=['1','1'], x=>x.targetPool.selectedRegions=['01'],
  x=>x.targetPool.regionSources.reverse(), x=>x.targetPool.sources[0].configId='list0'
]) { const bad=structuredClone(selected);mutate(bad);assert.throws(()=>L.compile(data,bad)); }
// Cached partitions must not retain mutable recipe-source references.
const changing=structuredClone(recipe);const cached=L.partitionPool(data,changing.targetPool);
changing.targetPool.sources[0].configId='list0';assert.equal(cached.entries[0].source.configId,'*');
assert.deepEqual(compiled.lex, require('../src/lex.json'));
const wt = data.games.find(g=>g.id==='07_Word_Tiles');
const a = new Set(wt.configs[0].words.target), b = new Set(wt.configs[1].words.target);
const sources = wt.configs.map(c=>({gameId:wt.id,configId:c.id,roles:['target']}));
const expectedIntersection = [...a].filter(w=>b.has(w)).sort();
assert.deepEqual([...L.evaluatePool(data,{operation:'intersection',sources})].sort(), expectedIntersection);
assert.deepEqual([...L.evaluatePool(data,{operation:'union',sources})].sort(), [...new Set([...a,...b])].sort());
assert.deepEqual([...L.evaluatePool(data,{operation:'intersection',sources:[...sources,sources[0]]})].sort(), expectedIntersection);
assert.equal(L.evaluatePool(data,{operation:'intersection',sources:[]}).size,0);
const synthetic = {datasetHash:'fixture',games:[{id:'a',configs:[{id:'one',words:{target:['cat','ACTS','CAFÉ','CAFE\u0301','TO','LONGERWORD','CAT DOG'],extra:['CAT','TO','ELK'],onlyExtra:['OX'],bonus:['EMU']}}]},{id:'b',configs:[{id:'one',words:{target:['DOG'],extra:[],onlyExtra:[],bonus:[]}}]}]};
const src = {gameId:'a',configId:'*',roles:['target']};
const r = {id:'test',name:'test',revision:1,datasetHash:'fixture',targetPool:{operation:'union',sources:[src]},extraPool:{operation:'union',sources:[{...src,roles:['extra','onlyExtra','bonus']}]}};
const c = L.compile(synthetic,r);
assert.deepEqual(c.lex, [{word:'ACTS',role:'candidate'},{word:'CAT',role:'candidate'},{word:'ELK',role:'extra'},{word:'EMU',role:'extra'},{word:'OX',role:'extra'},{word:'TO',role:'extra'}]);
assert.equal(c.words.filter(w=>w==='CAFÉ').length,1);
assert(c.excluded.includes('CAFÉ') && c.excluded.includes('CAT DOG'));
assert.equal(L.compile(synthetic,r,{abbr:['cat']}).lex.find(x=>x.word==='CAT').role,'extra');
const empty = structuredClone(r); empty.targetPool={operation:'intersection',sources:[src,{...src,gameId:'b'}]};
assert.equal(L.compile(synthetic,empty).stats.candidates,0);
for(const role of L.ROLES) assert.equal(L.sourceWords(synthetic,{...src,roles:[role]}).size,new Set(synthetic.games[0].configs[0].words[role].map(L.normalize)).size);
for(const mutation of [x=>x.datasetHash='wrong',x=>x.targetPool.sources[0].gameId='missing',x=>x.targetPool.sources[0].roles=[],x=>x.targetPool.operation='subtract']) {
 const x=structuredClone(r);mutation(x);assert.throws(()=>L.compile(synthetic,x));
}
const snap=L.snapshot(data,recipe,{abbr:['CAT']}); L.validateSnapshot(JSON.parse(JSON.stringify(snap)));
const damaged=structuredClone(snap);damaged.lex.pop();assert.throws(()=>L.validateSnapshot(damaged));
const swapped=structuredClone(snap);swapped.lex.push({word:'CAFÉ',role:'candidate'});assert.throws(()=>L.validateSnapshot(swapped));
assert.equal(E.buildIndex([{word:'CAT',role:'candidate',lemma:'ignored',grade:'old'}]).acceptable.length,1);
console.log('library sets: dataset totals, default, union/intersection, duplicate sources, roles, Unicode, eligibility, bans, empty results and snapshot integrity passed');
