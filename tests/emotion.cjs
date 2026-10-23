/* Formula, legacy inventory refresh and third-priority arrangement ranking. */
const assert=require('node:assert/strict'),S=require('../src/emotion'),A=require('../src/arrangement'),P=require('../src/level_pool'),L=require('../src/library'),E=require('../src/gen');
const profiles=require('../src/profiles.json'),data=require('../data/game_vocab/catalog.json');
const custom={fields:['emotion'],entries:{JOY:[2],BAD:[-1],HELL:[-2],SUN:[1],CAT:[0],EMPTY:[null]}};
const score=S.create(custom),value=score.score(['JOY','BAD'],['HELL','SUN','CAT']);
assert.equal(value.targetSum,1);assert.equal(value.extraSum,-1);assert.equal(value.score,.5);
assert.equal(score.score(['BAD'],['HELL','SUN']).score,-1.5);
assert.equal(score.score(['cat'],[]).score,0);
assert.equal(score.score(['JOY','joy'],['JOY','SUN','sun']).score,2.5,'count each listed word once, never twice as target and extra');
assert.deepEqual(score.score(['MISSING','EMPTY','CAT'],['UNKNOWN']).missingTargets,['MISSING','EMPTY']);
assert.equal(score.game({t:'JOY BAD',e:'HELL SUN CAT'}).score,.5);
const changed=structuredClone(custom);changed.entries.JOY=[1];assert.notEqual(S.create(changed).version,score.version);
const reordered={...custom,entries:Object.fromEntries(Object.entries(custom.entries).reverse())};assert.equal(S.create(reordered).version,score.version);
assert.equal(S.value('JOY'),2);assert.equal(S.value('SAD'),-1);
const snapshot=L.production(data,[L.tieredRecipes(data)[0]]).snapshot,ix=E.buildIndex(snapshot.lex);
const generated=E.generatePoolAttempts({width:3,height:3,targetCount:3},ix,profiles,{seed:'emotion-legacy-fixture'},0,40).find(Boolean);
const record=P.record(P.gameOf(generated.level),snapshot),expected=S.game(record.game);
assert.equal(record.metrics.emotionScore,expected.score);
const legacy=structuredClone(record);delete legacy.metrics.emotionScore;delete legacy.metrics.emotion;
assert.deepEqual(P.importRecord(legacy,{[snapshot.id]:snapshot}),record);assert.equal(S.enrich(legacy).id,record.id);
const forged=structuredClone(record);forged.metrics.emotionScore=99999;forged.metrics.emotion.score=99999;
assert.equal(P.importRecord(forged,{[snapshot.id]:snapshot}).metrics.emotionScore,expected.score);
assert.equal(P.summary(forged).emotionScore,expected.score);assert.equal(P.exportFile({id:'p',name:'QA'},[legacy],{[snapshot.id]:snapshot}).entries[0].metrics.emotionScore,expected.score);
function plan(n,rules={}){return {kind:'wordpages-arrangement',schemaVersion:1,name:'emotion QA',seed:'emotion-QA',budget:1000000,requiredLetters:{id:'fixture',levels:{}},overrides:{},segments:[{id:'s',from:1,to:n,width:3,height:3,targetCount:3,poolIds:['p'],rules:{maxTurns:1,repeatGap:0,...rules}}]};}
function entry(id,emotionScore,more={}){return {id,poolId:'p',playKey:id,width:3,height:3,targetCount:3,targets:[id+'A',id+'B',id+'C'],letters:['A','B','C'],maxTurns:1,multiTurnCount:0,straightCount:1,oneTurnCount:2,emotionScore,...more};}
let p=plan(1),choices=[entry('low',-2),entry('mid',0),entry('high',1.5)];
for(const seed of ['a','b','c']){p.seed=seed;assert.equal(A.solve(p,choices).rows[0].choice.id,'high');}
assert.equal(A.solve(p,[entry('low',-3),entry('higher',-1.5)]).rows[0].choice.id,'higher');
assert.equal(A.solve(p,[entry('invalid',100,{maxTurns:2}),entry('valid',-1)]).rows[0].choice.id,'valid','hard turn constraints outrank emotion');
// More than 256 high-emotion candidates violate two soft rules; the clean candidate must win.
p=plan(2,{repeatGap:20,repeatMode:'soft',densityWindow:20,densityCaps:{A:1},densityMode:'soft'});p.requiredLetters.levels={1:'Z',2:'Q'};
choices=[entry('first',0,{letters:['A','Z'],targets:['CAT','DOG','SUN']}),...Array.from({length:300},(_,i)=>entry('high-'+i,100,{letters:['A','Q'],targets:['CAT','H'+i,'J'+i]})),entry('clean',-10,{letters:['B','Q']})];
let result=A.solve(p,choices);assert.equal(result.status,'complete');assert.equal(result.rows[1].choice.id,'clean');assert.equal(result.audit.soft.length,0);assert(result.checks>300);
p.segments[0].rules.repeatMode='strict';p.segments[0].rules.densityMode='strict';assert.equal(A.solve(p,choices).rows[1].choice.id,'clean');
// Do not consume a later position's only candidate just for its high emotion score.
p=plan(10);p.requiredLetters.levels=Object.fromEntries([...'ABCDEFGHI'].map((c,i)=>[i+2,c]));
choices=[entry('common',-5,{letters:['X']}),...[...'ABCDEFGHI'].map((c,i)=>entry('rare-'+i,10,{letters:[c]}))];result=A.solve(p,choices);assert.equal(result.status,'complete');assert.equal(result.rows[0].choice.id,'common');
// Duplicate playable boards can have distinct extra-word snapshots; keep the higher-scoring version.
p=plan(2);p.segments[0].poolIds=['p','q'];choices=[entry('old',-4,{playKey:'same'}),entry('new',2,{playKey:'same',poolId:'q'}),entry('other',0)];
result=A.solve(p,choices);assert.equal(result.audit.filled,2);assert(result.rows.some(r=>r.choice.id==='new'));assert(!result.rows.some(r=>r.choice.id==='old'));
const tied=[entry('one',1),entry('two',1),entry('three',1)];p=plan(1);assert.deepEqual(A.solve(p,tied),A.solve(p,tied.slice().reverse()));
assert(new Set(Array.from({length:10},(_,i)=>A.solve({...p,seed:String(i)},tied).rows[0].choice.id)).size>1);
p=plan(2);p.requiredLetters.levels[2]='Z';result=A.solve(p,[entry('only',-1.5)]);assert.equal(result.audit.emotion.total,-1.5);assert.equal(result.audit.emotion.average,-1.5);assert.equal(result.audit.emotion.negative,1);
p=plan(2);p.budget=1;result=A.solve(p,[entry('high',2),entry('low',0)]);assert.equal(result.status,'budget');assert.equal(result.rows[0].choice.emotionScore,2);
console.log('emotion: signed half-weight formula, unknown/zero scores, old/forged metrics, snapshot identity, high-score choice, hard and soft priority, long candidate prefixes, scarcity, duplicates, seeded ties, gaps and budget handling passed');
if(process.env.EMOTION_SCALE==='1'){
 const inventory=Array.from({length:10000},(_,i)=>entry('level-'+i,(i%41-20)*.5));const large=plan(1000),start=performance.now(),answer=A.solve(large,inventory);
 assert.equal(answer.status,'complete');assert.equal(answer.audit.filled,1000);assert(answer.rows.every(r=>r.choice.emotionScore>=8));
 console.log(JSON.stringify({inventory:10000,positions:1000,checks:answer.checks,totalEmotion:answer.audit.emotion.total,seconds:(performance.now()-start)/1000}));
}
