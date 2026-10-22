const assert=require('node:assert/strict');
const E=require('../src/gen'),P=require('../src/level_pool'),A=require('../src/arrangement'),L=require('../src/library');
const profiles=require('../src/profiles.json'),data=require('../data/game_vocab/catalog.json');
const snapshot=L.snapshot(data,L.tieredRecipes(data)[0]),ix=E.buildIndex(snapshot.lex);
// Independent exhaustive walk checks the stored minimum, including alternative paths.
function minimumTurns(game,word){
 const rows=game.g.split(','),width=rows[0].length,grid=rows.join('');let best=Infinity;
 function walk(cell,at,used,previous,turns){
  if(grid[cell]!==word[at]||used.has(cell))return;
  if(at===word.length-1){best=Math.min(best,turns);return;}
  const nextUsed=new Set([...used,cell]),x=cell%width,y=Math.floor(cell/width);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<rows.length){const direction=dx+','+dy;walk(cell+dx+dy*width,at+1,nextUsed,direction,turns+(previous!==null&&previous!==direction?1:0));}
 }
 for(let cell=0;cell<grid.length;cell++)walk(cell,0,new Set(),null,0);return best;
}
let checked=0,first;
for(const spec of [{width:3,height:3,targetCount:3},{width:4,height:2,targetCount:5},{width:4,height:3,targetCount:9},{width:5,height:3,targetCount:10}]){
 const cfg={seed:'inventory-QA',attempts:1,requiredLettersByLevel:{0:'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}};
 const all=E.generatePoolAttempts(spec,ix,profiles,cfg,0,96);
 assert.deepEqual(E.generatePoolAttempts(spec,ix,profiles,cfg,12,8),all.slice(12,20));
 assert.equal(all.length,96,'inventory candidates ignore legacy best-level attempt count');
 const successes=all.filter(Boolean);assert(successes.length,JSON.stringify(spec));
 for(const result of successes){
  const game=P.gameOf(result.level),entry=P.record(game,snapshot,{seed:cfg.seed,ordinal:result.ordinal},ix);
  assert.equal(entry.metrics.width,spec.width);assert.equal(entry.metrics.height,spec.height);assert.equal(entry.metrics.targetCount,spec.targetCount);
  assert(!result.level.requiredLetters);assert.equal(result.level.number,undefined);
  for(const word of entry.metrics.perWord)assert.equal(word.turns,minimumTurns(game,word.word));
  assert.deepEqual(P.importRecord(entry,{[snapshot.id]:snapshot}),entry);
  assert.equal(P.record({...game,id:'other-id',name:'renamed'},snapshot,{},ix).id,entry.id);
  const bad=structuredClone(entry);bad.game.n='1'.repeat(game.n.length);if(bad.game.n!==game.n)assert.throws(()=>P.importRecord(bad,{[snapshot.id]:snapshot}));
  first??=entry;checked++;
 }
}
const file=P.exportFile({id:'p',name:'前期关卡'},[first],{[snapshot.id]:snapshot});assert.equal(P.checkFileHeader(file),file);
assert.throws(()=>P.importRecord({...first,id:'tampered'},file.librarySnapshots),/候选标识/);
const forged=structuredClone(first);forged.metrics.maxTurns=-1;assert.deepEqual(P.importRecord(forged,file.librarySnapshots).metrics,first.metrics,'import must recompute metrics');
const letters={id:'fixture',levels:Object.fromEntries(Array.from({length:1000},(_,i)=>[i+1,'']))};
function plan(n,rules={}){return {kind:'wordpages-arrangement',schemaVersion:1,name:'QA',seed:'arrange-QA',budget:1000000,requiredLetters:structuredClone(letters),overrides:{},segments:[{id:'s',from:1,to:n,width:3,height:3,targetCount:3,poolIds:['p'],rules:{repeatGap:0,...rules}}]};}
function entry(id,extra={}){return {id,poolId:'p',playKey:id,width:3,height:3,targetCount:3,targets:[id+'A',id+'B',id+'C'],letters:['A','B','C'],maxTurns:1,multiTurnCount:0,straightCount:1,oneTurnCount:2,...extra};}
let spec=plan(2);spec.requiredLetters.levels[2]='Z';
const rare=entry('rare',{letters:['A','B','C','Z']}),common=entry('common');
let result=A.solve(spec,[rare,common]);assert.equal(result.status,'complete');assert.equal(result.rows[1].choice.id,'rare');assert.equal(result.rows[0].choice.id,'common');
assert.deepEqual(A.solve(spec,[common,rare]),result,'input order must not affect seeded results');
let repaired=false;
for(let seed=0;seed<12;seed++){
 const p=plan(2,{repeatGap:20});p.seed='repair-'+seed;p.requiredLetters.levels[1]='Q';p.requiredLetters.levels[2]='Z';
 const r=A.solve(p,[entry('bad',{letters:['Q'],targets:['CAT','BAD','TEN']}),entry('good',{letters:['Q'],targets:['DOG','FOX','SUN']}),entry('future',{letters:['Z'],targets:['CAT','PIG','HEN']})]);
 assert.equal(r.status,'complete');if(r.checks>3)repaired=true;
}
assert(repaired,'a temporal conflict must exercise bounded backtracking');
spec=plan(2);spec.segments[0].poolIds=['p','q'];result=A.solve(spec,[entry('same'),entry('copy',{poolId:'q',playKey:'same'})]);assert.equal(result.audit.filled,1);assert.equal(result.rows.length,2);
spec=plan(3);spec.requiredLetters.levels[2]='Z';result=A.solve(spec,[entry('one'),entry('two')]);assert.equal(result.rows[1].reason,'static');assert(result.rows[2].choice,'holes must not stop later positions');
spec=plan(2,{repeatGap:20});result=A.solve(spec,[entry('one',{targets:['CAT','DOG','SUN']}),entry('two',{targets:['CAT','PIG','TEN']})]);assert.equal(result.audit.filled,1);
spec.segments[0].rules.repeatMode='soft';result=A.solve(spec,[entry('one',{targets:['CAT','DOG','SUN']}),entry('two',{targets:['CAT','PIG','TEN']})]);assert.equal(result.audit.filled,2);assert.equal(result.audit.soft[0].word,'CAT');
spec=plan(22,{repeatGap:20});let slots=A.expand(spec),chosen=Array(22).fill(null);chosen[0]=entry('one');chosen[20]=entry('two',{targets:chosen[0].targets});assert(A.verify(slots,chosen).errors.some(e=>e.type==='repeat'));
chosen[21]=chosen[20];chosen[20]=null;assert(!A.verify(slots,chosen).errors.some(e=>e.type==='repeat'));assert.equal(A.verify(slots,chosen).repeats[0].gap,20);
spec=plan(3,{densityWindow:2,densityCaps:{A:1}});slots=A.expand(spec);chosen=[entry('one'),null,entry('two')];assert(!A.verify(slots,chosen).errors.some(e=>e.type==='density'));
chosen[1]=entry('three');assert(A.verify(slots,chosen).errors.some(e=>e.type==='density'));
spec=plan(1,{densityWindow:20,densityCaps:{A:1}});result=A.solve(spec,[entry('one')]);assert.equal(result.status,'complete','short prefixes use the configured count cap');
spec=plan(2,{densityWindow:2,densityCaps:{A:1},densityMode:'soft'});result=A.solve(spec,[entry('one'),entry('two')]);assert.equal(result.audit.soft[0].type,'density');
spec=plan(2);spec.segments=[{...spec.segments[0],to:1},{...spec.segments[0],id:'s2',from:2,to:2,rules:{repeatGap:20}}];slots=A.expand(spec);assert(A.verify(slots,[entry('one'),entry('two',{targets:['oneA','X','Y']})]).errors.some(e=>e.type==='repeat'));
spec=plan(1);result=A.solve(spec,[entry('two-turn',{maxTurns:2,multiTurnCount:1})]);assert.equal(result.rows[0].reason,'static');
spec.segments[0].rules={repeatGap:0,maxTurns:2,multiTurnLimit:0};assert.equal(A.solve(spec,[entry('two-turn',{maxTurns:2,multiTurnCount:1})]).rows[0].reason,'static');
spec=plan(2);spec.budget=1;result=A.solve(spec,[entry('one'),entry('two')]);assert.equal(result.status,'budget');assert.equal(result.rows.length,2);
spec.requiredLetters.levels[2]='Z';result=A.solve(spec,[entry('one'),entry('two')]);assert.equal(result.rows[1].reason,'static','already indexed empty inventories remain known even after search budget is exhausted');
spec=plan(1);let iterator=A.solveSteps(spec,[entry('one')],{cancelled:()=>true}),step;do{step=iterator.next();}while(!step.done);assert.equal(step.value.status,'cancelled');
assert.throws(()=>A.expand({...plan(1),segments:[{...plan(1).segments[0],from:2,to:2}]}),/连续覆盖/);
console.log(`pool/arrangement: ${checked} generated records, deterministic attempts, import integrity, scarcity, duplicates, gaps, turn limits, temporal boundaries, soft modes, budgets and cancellation passed`);
if(process.env.POOL_SCALE==='1'){
 const inventory=Array.from({length:10000},(_,i)=>entry('inventory-'+i));const big=plan(1000),start=performance.now();
 const answer=A.solve(big,inventory);assert.equal(answer.audit.filled,1000);assert.equal(new Set(answer.rows.map(r=>r.choice.playKey)).size,1000);
 console.log(JSON.stringify({inventory:10000,positions:1000,matched:answer.audit.filled,checks:answer.checks,seconds:((performance.now()-start)/1000).toFixed(2)}));
}
