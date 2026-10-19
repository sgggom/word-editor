/* Generate real boards for independent Python validation, using three distinct recipes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const L=require('../src/library'),E=require('../src/gen'),A=require('../src/v2_adapter');
const data=require('../data/game_vocab/catalog.json'),profiles=require('../src/profiles.json');
const dir='/tmp/word-library-validation';fs.mkdirSync(dir,{recursive:true});
const baseline=L.defaultRecipe(data),intersection=structuredClone(baseline),union=structuredClone(baseline);
intersection.id='cross-intersection';intersection.name='Word Tiles 与 Wordscapes 交集';
intersection.targetPool={operation:'intersection',sources:[{gameId:'07_Word_Tiles',configId:'*',roles:['target']},{gameId:'04_Wordscapes',configId:'*',roles:['target']}]};
intersection.extraPool.sources.push({gameId:'06_Zen_Word',configId:'*',roles:['extra','onlyExtra','bonus']});
union.id='all-games-union';union.name='七款游戏并集';
union.targetPool.sources=data.games.map(g=>({gameId:g.id,configId:'*',roles:['target']}));
union.extraPool.sources=data.games.map(g=>({gameId:g.id,configId:'*',roles:['extra','onlyExtra','bonus']}));
const runs=[];
for(const recipe of [baseline,intersection,union]){
 const compiled=L.compile(data,recipe),ix=E.buildIndex(compiled.lex),lexFile=path.join(dir,recipe.id+'-lex.json');fs.writeFileSync(lexFile,JSON.stringify(compiled.lex));
 for(const preset of ['list0','list5'])for(const start of [1,51,1001]){
  const r=E.generateRange(ix,profiles,{preset,seed:'multi-library-2026',start,count:3,attempts:120});
  assert.equal(r.failures.length,0,JSON.stringify({recipe:recipe.id,preset,start,failures:r.failures}));
  assert.equal(r.levels.length,3);
  const file=path.join(dir,recipe.id+'-'+preset+'-'+start+'.json');fs.writeFileSync(file,JSON.stringify(r.levels.map(A.toGame)));
  runs.push({recipe:recipe.id,preset,start,count:3,file,lexFile});
 }
 console.log(recipe.name,compiled.stats.candidates+' candidates',compiled.stats.extras+' extras: 18 boards generated');
}
fs.writeFileSync(path.join(dir,'runs.json'),JSON.stringify(runs,null,2));
