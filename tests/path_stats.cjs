const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const S = require('../src/path_stats');

// Independent exhaustive reference uses visible top-to-bottom coordinates.
function reference(g, word) {
  const rows = g.split(',').reverse(), width = rows[0].length, height = rows.length, letters = rows.join('');
  const paths = [];
  function visit(cells) {
    const last = cells.at(-1);
    if (letters[last] !== word[cells.length-1]) return;
    if (cells.length === word.length) { paths.push(cells); return; }
    for (let next = 0; next < letters.length; next++) {
      if (cells.includes(next)) continue;
      if (Math.abs(next % width - last % width) + Math.abs(Math.floor(next / width)-Math.floor(last / width)) === 1) visit([...cells,next]);
    }
  }
  for (let i = 0; i < letters.length; i++) visit([i]);
  const turns = cells => cells.slice(2).reduce((sum,cell,i) => sum + Number(cell-cells[i+1] !== cells[i+1]-cells[i]), 0);
  const forward = cells => cells[0] % width <= cells.at(-1) % width && Math.floor(cells[0]/width) <= Math.floor(cells.at(-1)/width);
  return {minTurns:paths.length ? Math.min(...paths.map(turns)) : null, forward:paths.some(forward)};
}
function measure(g, word) {
  const rows = g.split(',');
  return S.measure(rows.join(''), rows[0].length, rows.length, word);
}
function groups(g, words) {
  const rows = g.split(',');
  return S.analyze(rows.join(''), rows[0].length, rows.length, words.split(' '));
}

// Test all eight relative endpoint directions, not merely horizontal sign.
for (const [word, forward] of [['EF',true], ['EB',true], ['EFC',true], ['ED',false], ['EH',false], ['EDG',false], ['EFI',false], ['EDA',false]]) {
  assert.equal(measure('ABC,DEF,GHI', word).forward, forward, word);
  assert.deepEqual(measure('ABC,DEF,GHI', word), reference('ABC,DEF,GHI', word));
}
assert.deepEqual(groups('ALE,MTL,OBE', 'ALE MOB BELT MALE MALT'), {
  straight:['ALE'], oneTurn:['MOB','MALE'], multiTurn:['BELT','MALT'], forward:['ALE','BELT','MALE','MALT'], unreachable:[]
});
assert.deepEqual(groups('TAC,XXX,CAT', 'CAT CAT DOG'), {
  straight:['CAT'], oneTurn:[], multiTurn:[], forward:['CAT'], unreachable:['DOG']
}, 'a later forward path counts, repeated words count once, missing words are excluded');
assert.deepEqual(measure('CAT,XXX,XXX', 'TACT'), {minTurns:null,forward:false}, 'cells cannot be reused');
assert.deepEqual(S.measure([],0,0,'CAT'), {minTurns:null,forward:false});

let checked = 0;
// Real reference levels include repeated letters, alternate routes and all board sizes.
for (const filename of ['wt-list0.json.gz','wt-list5.json.gz']) {
  const levels = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname,'../data/competitor',filename))));
  for (const level of levels) for (const [word] of level[4]) {
    assert.deepEqual(measure(level[3],word), reference(level[3],word), filename+' level '+level[0]+' '+word);
    checked++;
  }
}
// Dense synthetic boards expose branching that ordinary levels rarely contain.
let seed = 24;
const random = n => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
for (let i=0;i<100;i++) {
  const width=3+random(2),height=3,letters=Array.from({length:width*height},()=> 'ABC'[random(3)]);
  const g=Array.from({length:height},(_,r)=>letters.slice(r*width,(r+1)*width).join('')).join(',');
  const word=Array.from({length:3+random(5)},()=> 'ABC'[random(3)]).join('');
  assert.deepEqual(measure(g,word),reference(g,word),g+' '+word);
}
console.log(`path statistics: all 8 directions, unique words, alternate paths, unreachable/reused cells, ${checked} real target occurrences and 100 dense boards passed`);
