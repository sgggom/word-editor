/* Word Tiles research-grounded editor v2 — no external libraries. CommonJS/browser UMD. */
(function(root,factory){let out=factory();if(typeof module==='object'&&module.exports)module.exports=out;else root.WTEngine=out;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const ROLES=new Set(['candidate','extra','pending','blocked']);
const DEFAULTS={preset:'list0',seed:'WT-2026',start:1,count:20,effort:45,attempts:100,cooldown:20,strictMorph:true,adjacency:true,allowUnsafe:false,variance:0.16,extraWeight:0.8,readingBias:1.0,uniqueMin:0.88,maxUse:13};
function hash(s){let h=2166136261>>>0;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function random(seed){let s=hash(seed)||12345;return function(){s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(a,rng){a=a.slice();for(let i=a.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function pick(a,rng){return a[Math.floor(rng()*a.length)];}
function clamp(v,l,h){return Math.max(l,Math.min(h,v));}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function stage(n){return n<=5?Math.max(1,n):n<=10?6:n<=20?11:n<=50?21:n<=100?51:n<=200?101:n<=500?201:n<=1000?501:1001;}
function getProfile(n,preset,profiles){const a=profiles[preset]||profiles.list0;let prof=a.find(x=>{let lo=Number(x.stage.split(/[–-]/)[0]);let hi=Number(x.stage.split(/[–-]/)[1]);return n>=lo&&n<=hi;});return prof||a[a.length-1];}
function targetFor(n,config,profiles){let rng=random(config.seed+'|profile|'+config.preset+'|'+n),p=getProfile(n,config.preset,profiles);let early=n<=5,spread=early?0:clamp(Math.round(p.k*(config.variance??.16)),1,3);let k=early?Math.round(p.k):clamp(Math.round(p.k)+(Math.floor(rng()*(spread*2+1))-spread),2,16);
 let cells=early?Math.round(p.cells):pick([8,9,9,12,12,12,15],rng);if(!early){let options=(n>20&&p.cells>=10)?[9,12,15]:[8,9,12,15];let dist=options.map(x=>Math.exp(-Math.abs(x-p.cells)*1.0)*(x===12?1.35:1));let sum=dist.reduce((x,y)=>x+y,0),v=rng()*sum;cells=options[0];for(let i=0;i<options.length;i++){v-=dist[i];if(v<=0){cells=options[i];break}}}
 const dim=cells===8?[4,2]:cells===9?[3,3]:cells===12?[4,3]:[5,3];return {...p,k,cells,width:dim[0],height:dim[1],stageStart:stage(n)};}
function normalizeLex(raw){let seen=new Set(),a=[];for(let v of raw){let word=String(v.word||'').trim().toUpperCase();if(!/^[A-Z]{2,12}$/.test(word)||seen.has(word))continue;seen.add(word);let role=ROLES.has(v.role)?v.role:'pending';a.push({...v,word,role});}return a;}
function buildIndex(lex){let tree={},byLength={},byWord=new Map(),acceptable=[];for(let x of normalizeLex(lex)){byWord.set(x.word,x);if(x.role!=='candidate'&&x.role!=='extra')continue;acceptable.push(x);if(x.role==='candidate'){(byLength[x.word.length]??=[]).push(x);}let node=tree;for(let c of x.word)node=node[c]||(node[c]={});node.$=x.word;}return {tree,byLength,byWord,acceptable};}
function neighbors(w,h){let n=w*h;return Array.from({length:n},(_,i)=>{let x=i%w,y=Math.floor(i/w);return [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1].filter(x=>x>=0);});}
function direction(p,w){if(p.length<2)return 'X';let d=p[1]-p[0];if(p.every((x,i)=>i===0||x-p[i-1]===d))return d===1?'R':d===-1?'L':d===w?'D':d===-w?'U':'X';return 'T';}
function turns(p,w){let v=0;for(let i=2;i<p.length;i++)if(p[i]-p[i-1]!==p[i-1]-p[i-2])v++;return v;}
function placeWord(g,word,nb,rng,maxTry=48){let n=g.length,choices=[];
 for(let z=0;z<maxTry;z++){
  let start=Math.floor(rng()*n),v=start,p=[],used=new Set(),valid=true;
  for(let k=0;k<word.length;k++){
   if(used.has(v)||(g[v]&&g[v]!==word[k])){valid=false;break}p.push(v);used.add(v);if(k+1<word.length){let poss=nb[v].filter(j=>!used.has(j)&&(!g[j]||g[j]===word[k+1]));if(!poss.length){valid=false;break}v=pick(poss,rng);}
  }
  if(!valid)continue;
  const fresh=p.filter((v,i)=>!g[v]).length;const old=p.length-fresh;
  const balance=Math.abs(fresh-(word.length<=4?2:3));const score=fresh*1.1+old*.6-balance*.25+(rng()*.25);
  choices.push({p,score,fresh,old});
 }
 choices.sort((a,b)=>b.score-a.score);let c=choices[0];if(!c)return null;c.p.forEach((v,k)=>g[v]=word[k]);return c;
}
function fillBoard(target,ix,rng,config,recent){let {width:w,height:h,cells:N,k}=target,nb=neighbors(w,h),g=Array(N).fill(''),seeds=[],used=new Set(),needEarly=target.stageStart<=5;
 const trialLen=needEarly?[3,4]:target.k<6?[4,5,6]:target.stageStart>=51?[5,6,7,8]:[4,5,6,7];
 for(let step=0;step<5&&g.some(x=>!x);step++){
  let len=pick(trialLen,rng),pool=ix.byLength[len]||[];
  if(!pool.length)continue;
  let best=null;for(let a=0;a<42;a++){
    let x=pool[Math.floor(rng()*pool.length)];if(used.has(x.word))continue;
    if(recent.has(x.word)&&rng()<.85)continue;
    let scratch=g.slice(), placement=placeWord(scratch,x.word,nb,rng,18);if(!placement)continue;
    let fresh=placement.fresh; if(fresh===0&&g.some(v=>!v))continue;
    let score= fresh*1.5+placement.old*.5-Math.max(0,fresh-(N-g.filter(Boolean).length))*.4;
    if(step===0)score+=x.word.length*.1;
    if(!best||score>best.score)best={x,scratch,placement,score};
  }
  if(best){g=best.scratch;used.add(best.x.word);seeds.push(best.x.word);}
 }
 const freq='EEEEEEEEEEAAAAAAAOOOOOOOIIIIIIITTTTTTRRRRRRNNNNNLLLLSSSSDDCCUUUMMHPBGFVWYK';
 for(let i=0;i<N;i++)if(!g[i])g[i]=freq[Math.floor(rng()*freq.length)];
 return {g,seeds,nb};
}
function scan(g,w,h,ix,cap=14){const nb=neighbors(w,h),found=new Map(), maxNodes=150000;let steps=0;
 function walk(i,node,mask,path){if(steps++>maxNodes)return;let child=node[g[i]];if(!child)return;let m=mask|(1<<i);path.push(i);
  if(child.$){let w=child.$,v=found.get(w);if(!v){v=[];found.set(w,v)}if(v.length<cap)v.push(path.slice());}
  if(path.length<8){for(let j of nb[i])if(!(m&(1<<j)))walk(j,child,m,path);}
  path.pop();}
 for(let i=0;i<g.length;i++)walk(i,ix.tree,0,[]);
 let out=[];for(let [word,ps] of found){ps.sort((a,b)=>turns(a,w)-turns(b,w));let masks=new Set(ps.map(p=>p.reduce((z,j)=>z|(1<<j),0)));out.push({word,paths:ps,mask:ps[0].reduce((z,j)=>z|(1<<j),0),unique:ps.length===1,safe:masks.size===1&&ps.length<cap,path:ps[0],turns:turns(ps[0],w),straight:direction(ps[0],w),length:word.length});}
 return out;
}
function selectTargets(items,target,ix,config,history,rng){let K=target.k,used=history.usage||{},recent=history.recent||new Map();const C=items.filter(x=>ix.byWord.get(x.word)?.role==='candidate'&&x.safe&&x.length>=3&&x.length<=8);
 if(C.length<K)return null;let sel=[],have=new Set(),cover=0,ns=target.cells,goalStraight=target.straight,goalMean=target.avgLen;
 const rel=(w)=>sel.some(x=>x.word.includes(w)||w.includes(x.word));
 for(let pos=0;pos<K;pos++){
  let b=null,bscore=-1e12;
  for(let c of C){if(have.has(c.word))continue;let first=c.word;
   let fresh=c.path.filter(i=>!(cover&(1<<i))).length;
   let isRel=rel(first);
   let desiredLen=(goalMean>3.7&&sel.filter(x=>x.length>=5).length<Math.max(1,Math.round(K*(1-target.shortPct||.19)))?5:3);
   let old=used[first]||0,gap=target.n-(recent.get(first)||-9999);
   let score=fresh*(pos<K-2?2.6:4.6)+ (isRel?2:0) + (c.straight!=='T'?0.2:0) + (c.length>=5?(sel.filter(x=>x.length>=5).length<K*.25?.45:-.65):.25) -Math.abs(c.length-goalMean)*.27-old*.32 - (gap<=config.cooldown?12:0) + rng()*.8;
   if((pos===K-1||pos===K-2)&&fresh===0&&cover!==(1<<ns)-1)score-=20;
   if(score>bscore){b=c;bscore=score}
  }
  if(!b)return null;sel.push(b);have.add(b.word);cover|=b.mask;
 }
 if(cover!==(1<<ns)-1)return null;
 let demands=Array(ns).fill(0);for(let c of sel)for(let i of c.path)demands[i]++;
 if(Math.max(...demands)>config.maxUse)return null;
 return {selected:sel,demands};
}
function adjacencyStats(g,w,h,soft){let NB=neighbors(w,h),actual=new Map(),freq=new Map(),edges=0;for(let c of g)freq.set(c,(freq.get(c)||0)+1);
 for(let i=0;i<g.length;i++)for(let j of NB[i])if(j>i){edges++;let key=[g[i],g[j]].sort().join('');actual.set(key,(actual.get(key)||0)+1)}
 let score=0;for(let [pair,ct] of actual){let r=soft[pair]||1;score+=ct*Math.log(clamp(r,0.3,2.2));}
 return {edges,actual:[...actual],score};}
function metrics(board,target,items,sel,index,config){let {g,w,h,counts}=board,words=sel.map(x=>x.word),R=sel.filter(x=>x.straight!=='T'&&x.straight!=='X').length,uniq=sel.filter(x=>x.unique).length,turn=avg(sel.map(x=>x.turns)),k=words.length,letters=new Set(g).size,rels=0;
 for(let i=0;i<k;i++)for(let j=i+1;j<k;j++)if(words[i].includes(words[j])||words[j].includes(words[i]))rels++;
 let extras=items.filter(x=>!words.includes(x.word)),d=target;
 let adj=adjacencyStats(g,w,h,config.adjWeights||{});
 let p={k,straightRatio:R/k,uniqueRatio:uniq/k,meanTurns:turn,avgWordLength:avg(sel.map(x=>x.word.length)),maxWordLength:Math.max(...sel.map(x=>x.word.length)),longCount:sel.filter(x=>x.word.length>=5).length,extraCount:extras.length,relPairs:rels,letterKinds:letters,repeatedTiles:g.length-letters,maxLayer:Math.max(...counts),coverage:1,adjScore:adj.score,dirs:{R:0,L:0,U:0,D:0,T:0}};
 for(let x of sel)p.dirs[x.straight]=(p.dirs[x.straight]||0)+1;
 const dist=(v,tol)=>Math.abs(v-(tol||0));
 let score=0;score-=dist(p.straightRatio,d.straight)*4;score-=dist(p.meanTurns,d.minTurns)*3;score-=dist(p.avgWordLength,d.avgLen)*3;score-=dist(p.letterKinds,d.letterKinds)*.75;score-=dist(p.maxLayer,d.maxLayers)*.5;score-=dist(p.relPairs,d.related)*1.1;score-=dist(p.extraCount,d.bonus)*config.extraWeight;
 if(p.uniqueRatio<config.uniqueMin)score-=(config.uniqueMin-p.uniqueRatio)*20;
 if(config.adjacency)score+=p.adjScore*.2;
 let Rcount=p.dirs.R,Lcount=p.dirs.L,Ucount=p.dirs.U,Dcount=p.dirs.D;
 let rbonus=(Rcount+Ucount)-(Lcount+Dcount);
 score+=rbonus*config.readingBias;
 return {metrics:p,score,extras:extras.map(x=>x.word),adj};
}
function validate(level,ix,config){if(!level||!Array.isArray(level.grid)||!Array.isArray(level.targets))return {ok:false,errors:['格式无效']};let errors=[],w=level.width,h=level.height,g=level.grid,items=scan(g,w,h,ix,32),found=new Map(items.map(x=>[x.word,x]));let needed=Array(g.length).fill(0);
 if(g.length!==w*h)errors.push('棋盘格数不匹配');
 if(!level.targets.length)errors.push('没有必答词');
 for(let t of level.targets){let x=found.get(t);if(!x)errors.push(`${t}在棋盘不可达或不在合法词库`);else if(!x.safe)errors.push(`${t}存在用格不一致的多路径，顺序安全未证明`);else for(let i of x.path)needed[i]++;
 if(ix.byWord.get(t)?.role!=='candidate')errors.push(`${t}已非必答候选`);}
 if(needed.some((v,i)=>v!==level.counts?.[i]))errors.push('逐格次数与必答路径不一致');
 if(needed.some(v=>v===0))errors.push('存在不参与必答的格子');
 if(needed.some(v=>v>config.maxUse))errors.push(`超过单格复用上限${config.maxUse}`);
 let extras=items.filter(x=>!level.targets.includes(x.word)).map(x=>x.word);
 return {ok:errors.length===0,errors,extras,checkedPaths:items.length};
}
function generateOne(n,ix,profiles,config={},history={}){config={...DEFAULTS,...config};let d={...targetFor(n,config,profiles),n},rng=random(config.seed+'|'+config.preset+'|'+n+'|generate'),N=config.attempts||100,best=null,byWord=ix.byWord;
 for(let a=0;a<N;a++){
  let fill=fillBoard(d,ix,rng,config,history.recent||new Map()),{g,seeds,nb}=fill,items=scan(g,d.width,d.height,ix,18),pickings=selectTargets(items,d,ix,config,history,rng);
  if(!pickings)continue;
  let {selected,demands}=pickings;
  let board={g,w:d.width,h:d.height,counts:demands}, evaluation=metrics(board,d,items,selected,ix,config);
  let lv={id:`${config.preset}-${n}-${hash(g.join('')+'|'+selected.map(x=>x.word).join(',')).toString(16)}`,number:n,preset:config.preset,width:d.width,height:d.height,grid:g,counts:demands,targets:selected.map(x=>x.word),extras:evaluation.extras,paths:Object.fromEntries(selected.map(x=>[x.word,x.path])),source:'generated',profile:d.stage,validated:true,metrics:evaluation.metrics};
  let verify=validate(lv,ix,config);if(!verify.ok)continue;
  let cur={ok:true,level:lv,score:evaluation.score,attempts:a+1,profile:d};if(!best||cur.score>best.score)best=cur;
  if(best.score>=-2 && a>Math.min(15,N/3))break;
 }
 return best||{ok:false,number:n,reason:`尝试${N}次后未找到满足覆盖和全路径安全的${d.width}×${d.height}棋盘；未放宽规则`,profile:d,attempts:N};
}
function generateRange(ix,profiles,options,onProgress){let opts={...DEFAULTS,...options},lv=[],failed=[],recent=new Map(),usage={},time=Date.now();for(let i=0;i<opts.count;i++){let n=opts.start+i,x=generateOne(n,ix,profiles,opts,{recent,usage});if(x.ok){lv.push(x.level);for(let w of x.level.targets){usage[w]=(usage[w]||0)+1;recent.set(w,n);}}else failed.push(x);if(onProgress)onProgress({index:i+1,requested:opts.count,ok:x.ok,level:x.level||null,failed:x.ok?null:x,elapsed:Date.now()-time});}
 return {levels:lv,failures:failed,config:opts,elapsedMs:Date.now()-time};}
function exportGame(levels){return {kind:'word-tiles-levels-v2',version:2,levels:levels.map(l=>({id:l.id,number:l.number,width:l.width,height:l.height,rows:Array.from({length:l.height},(_,i)=>l.grid.slice(i*l.width,(i+1)*l.width).join('')),counts:l.counts,targets:l.targets,extras:l.extras}))};}
function parseCSV(text){let rows=[],cur=[],v='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){v+='"';i++}else if(c==='"')quoted=false;else v+=c;}else if(c==='"')quoted=true;else if(c===','){cur.push(v);v=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;cur.push(v);v='';if(cur.some(x=>x))rows.push(cur);cur=[];}else v+=c;}if(v||cur.length){cur.push(v);rows.push(cur)}let heads=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim());return rows.map(x=>Object.fromEntries(heads.map((k,i)=>[k,x[i]||''])));}
function historyFromLevels(levels){let recent=new Map(),usage={};for(let level of [...levels].sort((a,b)=>a.number-b.number)){for(let w of level.targets||[]){recent.set(w,level.number);usage[w]=(usage[w]||0)+1;}}return {recent,usage};}
return {DEFAULTS,stage,getProfile,targetFor,normalizeLex,buildIndex,scan,metrics,validate,generateOne,generateRange,exportGame,parseCSV,historyFromLevels,random,direction,turns,adjacencyStats};
});
