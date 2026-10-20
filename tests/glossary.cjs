/* All shipped library words are explained once; glossary contents never grant permissions. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const L=require('../src/library'),data=require('../data/game_vocab/catalog.json');
const glossary=require('../data/glossary/default.json'),manifest=require('../data/glossary/manifest.json');
const recipes=L.tieredRecipes(data),scope=[...new Set(recipes.flatMap(r=>L.compile(data,r).words).filter(w=>[...w].length>=3))].sort();
const entries=glossary.entries;
assert.equal(glossary.schemaVersion,1);assert.equal(glossary.minimumLength,3);assert.equal(glossary.datasetHash,data.datasetHash);
assert.equal(scope.length,22452);assert.deepEqual(Object.keys(entries).sort(),scope.map(w=>w.toLowerCase()).sort());
for (const [word,row] of Object.entries(entries)) {
 assert.equal(word,L.normalize(word).toLowerCase());assert(word.length>=3);
 assert.equal(row.length,4,word);
 for(const value of row.slice(0,3)) {assert.equal(typeof value,'string');assert(value.trim(),word+' has an empty field');assert(!/暂无|待补充|unknown word|no definition available/i.test(value),word+' has a placeholder');assert(!value.includes('\uFFFD'),word+' has broken text encoding')}
 assert(/[\u3400-\u9fff]/.test(row[1]),word+' has no Chinese meaning');
 assert(!/[0-9\u3400-\u9fff^<>]/.test(row[0]),word+' has invalid pronunciation characters');
 assert(!row[0].includes('\\'),word+' has a damaged phonetic font escape');
 for(const key of ['ipaSource','zhSource','enSource']) assert(row[3][key],word+' lacks '+key);
 assert(['sourced','derived','unverified'].includes(row[3].ipaStatus),word+' has no pronunciation status');
 if(row[3].ipaStatus==='unverified') {assert.match(row[3].ipaEngine,/eSpeak NG/);assert.equal(row[3].ipaVoice,'en-us')}
}
assert.equal(manifest.uniqueWords,scope.length);assert.equal(manifest.excludedShortWords.length,28);
assert.equal(manifest.duplicateOccurrencesBeforeLengthFilter,6);
assert.equal(manifest.legacyWordsReused,11543);assert.equal(manifest.newWords,10909);
for(const field of ['ipa','zh','en']) assert.deepEqual(manifest.missing[field],[]);
for(const lib of manifest.libraries) assert.equal(lib.words,L.compile(data,recipes.find(r=>r.id===lib.id)).words.filter(w=>w.length>=3).length);
assert.equal(manifest.sha256,crypto.createHash('sha256').update(fs.readFileSync(require.resolve('../data/glossary/default.json'))).digest('hex'));
for(const file of ['index.html','wordpages-level-desk.html']){
 const html=fs.readFileSync(require.resolve('../'+file),'utf8');
 const inline=html.match(/<script id="defaultGlossary"[^>]*>([\s\S]*?)<\/script>/);assert(inline,file+' has no embedded glossary');
 assert.deepEqual(JSON.parse(inline[1]),glossary,file+' has stale definitions');
}
assert.equal(entries.cat[1].includes('猫'),true);
assert.equal(entries.cats[1].includes('猫'),true);
assert(!/高级电视|军事|装甲|Abas|阿巴斯/.test(entries.cats[1]+entries.aah[1]+entries.abased[1]));
for(const [word,pattern] of Object.entries({gaes:/去|行走/,sae:/如此|这样/,haes:/有|拥有/,nomas:/走马疳/,colby:/奶酪/,liri:/里拉/,frise:/圈绒/,pele:/塔楼/})) assert(pattern.test(entries[word][1]),word+' has a mismatched Chinese sense');
for(const word of ['gaes','nomas','agria']) assert(!/organization|surname|people of color/i.test(entries[word][2]),word+' still has a capitalized-name meaning');
const corrections=require('../data/glossary/corrections.json');
for(const [word,correction] of Object.entries(corrections)) if(entries[word]) for(const [index,field] of ['ipa','zh','en'].entries()) {
 if(correction[field]) assert.equal(entries[word][index],correction[field],word+': unapplied '+field+' correction');
 if(correction[field+'Base']) assert.equal(entries[word][3][field+'Base'],correction[field+'Base'],word+': wrong '+field+' base');
}
assert.equal(L.compile(data,recipes[0]).lex.length,1627);
console.log(JSON.stringify({words:scope.length,excludedTwoLetter:28,legacyWords:manifest.legacyWordsReused,newWords:manifest.newWords,pronunciations:manifest.pronunciations,checks:'coverage, deduplication, Chinese text, provenance, inline consistency and unchanged vocabulary permissions'}));
