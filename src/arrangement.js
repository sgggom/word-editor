/* Position-based inventory selection. Never changes or generates inventory. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WPArrangement=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const DEFAULT_RULES={maxTurns:1,multiTurnLimit:null,repeatGap:20,repeatMode:'strict',densityWindow:20,densityCaps:{},densityMode:'strict'};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
 const mix=n=>{n=Math.imul(n^(n>>>16),0x45d9f3b);n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;};
 function integer(n,min,max,label){if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(label+'须为 '+min+'–'+max+' 的整数');return n;}
 function geometry(o){if(![[4,2],[3,3],[4,3],[5,3]].some(([w,h])=>w===o.width&&h===o.height))throw new Error('棋盘尺寸无效');integer(o.targetCount,2,16,'目标词数');}
 function rules(raw={}){
  const r={...DEFAULT_RULES,...clone(raw),densityCaps:{...(raw.densityCaps||{})}};
  if(r.maxTurns!==null)integer(r.maxTurns,0,6,'最大拐弯数');
  if(r.multiTurnLimit!==null)integer(r.multiTurnLimit,0,16,'多拐弯词上限');
  integer(r.repeatGap,0,99999,'重复词间隔');integer(r.densityWindow,1,10000,'密度窗口');
  if(!['strict','soft'].includes(r.repeatMode)||!['strict','soft'].includes(r.densityMode))throw new Error('筛选模式无效');
  for(const [letter,cap] of Object.entries(r.densityCaps)){if(!/^[A-Z]$/.test(letter))throw new Error('密度字母须为 A–Z');integer(cap,0,r.densityWindow,letter+' 出现次数上限');}
  return r;
 }
 function expand(plan){
  if(plan?.kind!=='wordpages-arrangement'||plan.schemaVersion!==1||!Array.isArray(plan.segments)||!plan.segments.length)throw new Error('排布方案格式无效');
  if(typeof plan.seed!=='string')throw new Error('排布种子无效');integer(plan.budget,1,100000000,'搜索预算');
  if(!plan.requiredLetters?.levels||typeof plan.requiredLetters.id!=='string')throw new Error('排布方案缺少逐关字母表快照');
  const segments=plan.segments.slice().sort((a,b)=>a.from-b.from),slots=[];let next=1;
  for(const segment of segments){
   integer(segment.from,1,10000,'起始关号');integer(segment.to,segment.from,10000,'结束关号');
   if(segment.from!==next)throw new Error('分段须从第 1 关连续覆盖，不能重叠或跳号');geometry(segment);
   if(!Array.isArray(segment.poolIds)||!segment.poolIds.length||segment.poolIds.some(id=>typeof id!=='string'||!id))throw new Error('请为每个分段选择关卡库');
   const r=rules(segment.rules),poolIds=[...new Set(segment.poolIds)];
   for(let number=segment.from;number<=segment.to;number++){
    const override=plan.overrides?.[number]||{},shape={width:override.width??segment.width,height:override.height??segment.height,targetCount:override.targetCount??segment.targetCount};geometry(shape);
    const letters=number<=1000?plan.requiredLetters.levels[number]||'':'';
    if(typeof letters!=='string'||!/^[A-Z]*$/.test(letters))throw new Error('第 '+number+' 关字母配置无效');
    slots.push({number,...shape,poolIds,rules:r,requiredLetters:[...new Set(letters)].sort().join(''),segmentId:segment.id||String(segment.from)});
   }
   next=segment.to+1;
  }
  for(const key of Object.keys(plan.overrides||{}))if(!/^[1-9]\d*$/.test(key)||Number(key)>10000)throw new Error('逐关配置的关号无效');
  return slots;
 }
 function staticMatch(slot,entry){
  return slot.poolIds.includes(entry.poolId)&&slot.width===entry.width&&slot.height===entry.height&&slot.targetCount===entry.targetCount&&
   [...slot.requiredLetters].every(c=>entry.letters.includes(c))&&(slot.rules.maxTurns===null||entry.maxTurns<=slot.rules.maxTurns)&&
   (slot.rules.multiTurnLimit===null||entry.multiTurnCount<=slot.rules.multiTurnLimit);
 }
 function historyAt(slots,selected,index){
  const last=new Map(),counts={};const start=Math.max(0,index-slots[index].rules.densityWindow+1);
  for(let j=0;j<index;j++){
   const entry=selected[j];if(!entry)continue;
   for(const word of entry.targets)last.set(word,slots[j].number);
   if(j>=start)for(const letter of entry.letters)counts[letter]=(counts[letter]||0)+1;
  }
  return {last,counts};
 }
 function temporal(slot,entry,history){
  const r=slot.rules,violations=[],hard=[];
  if(r.repeatGap)for(const word of entry.targets){const last=history.last.get(word);if(last!==undefined&&slot.number-last<=r.repeatGap){const item={type:'repeat',word,last,number:slot.number};violations.push(item);if(r.repeatMode==='strict')hard.push(item);}}
  for(const [letter,cap] of Object.entries(r.densityCaps)){
   const count=(history.counts[letter]||0)+(entry.letters.includes(letter)?1:0);
   if(count>cap){const item={type:'density',letter,count,cap,number:slot.number};violations.push(item);if(r.densityMode==='strict')hard.push(item);}
  }
  return {hard,violations,penalty:violations.length};
 }
 function verify(slots,selected){
  const errors=[],soft=[],repeats=[],used=new Set(),density=[],turnCounts={0:0,1:0,multi:0};
  for(let i=0;i<slots.length;i++){
   const slot=slots[i],entry=selected[i];
   if(!entry){errors.push({number:slot.number,type:'missing',message:'关卡缺位'});density.push(null);continue;}
   if(!staticMatch(slot,entry))errors.push({number:slot.number,type:'static',message:'来源库、尺寸、目标数、字母或拐弯不符合配置'});
   if(used.has(entry.playKey))errors.push({number:slot.number,type:'duplicate',message:'同一关卡重复使用'});used.add(entry.playKey);
   const h=historyAt(slots,selected,i),test=temporal(slot,entry,h);
   for(const word of entry.targets)if(h.last.has(word)){const last=h.last.get(word);repeats.push({word,last,number:slot.number,gap:slot.number-last-1,requiredGap:slot.rules.repeatGap,mode:slot.rules.repeatMode});}
   errors.push(...test.hard.map(v=>({...v,message:v.type==='repeat'?'重复词间隔不足':'字母出现次数超过上限'})));
   soft.push(...test.violations.filter(v=>!test.hard.includes(v)));
   const counts={...h.counts};for(const c of entry.letters)counts[c]=(counts[c]||0)+1;
   density.push({number:slot.number,window:slot.rules.densityWindow,counts});
   turnCounts[0]+=entry.straightCount||0;turnCounts[1]+=entry.oneTurnCount||0;turnCounts.multi+=entry.multiTurnCount||0;
  }
  return {ok:!errors.length,errors,soft,repeats,density,turnCounts,filled:selected.filter(Boolean).length,total:slots.length};
 }
 function* solveSteps(plan,entries,options={}){
  const slots=expand(plan),seed=hash(plan.seed),budget=plan.budget,byShape=new Map(),lists=[],pressure=new Map();
  const rows=entries.slice().sort((a,b)=>a.poolId.localeCompare(b.poolId)||a.id.localeCompare(b.id));
  const ties=rows.map(e=>hash(e.id+'|'+e.poolId));
  rows.forEach((e,i)=>{const key=[e.width,e.height,e.targetCount].join('/');if(!byShape.has(key))byShape.set(key,[]);byShape.get(key).push(i);});
  for(let i=0;i<slots.length;i++){
   const slot=slots[i],seen=new Set(),list=[];
   for(const index of byShape.get([slot.width,slot.height,slot.targetCount].join('/'))||[]){const entry=rows[index];if(staticMatch(slot,entry)&&!seen.has(entry.playKey)){seen.add(entry.playKey);list.push(index);}}
   lists.push(list);for(const index of list){const key=rows[index].playKey;pressure.set(key,(pressure.get(key)||0)+1/Math.max(1,list.length));}
   if(i%16===0){yield {phase:'index',prepared:i+1,total:slots.length};if(options.cancelled?.())return result([],[],0,'cancelled');}
  }
  for(let i=0;i<lists.length;i++){
   const salt=mix(seed^slots[i].number);lists[i].sort((a,b)=>pressure.get(rows[a].playKey)-pressure.get(rows[b].playKey)||(mix(ties[a]^salt)-mix(ties[b]^salt)));
   if(i%16===0){yield {phase:'index',prepared:i+1,total:slots.length};if(options.cancelled?.())return result([],[],0,'cancelled');}
  }
  let selected=Array(slots.length).fill(null),reasons=Array(slots.length).fill(null),frames=[],used=new Set();
  let best=selected.slice(),bestReasons=reasons.slice(),bestFilled=-1,bestPenalty=Infinity,checks=0,index=0,exhausted=false;
  function result(choice,why,n,status){
   const full=Array.from({length:slots.length},(_,i)=>choice[i]||null),audit=verify(slots,full);
   return {kind:'wordpages-arrangement-preview',schemaVersion:1,seed:plan.seed,status,checks:n,budget,
    rows:slots.map((slot,i)=>({number:slot.number,candidateCount:lists[i]?.length||0,choice:full[i]?{poolId:full[i].poolId,id:full[i].id,playKey:full[i].playKey}:null,reason:full[i]?null:lists[i]?.length===0?'static':why[i]||(status==='cancelled'?'cancelled':'budget')})),audit};
  }
  function capture(){
   const filled=selected.filter(Boolean).length;
   if(filled>bestFilled||(filled===bestFilled&&bestPenalty>0)){const audit=verify(slots,selected),penalty=audit.soft.length;if(filled>bestFilled||penalty<bestPenalty){best=selected.slice();bestReasons=reasons.slice();bestFilled=filled;bestPenalty=penalty;}}
  }
  while(true){
   if(options.cancelled?.()){capture();return result(best,bestReasons,checks,'cancelled');}
   if(index>=slots.length){
    capture();if(bestFilled===slots.length)return result(best,bestReasons,checks,'complete');
    // Only revisit decisions near a repairable hole, not arbitrary tail choices.
    let pivot=-1;
    for(let hole=0;hole<slots.length&&pivot<0;hole++)if(!selected[hole]&&lists[hole].length){
     for(let j=hole-1;j>=Math.max(0,hole-20);j--)if(frames[j]&&frames[j].cursor+1<frames[j].options.length){pivot=j;break;}
    }
    if(pivot<0||exhausted)return result(best,bestReasons,checks,exhausted?'budget':'partial');
    frames[pivot].cursor++;
    for(let j=pivot;j<selected.length;j++){if(selected[j])used.delete(selected[j].playKey);selected[j]=null;reasons[j]=null;}
    const option=frames[pivot].options[frames[pivot].cursor];selected[pivot]=rows[option];used.add(rows[option].playKey);
    frames.length=pivot+1;index=pivot+1;continue;
   }
   if(checks>=budget){exhausted=true;capture();return result(best,bestReasons,checks,'budget');}
   const list=lists[index],slot=slots[index],history=list.length?historyAt(slots,selected,index):null,ranked=[];
   let blocked=false,unused=0,scanned=0;
   for(const candidate of list){
    if(checks>=budget){exhausted=true;break;}
    checks++;scanned++;const entry=rows[candidate];
    if(!used.has(entry.playKey)){
     unused++;const test=temporal(slot,entry,history);
     if(test.hard.length)blocked=true;else ranked.push({candidate,penalty:test.penalty,order:scanned});
    }
    if(checks%256===0){yield {phase:'search',checks,budget,filled:selected.filter(Boolean).length,total:slots.length};if(options.cancelled?.()){capture();return result(best,bestReasons,checks,'cancelled');}}
    if(ranked.filter(r=>r.penalty===0).length>=8||(ranked.length>=8&&scanned>=256))break;
   }
   ranked.sort((a,b)=>a.penalty-b.penalty||a.order-b.order);
   frames[index]={options:ranked.slice(0,8).map(r=>r.candidate),cursor:0};
   if(ranked.length){selected[index]=rows[ranked[0].candidate];used.add(selected[index].playKey);}
   else reasons[index]=!list.length?'static':exhausted?'budget':blocked&&unused?'temporal':'unmatched';
   index++;
   if(index%16===0)yield {phase:'search',checks,budget,filled:selected.filter(Boolean).length,total:slots.length};
  }
 }
 function solve(plan,entries){const it=solveSteps(plan,entries);let step;do{step=it.next();}while(!step.done);return step.value;}
 return {DEFAULT_RULES,rules,expand,staticMatch,historyAt,temporal,verify,solveSteps,solve};
});
