/* Straight seeding, unrestricted target counts and reproducible inventory streams. */
const assert=require('node:assert/strict');
const E=require('../src/gen'),P=require('../src/level_pool'),A=require('../src/arrangement'),L=require('../src/library');
require('../src/validation');
const data=require('../data/game_vocab/catalog.json'),production=L.production(data,[L.tieredRecipes(data)[0]]),snapshot=production.snapshot;
const ix=E.buildIndex(snapshot.lex),cfg={seed:'straight-QA',maxUse:13},short=snapshot.lex.filter(x=>x.role==='candidate'&&[3,4].includes(x.word.length)).map(x=>x.word);
function canAdd(grid,width,height,word){
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const ex=x+dx*(word.length-1),ey=y+dy*(word.length-1);if(ex<0||ex>=width||ey<0||ey>=height)continue;
  const path=Array.from({length:word.length},(_,k)=>(y+dy*k)*width+x+dx*k);
  if(path.some(i=>!grid[i])&&path.every((i,k)=>!grid[i]||grid[i]===word[k]))return true;
 }
 return false;
}
let checked=0,biggest,extraChanged=0;
for(const [width,height] of P.sizes){
 const spec={width,height,initialLetters:'c, b a A'},all=E.generatePoolAttempts(spec,ix,null,cfg,0,256),valid=all.filter(Boolean);
 assert(valid.length);assert.deepEqual(E.generatePoolAttempts({...spec,initialLetters:'ABC',targetCount:2},ix,null,cfg,19,23),all.slice(19,42),'range chunks and obsolete target counts cannot change auto-count results');
 assert.deepEqual(E.generatePoolAttempts(spec,ix,{}, {...cfg,requiredLettersByLevel:{0:'XYZ',1:'XYZ'}},19,23),all.slice(19,42),'no profiles, ordinal stages or formal required-letter table in production');
 for(const {level,ordinal} of valid){
  assert.equal(level.number,undefined);assert.equal(level.requiredLetters,undefined);
  const grid=Array(width*height).fill(''),used=new Set(),placements=level.construction.placements;
  let phase='initials',initialWords=0;
  function exhausted(initial){assert(!short.some(word=>!used.has(word)&&(!initial||'ABC'.includes(word[0]))&&canAdd(grid,width,height,word)),'must exhaust legal fresh-cell straight placements before advancing');}
  for(const placement of placements){
   if(placement.phase!==phase){assert.equal(placement.phase,'fill');exhausted(true);phase='fill';}
   const {word,path,fresh}=placement;
   assert([3,4].includes(word.length));if(width===3)assert.equal(word.length,3);
   assert(!used.has(word));assert(level.targets.includes(word));assert.equal(E.turns(path,width),0);
   assert.equal(fresh,path.filter(i=>!grid[i]).length);assert(fresh>0);
   if(phase==='initials'){assert('ABC'.includes(word[0]));initialWords++;}
   path.forEach((cell,k)=>{assert(!grid[cell]||grid[cell]===word[k]);grid[cell]=word[k];assert.equal(level.grid[cell],word[k]);});used.add(word);
  }
  if(phase==='initials')exhausted(true);exhausted(false);assert(initialWords>0);
  const playable=E.scanTargets(level.grid,width,height,ix,32).filter(x=>x.safe&&x.length>=3&&x.length<=8);
  assert.deepEqual(level.targets,playable.map(x=>x.word).sort(),'all playable candidates must survive the final scan');
  const check=E.validate(level,ix,{...E.DEFAULTS,...cfg});assert(check.ok,check.errors.join(';'));
  const record=P.record(P.gameOf(level),snapshot,{ordinal,maxUse:13,...level.construction},ix);
  assert.deepEqual(P.importRecord(record,{[snapshot.id]:snapshot}),record);
  const proof=WPGen.exhaustive(level.grid,WPGen.nbr(width,height),level.targets,level.counts,100);
  assert(proof.ok&&!proof.dead&&!proof.overflow);assert.equal(proof.method,'consistent-paths');
  if(!biggest||record.metrics.targetCount>biggest.metrics.targetCount)biggest=record;
  checked++;
 }
 const plainIx=E.buildIndex(snapshot.lex.filter(x=>x.role==='candidate'));
 const plain=E.generatePoolAttempts(spec,plainIx,null,cfg,0,64),annotated=all.slice(0,64);
 const project=result=>{if(!result)return result;const copy=structuredClone(result);delete copy.level.extras;delete copy.level.metrics.extraCount;return copy;};
 assert.deepEqual(plain.map(project),annotated.map(project));
 extraChanged+=annotated.filter((r,i)=>r&&r.level.extras.length>plain[i].level.extras.length).length;
 for(const r of E.generatePoolAttempts(spec,ix,null,{...cfg,maxUse:3},0,64).filter(Boolean))assert(Math.max(...r.level.counts)<=3);
}
assert(extraChanged>0);assert(biggest.metrics.targetCount>16);
const file=P.exportFile({id:'straight',name:'直线生产'},[biggest],{[snapshot.id]:snapshot});assert(P.checkFileHeader(file));
assert.deepEqual(P.importRecord(file.entries[0],file.librarySnapshots),biggest);
const plan={kind:'wordpages-arrangement',schemaVersion:1,name:'自动词数验收',seed:'qa',budget:1000,requiredLetters:{id:'neutral',levels:{}},overrides:{},segments:[{id:'s',from:1,to:1,width:biggest.metrics.width,height:biggest.metrics.height,targetCount:biggest.metrics.targetCount,poolIds:['straight'],rules:{maxTurns:null,multiTurnLimit:32,repeatGap:0}}]};
assert.equal(A.solve(plan,[P.summary({...biggest,poolId:'straight'})]).status,'complete');
plan.segments[0].targetCount++;assert.equal(A.solve(plan,[P.summary({...biggest,poolId:'straight'})]).rows[0].reason,'static');
assert.equal(E.normalizeInitials('b，a a; C'),'ABC');assert.throws(()=>E.normalizeInitials('A1'),/A–Z/);
assert.throws(()=>E.productionSeedInfo({width:3,height:3,initialLetters:'D'},E.buildIndex([{word:'DEAR',role:'candidate'}])),/没有可直线/);
assert.throws(()=>E.productionSeedInfo({width:3,height:3,initialLetters:'B'},E.buildIndex([{word:'BAT',role:'extra'}])),/没有可直线/);
assert.deepEqual(E.productionSeedInfo({width:3,height:3,initialLetters:'AB'},E.buildIndex([{word:'BAT',role:'candidate'}])),{count:1,missing:['A']});
// A 32-word board must be checked instead of a 32-bit mask wrapping to zero.
const grid='ABCDEFGHIJKLMNO'.split(''),nb=WPGen.nbr(5,3),paths=[];
for(let i=0;i<grid.length;i++)for(const j of nb[i])for(const k of nb[j])if(i!==k)paths.push([i,j,k]);
const chosen=Array.from({length:32},(_,i)=>paths[Math.floor(i*paths.length/32)]),words=chosen.map(p=>p.map(i=>grid[i]).join('')),counts=grid.map((_,i)=>chosen.filter(p=>p.includes(i)).length);
assert.equal(words.length,32);assert(counts.every(n=>n>0&&n<=20));
const game={g:'ABCDE,FGHIJ,KLMNO',t:words.join(' '),e:'',n:counts.map(n=>n.toString(36)).join('')};
assert.equal(P.analyze(game).targetCount,32);assert(WPGen.exhaustive(grid,nb,words,counts,100).ok);
const invalid=WPGen.exhaustive(grid,nb,Array(32).fill('ZZZ'),counts,100);assert(!invalid.ok&&invalid.dead>0,'32 unavailable words cannot be reported as already solved');
console.log(`straight generation: ${checked} verified candidates, largest ${biggest.metrics.targetCount} targets; straight exhaustion, seeds, extras independence, round trips, exact arrangement and 32-word proof passed`);
