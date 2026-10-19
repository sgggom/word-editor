const assert = require('node:assert/strict');
const L = require('../src/library'), O = require('../src/library_overlap'), V = require('../src/proportional_venn');
const data = require('../data/game_vocab/catalog.json'), recipe = L.defaultRecipe(data);
for (const pool of ['targetPool', 'extraPool']) {
  for (const operation of ['union', 'intersection']) {
    const r = structuredClone(recipe); r[pool].operation = operation;
    const compiled = L.compile(data, r), m = O.buildModel(data, r, pool, compiled);
    assert.equal(m.union.length, pool === 'targetPool' ? 10758 : 16286);
    assert.equal(m.common.length, pool === 'targetPool' ? 1627 : 617);
    assert.deepEqual(m.result, pool === 'targetPool' ? compiled.targetWords : compiled.extraWords);
    assert.equal([...m.regions.values()].reduce((n, words) => n + words.length, 0), m.union.length);
    const independentUnion = new Set();
    for (const entry of m.entries) for (const word of entry.words) independentUnion.add(word);
    assert.deepEqual(m.union, [...independentUnion].sort());
    for (const [mask, words] of m.regions) {
      assert(words.every(word => m.entries.every((entry, i) => entry.words.has(word) === !!(BigInt(mask) & (1n << BigInt(i))))));
    }
    const chart = V.buildProportionalVenn(m.entries, {regions: new Map([...m.regions].map(([mask, words]) => [+mask, words]))}, +m.fullMask, pool);
    for (const circle of chart.geometry) assert(Math.abs(Math.PI * circle.r ** 2 / circle.size - chart.diagnostics.areaPerWord) < 1e-8);
    assert.equal(chart.diagnostics.selectedCount, m.common.length);
    assert.equal(chart.diagnostics.nonZeroRegionCount, m.regions.size);
  }
}
// Exact regions remain distinct with containment, identical sets and empty sources.
const sample = {datasetHash:'range-fixture', games:[{id:'g',name:'Example',color:'#123456',configs:[
  {id:'a',label:'a',words:{target:['CAT','DOG'],extra:[],onlyExtra:[],bonus:[]}},
  {id:'b',label:'b',words:{target:['DOG','ELK'],extra:[],onlyExtra:[],bonus:[]}},
  {id:'c',label:'c',words:{target:['DOG'],extra:[],onlyExtra:[],bonus:[]}}
]}]};
const base = {id:'fixture',name:'fixture',revision:1,datasetHash:sample.datasetHash,
  targetPool:{operation:'union',sources:sample.games[0].configs.map(c=>({gameId:'g',configId:c.id,roles:['target']}))},extraPool:{operation:'union',sources:[]}};
const build = (d,r) => O.buildModel(d,r,'targetPool',L.compile(d,r));
let m = build(sample,base);
assert.deepEqual([...m.regions], [['1',['CAT']],['7',['DOG']],['2',['ELK']]]);
assert.deepEqual(O.wordsFor(m,{kind:'source',key:'0'}),['CAT','DOG']);
assert.deepEqual(O.wordsFor(m,{kind:'region',key:'1'}),['CAT']);
assert.deepEqual(O.wordsFor(m,{kind:'common'}),['DOG']);
assert.match(O.regionLabel(m,'1'),/不含 B、C/);
const picked=structuredClone(base);picked.targetPool=L.withRegionSelection(picked.targetPool,['1','2']);
m=build(sample,picked);assert.deepEqual(m.result,['CAT','ELK']);assert.deepEqual([...m.selectedMasks],['1','2']);
const multiple=V.buildProportionalVenn(m.entries,{regions:new Map([...m.regions].map(([key,words])=>[Number(key),words]))},1,'multiple',{selectedMasks:[1,2]});
assert.deepEqual(multiple.diagnostics.selectedMasks,[1,2]);assert.equal(multiple.diagnostics.selectedTotal,2);
assert.match(multiple.markup,/data-selection-mask="1"/);assert.match(multiple.markup,/data-selection-mask="2"/);
assert.doesNotMatch(multiple.markup,/data-selection-mask="7"/);
const none=V.buildProportionalVenn(m.entries,{regions:new Map([...m.regions].map(([key,words])=>[Number(key),words]))},1,'none',{selectedMasks:[]});
assert.doesNotMatch(none.markup,/id="selected-region-highlight"/);
const duplicate=structuredClone(base);duplicate.targetPool.sources.push(duplicate.targetPool.sources[0]);
m=build(sample,duplicate);assert.equal(m.entries.length,3);assert.equal(m.duplicateSources,1);
const empty=structuredClone(base);empty.targetPool.sources=[];m=build(sample,empty);assert.deepEqual(m.result,[]);assert.deepEqual(O.regionRows(m),[]);
const onlyEmpty=structuredClone(base);onlyEmpty.targetPool.sources=[{gameId:'g',configId:'*',roles:['extra']}];m=build(sample,onlyEmpty);
assert.equal(m.common.length,0);assert.equal(O.regionRows(m)[0].count,0);
const emptyChart=V.buildProportionalVenn(m.entries,{regions:new Map()},1,'empty');assert(emptyChart.geometry.every(c=>c.r===0));
// Membership keys must not overflow the 32-bit circle-geometry representation.
const many=structuredClone(sample);many.games[0].configs=Array.from({length:40},(_,i)=>({id:String(i),label:String(i),words:{target:['COMMON','W'+i],extra:[],onlyExtra:[],bonus:[]}}));
const manyRecipe=structuredClone(base);manyRecipe.targetPool.sources=many.games[0].configs.map(c=>({gameId:'g',configId:c.id,roles:['target']}));
m=build(many,manyRecipe);assert.equal(m.entries.length,40);assert.deepEqual(m.common,['COMMON']);assert.equal(m.regions.get((1n<<39n).toString())[0],'W39');
console.log('range model: exact union/intersection, disjoint membership, circle area ratios, duplicate/empty sources and >32 source membership passed');
