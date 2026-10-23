/* Word-table emotion scores. Exact half-weight sums, independent of generation. */
(function(root,factory){
 const node=typeof module==='object'&&module.exports;
 const table=node?require('../data/word_table.json'):JSON.parse(root.document.getElementById('wordTable').textContent);
 const api=factory(table);if(node)module.exports=api;else root.WPEmotion=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(table){
 'use strict';
 const words=value=>[...new Set((Array.isArray(value)?value:String(value||'').trim().split(/\s+/)).map(w=>String(w).trim().toUpperCase()).filter(Boolean))];
 function hash(text){let a=2166136261,b=5381;for(const c of text){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return (a>>>0).toString(16)+(b>>>0).toString(16);}
 function create(source){
  const field=source.fields?.indexOf('emotion'),scores=new Map();
  if(!(field>=0)||!source.entries)throw new Error('词库表缺少情绪分字段');
  for(const [word,row] of Object.entries(source.entries))if(typeof row[field]==='number'&&Number.isFinite(row[field]))scores.set(word.toUpperCase(),row[field]);
  const version='emotion-sum-v1-'+hash(JSON.stringify([...scores].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)));
  const value=word=>scores.get(String(word).trim().toUpperCase())??null;
  function score(targets,extras){
   targets=words(targets);const targetSet=new Set(targets);extras=words(extras).filter(w=>!targetSet.has(w));
   const sum=list=>list.reduce((n,w)=>n+(value(w)??0),0);
   const targetSum=sum(targets),extraSum=sum(extras);
   return {version,score:targetSum+extraSum*.5,targetSum,extraSum,extraWeight:.5,
    missingTargets:targets.filter(w=>value(w)===null),missingExtras:extras.filter(w=>value(w)===null)};
  }
  const game=level=>score(level.t??level.targets??level.words,level.e??level.extras);
  const metrics=level=>{const emotion=game(level);return {emotionScore:emotion.score,emotion};};
  const enrich=entry=>entry?{...entry,metrics:{...entry.metrics,...metrics(entry.game)}}:entry;
  return {version,value,score,game,metrics,enrich};
 }
 return {create,table,...create(table)};
});
