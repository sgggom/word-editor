/* Required letters belong to a whole board, never to every target word. */
const assert=require('node:assert/strict'),E=require('../src/gen'),profiles=require('../src/profiles.json');
const schedule=require('../data/required_letters.json'),ix=E.buildIndex(require('../src/lex.json'));
assert.equal(Object.keys(schedule.levels).length,1000);
assert.deepEqual(Object.keys(schedule.levels).map(Number),Array.from({length:1000},(_,i)=>i+1));
for(const value of Object.values(schedule.levels)){assert(/^[A-Z]{3,4}$/.test(value));assert.equal(new Set(value).size,value.length);}
assert.equal(schedule.levels[1],'ABC');assert.equal(schedule.levels[1000],'CEST');
assert.deepEqual(E.requiredLettersFor(1001,{requiredLettersByLevel:schedule.levels}),[]);
assert.deepEqual(E.requiredLettersFor(1,{requiredLettersByLevel:{1:['A','B','A']}}),['A','B']);
assert.throws(()=>E.requiredLettersFor(1,{requiredLettersByLevel:{1:'A1'}}),/必选字母配置无效/);
const cfg={...E.DEFAULTS,attempts:300,requiredLettersByLevel:schedule.levels};
let checked=0;
for(const preset of ['list0','list5'])for(const number of [1,2,3,11,19,42,45,150,326,501,999,1000]){
 const options={...cfg,preset},r=E.generateOne(number,ix,profiles,options);
 assert(r.ok,`${preset}/${number}: ${r.reason}`);
 for(const c of schedule.levels[number])assert(r.level.grid.includes(c),`${number} missing ${c}`);
 assert(E.validate(r.level,ix,options).ok);
 assert.equal(r.level.requiredLetters.join(''),schedule.levels[number]);
 assert(r.level.targets.some(w=>r.level.requiredLetters.some(c=>!w.includes(c))),`must permit words containing only some required letters, level ${number}`);
 checked++;
}
const first=E.generateOne(1,ix,profiles,cfg).level;
const absent='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(c=>!first.grid.includes(c));
const overridden=E.validate(first,ix,{...cfg,requiredLettersByLevel:{1:absent}});
assert(!overridden.ok);assert(overridden.errors.some(e=>e.includes('棋盘缺少必选字母')&&e.includes(absent)));
assert(!E.validate({...first,requiredLetters:[absent]},ix,E.DEFAULTS).ok,'saved constraints must remain checkable without the schedule');
const impossible=E.generateOne(1,ix,profiles,{...cfg,attempts:4,requiredLettersByLevel:{1:'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}});
assert.equal(impossible.ok,false);assert.match(impossible.reason,/必选字母/);
const noJ=E.buildIndex([{word:'CAT',role:'candidate'},{word:'JAR',role:'extra'}]);
assert.equal(E.generateOne(1,noJ,profiles,{...cfg,attempts:4,requiredLettersByLevel:{1:'J'}}).ok,false);
const outOfRange={...E.DEFAULTS,attempts:40};
assert.deepEqual(E.generateOne(1001,ix,profiles,{...outOfRange,requiredLettersByLevel:schedule.levels}),E.generateOne(1001,ix,profiles,outOfRange));
const whole=E.generateAttempts(1,ix,profiles,cfg,{},0,40);
assert.deepEqual(E.generateAttempts(1,ix,profiles,cfg,{},12,7),whole.slice(12,19));
console.log(`required letters: ${checked} constrained levels, board scope, partial-word use, saved constraints, missing letters, impossible requirements and table boundaries passed`);
