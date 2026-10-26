/* Target length preferences and hard curriculum rules, independent of vocabulary. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WPLengths=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION='target-lengths-v1';
 const DEFAULT_RATIOS={'4x2':[65,30,5],'3x3':[65,25,10],'4x3':[50,35,15],'5x3':[45,35,20]};
 const words=value=>[...new Set((Array.isArray(value)?value:String(value||'').trim().split(/\s+/)).map(word=>String(word||'').trim().toUpperCase()).filter(Boolean))];
 function ratios(value,size){
  const result=value??DEFAULT_RATIOS[size];
  if(!Array.isArray(result)||result.length!==3||result.some(n=>!Number.isInteger(n)||n<0||n>100)||result.reduce((a,b)=>a+b,0)!==100)throw new Error(size+' 的 3／4／5+ 字母比例须为 0–100 的整数，合计 100%');
  return result.slice();
 }
 function production(spec){
  const settings=spec.wordLengths;if(!settings||settings.mode==='none')return null;
  const mode=settings.mode||'standard',size=spec.width+'x'+spec.height;
  if(!['standard','opening'].includes(mode))throw new Error('目标词长度档位无效');
  if(mode==='opening'&&(spec.width!==3||spec.height!==3))throw new Error('开局全 3 字母档位使用 3×3 棋盘');
  return {version:VERSION,mode,ratios:mode==='opening'?[100,0,0]:ratios(settings.ratios,size),maxLength:mode==='opening'?3:spec.width*spec.height<=9?5:8,requireFive:mode==='standard'&&spec.width*spec.height>9};
 }
 function statistics(value){
  const list=words(value),counts={3:0,4:0,5:0,6:0,7:0,8:0};
  for(const word of list)counts[word.length]=(counts[word.length]||0)+1;
  const fivePlus=list.filter(w=>w.length>=5).length;
  return {lengthCounts:counts,lengthTotal:list.length,shortCount:counts[3],mediumCount:fivePlus?counts[4]:0,longCount:fivePlus||counts[4],longMinLength:fivePlus?5:counts[4]?4:null};
 }
 function metrics(game){return statistics(game.t??game.targets??game.words);}
 const enrich=entry=>entry?{...entry,metrics:{...entry.metrics,...metrics(entry.game)}}:entry;
 function errors(value,width,height,mode='standard'){
  const list=words(value),stats=statistics(list),out=[];
  if(mode==='opening'){
   if(width!==3||height!==3)out.push('前 2 关须使用 3×3 小棋盘');
   if(!list.length||list.some(word=>word.length!==3))out.push('前 2 关的必答词须全部为 3 字母');
  }else if(width*height<=9){
   if(list.some(word=>word.length<3||word.length>5))out.push('小棋盘的必答词长度须为 3／4／5');
   if(!stats.lengthCounts[3]||!stats.lengthCounts[4])out.push('小棋盘需包含 3 和 4 字母词，5 字母词可选');
  }else if(!stats.lengthCounts[5])out.push('大棋盘至少需要一个 5 字母必答词');
  return out;
 }
 function arrangementRule(plan,number){return plan.targetLengths===true?(number<=2?'opening':'standard'):null;}
 return {VERSION,DEFAULT_RATIOS,ratios,production,statistics,metrics,enrich,errors,arrangementRule};
});
