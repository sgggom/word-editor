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
const corrections=structuredClone(require('../data/glossary/corrections.json'));
const senseReviews=require('../data/glossary/reviewed/sense-alignment.json');
const reviewDir=require('node:path').resolve(__dirname,'../data/glossary/reviewed');
const reviewLayers=[senseReviews];
const datedReviewDirs=fs.readdirSync(reviewDir).filter(name=>/^(full-audit|dictionary-followup)-/.test(name));
datedReviewDirs.sort((a,b)=>{
 const dates=(a.match(/\d{4}-\d{2}-\d{2}/)?.[0]||'').localeCompare(b.match(/\d{4}-\d{2}-\d{2}/)?.[0]||'');
 return dates || Number(a.startsWith('dictionary-followup-'))-Number(b.startsWith('dictionary-followup-')) || a.localeCompare(b);
});
for(const dir of datedReviewDirs) {
 for(const file of fs.readdirSync(require('node:path').join(reviewDir,dir)).filter(name=>name.endsWith('.json')).sort()) {
  reviewLayers.push(JSON.parse(fs.readFileSync(require('node:path').join(reviewDir,dir,file),'utf8')));
 }
}
for(const layer of reviewLayers) for(const [word,review] of Object.entries(layer)) {
 assert(review.zh && review.en,word+': sense review must be bilingual');
 const merged=corrections[word]??={};
 for(const field of ['ipa','zh','en']) if(review[field]) {
  delete merged[field+'Base'];
  delete merged[field+'SourceUrl'];
 }
 Object.assign(merged,review);
}
for(const [word,correction] of Object.entries(corrections)) if(entries[word]) for(const [index,field] of ['ipa','zh','en'].entries()) {
 if(correction[field]) assert.equal(entries[word][index],correction[field],word+': unapplied '+field+' correction');
 if(correction[field+'Base']) assert.equal(entries[word][3][field+'Base'],correction[field+'Base'],word+': wrong '+field+' base');
}
for(const [word,pattern] of Object.entries({sang:/唱/,shoes:/鞋/,souk:/市场|集市/,sods:/草皮/,saros:/223/,siemens:/电导/,typos:/错/,wore:/过去式/,writhe:/扭/,vines:/藤/})) assert.match(entries[word][1],pattern,word+': reviewed meaning regression');
assert(!/过去式和过去分词/.test(entries.wore[1]),'wore is the simple past, not the standard participle');
assert(!/导尿|copper/i.test(entries.cus[1]+entries.cus[2]));
assert.match(entries.cus[1],/因为/);assert.match(entries.cus[2],/because/);
assert(!/导尿|metallic|copper/i.test(entries.cus[1]+entries.cus[2]));
assert.equal(entries.cus[3].ipaStatus,'derived');
assert.equal(entries.cus[3].ipaBase,"'cause");
assert.match(entries.argal[1],/野生绵羊/);
assert(!entries.argal[1].includes('野山羊'));
assert.match(entries.piraya[1],/大型/);
assert.match(entries.editor[2],/deletion of data/,'complete computer-editor definition');
assert.match(entries.eden[2],/driven from their paradise/,'complete Eden definition');
assert.match(entries.dwelled[1],/[\u3400-\u9fff]/);
assert.match(entries.dwelled[2],/past participle of dwell/);
assert(!/[\u3400-\u9fff]/.test(entries.dwelled[2]),'dwelled language fields must not be swapped');
assert(!/chief justice|political journalist|United States architect/i.test(entries.white[2]),'ordinary white must not inherit surnames');
assert.match(entries.typo[2],/typographer/,'retain the dictionary-attested dated sense');
assert.match(entries.plasma[2],/protoplasm/,'retain the dictionary-attested old biology sense');
assert.match(entries.aurate[1],/耳/,'retain the dictionary-attested adjective');
for(const [word,ipa] of Object.entries({acmic:'/ˈækmɪk/',alans:'/əˈlænz/',apos:'/ˈeɪpoʊz/',ates:'/ˈɑːteɪz/',gighe:'/ˈdʒiːɡeɪ/',renate:'/riːˈneɪt/',uma:'/ˈuːmə/'})) {
 assert.equal(entries[word][0],ipa,word+': confirmed lexical pronunciation regression');
 assert.notEqual(entries[word][3].reviewStatus,'pending',word+': a resolved review must clear its marker');
 assert(!entries[word][3].ipaEngine,word+': a dictionary correction must clear the old prediction provenance');
}
assert.equal(entries.apos[3].ipaBase,'apo');
assert.equal(entries.ates[3].ipaBase,'ate');
assert.equal(entries.areae[3].ipaBase,'area');
assert.match(entries.areae[0],/i\.i/,'retain the medial vowel in the medical plural');
assert.match(entries.farc[1],/哥伦比亚/);
assert(!/farce|闹剧/.test(entries.farc[1]+entries.farc[2]));
assert.match(entries.oig[2],/Office of Inspector General/);
assert(!/Scots|催促/.test(entries.oig[1]+entries.oig[2]));
const auditDir=require('node:path').resolve(__dirname,'../data/glossary/audits/2026-10-21');
const audit=JSON.parse(fs.readFileSync(require('node:path').join(auditDir,'summary.json'),'utf8'));
const ledger=fs.readFileSync(require('node:path').join(auditDir,'ledger.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
const pending=JSON.parse(fs.readFileSync(require('node:path').join(auditDir,'pending.json'),'utf8'));
assert.equal(audit.reviewedWords,22452);assert.equal(audit.unreviewedWords,0);
assert.equal(ledger.length,22452);assert.equal(new Set(ledger.map(row=>row.word)).size,22452);
assert.deepEqual(ledger.map(row=>row.word).sort(),Object.keys(entries).sort(),'audit must include each word exactly once');
assert.match(audit.glossarySha256,/^[0-9a-f]{64}$/,'audit records its reviewed glossary snapshot');
const counts={};for(const row of ledger) {
 assert(['pass','corrected','pending'].includes(row.status),row.word+': missing audit verdict');
 counts[row.status]=(counts[row.status]||0)+1;
 if(row.status==='pending') assert(row.issue,row.word+': pending without an explained finding');
}
assert.deepEqual(counts,audit.statuses);
assert.deepEqual(pending.map(row=>row.word),ledger.filter(row=>row.status==='pending').map(row=>row.word),'pending list must match the complete audit ledger');
const auditRoot=require('node:path').dirname(auditDir);
const latestAuditDir=fs.readdirSync(auditRoot).filter(name=>fs.existsSync(require('node:path').join(auditRoot,name,'pending.json'))).sort().at(-1);
const currentPending=JSON.parse(fs.readFileSync(require('node:path').join(auditRoot,latestAuditDir,'pending.json'),'utf8'));
assert.deepEqual(Object.keys(entries).filter(word=>entries[word][3].reviewStatus==='pending').sort(),currentPending.map(row=>row.word).sort(),'runtime markers follow the latest audit, while old audit records remain immutable');
const followupDir=require('node:path').join(auditRoot,'2026-10-21-pending-19');
const followup=JSON.parse(fs.readFileSync(require('node:path').join(followupDir,'summary.json'),'utf8'));
const followupLedger=fs.readFileSync(require('node:path').join(followupDir,'ledger.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line));
assert.equal(followupLedger.length,19);
assert.deepEqual(followupLedger.map(row=>row.word).sort(),pending.map(row=>row.word).sort(),'follow-up covers every previously pending word exactly once');
assert.equal(followup.runtimeSha256,manifest.sha256,'latest audit must match the shipped dictionary');
for(const row of followupLedger) {
 assert.equal(row.status==='pending',entries[row.word][3].reviewStatus==='pending',row.word+': wrong latest review marker');
 assert.deepEqual(entries[row.word].slice(0,3),['ipa','zh','en'].map(field=>row.after[field]),row.word+': latest audited fields not applied');
 if(row.status==='pending') assert.deepEqual(row.after,row.before,row.word+': uncertain pronunciation must not be guessed');
}
for(const [file,record] of Object.entries(audit.reviewFiles)) {
 const raw=fs.readFileSync(require('node:path').join(reviewDir,'full-audit-2026-10-21',file));
 assert.equal(record.sha256,crypto.createHash('sha256').update(raw).digest('hex'),file+': review changed after audit aggregation');
}
assert.equal(L.compile(data,recipes[0]).lex.length,1627);
console.log(JSON.stringify({words:scope.length,excludedTwoLetter:28,legacyWords:manifest.legacyWordsReused,newWords:manifest.newWords,pronunciations:manifest.pronunciations,checks:'coverage, deduplication, Chinese text, provenance, inline consistency and unchanged vocabulary permissions'}));
