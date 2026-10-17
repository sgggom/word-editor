// Usage: node src/nodetest.js [count=30] [preset=list0] [output=/tmp/v2-list0.json]
const fs = require('node:fs');
const assert = require('node:assert/strict');
const E = require('./gen.js');
const {toGame} = require('./v2_adapter.js');
const lex = require('./lex.json'), profiles = require('./profiles.json');
const count = Number(process.argv[2] || 30), preset = process.argv[3] || 'list0';
assert(Number.isInteger(count) && count > 0);
assert(['list0', 'list5'].includes(preset));
const output = process.argv[4] || '/tmp/v2-' + preset + '.json';
const ix = E.buildIndex(lex);
const result = E.generateRange(ix, profiles, {preset, seed: 'QA-v2-2026', count, start: 1, attempts: 60, extraWeight: .9});
fs.writeFileSync(output, JSON.stringify(result, null, 2));
assert.equal(result.levels.length, count, JSON.stringify(result.failures));
assert.equal(result.failures.length, 0);
for (const level of result.levels) {
  assert(E.validate(level, ix, E.DEFAULTS).ok);
  assert(level.targets.every(w => ix.byWord.get(w).role === 'candidate'));
}
fs.writeFileSync(output.replace(/\.json$/, '') + '-game.json', JSON.stringify(result.levels.map(toGame), null, 2));
console.log(JSON.stringify({preset, requested: count, generated: result.levels.length, failed: result.failures.length, elapsedMs: result.elapsedMs,
  avgTargets: result.levels.reduce((s,l) => s+l.targets.length,0)/count,
  avgExtras: result.levels.reduce((s,l) => s+l.extras.length,0)/count, output}));
