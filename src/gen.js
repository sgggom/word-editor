/* Word Tiles research-grounded editor v2 — no external libraries. CommonJS/browser UMD. */
(function(root,factory){let out=factory();if(typeof module==='object'&&module.exports)module.exports=out;else root.WTEngine=out;})(typeof self!=='undefined'?self:this,function(){
'use strict';
const ROLES=new Set(['candidate','extra','pending','blocked']);
const SEARCH_VERSION='straight-initials-v1';
const LEGACY_SEARCH_VERSION='target-only-generation-v3';
const DEFAULTS={preset:'list0',seed:'WT-2026',start:1,count:20,effort:45,attempts:100,cooldown:20,strictMorph:true,adjacency:true,allowUnsafe:false,variance:0.16,readingBias:1.0,uniqueMin:0.88,maxUse:13};
function hash(s){let h=2166136261>>>0;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}return h>>>0;}
function random(seed){let s=hash(seed)||12345;return function(){s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(a,rng){a=a.slice();for(let i=a.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function pick(a,rng){return a[Math.floor(rng()*a.length)];}
function clamp(v,l,h){return Math.max(l,Math.min(h,v));}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function requiredLettersFor(n,config={}){
 const value=config.requiredLettersByLevel?.[n];
 if(value==null)return [];
 const letters=Array.isArray(value)?value:typeof value==='string'?value.split(''):null;
 if(!letters||letters.some(c=>typeof c!=='string'||!/^[A-Z]$/.test(c)))throw new Error(`第${n}关必选字母配置无效，必须是A–Z字母`);
 return [...new Set(letters)];
}
function generationTarget(n,profiles,config){const d={...targetFor(n,config,profiles),n},required=requiredLettersFor(n,config);if(required.length)d.requiredLetters=required;return d;}
function stage(n){return n<=5?Math.max(1,n):n<=10?6:n<=20?11:n<=50?21:n<=100?51:n<=200?101:n<=500?201:n<=1000?501:1001;}
function getProfile(n,preset,profiles){const a=profiles[preset]||profiles.list0;let prof=a.find(x=>{let lo=Number(x.stage.split(/[–-]/)[0]);let hi=Number(x.stage.split(/[–-]/)[1]);return n>=lo&&n<=hi;});return prof||a[a.length-1];}
function targetFor(n,config,profiles){let rng=random(config.seed+'|profile|'+config.preset+'|'+n),p=getProfile(n,config.preset,profiles);let early=n<=5,spread=early?0:clamp(Math.round(p.k*(config.variance??.16)),1,3);let k=early?Math.round(p.k):clamp(Math.round(p.k)+(Math.floor(rng()*(spread*2+1))-spread),2,16);
 let cells=early?Math.round(p.cells):pick([8,9,9,12,12,12,15],rng);if(!early){let options=(n>20&&p.cells>=10)?[9,12,15]:[8,9,12,15];let dist=options.map(x=>Math.exp(-Math.abs(x-p.cells)*1.0)*(x===12?1.35:1));let sum=dist.reduce((x,y)=>x+y,0),v=rng()*sum;cells=options[0];for(let i=0;i<options.length;i++){v-=dist[i];if(v<=0){cells=options[i];break}}}
 const dim=cells===8?[4,2]:cells===9?[3,3]:cells===12?[4,3]:[5,3];return {...p,k,cells,width:dim[0],height:dim[1],stageStart:stage(n)};}
function normalizeLex(raw){let seen=new Set(),a=[];for(let v of raw){let word=String(v.word||'').trim().toUpperCase();if(!/^[A-Z]{2,12}$/.test(word)||seen.has(word))continue;seen.add(word);let role=ROLES.has(v.role)?v.role:'pending';a.push({...v,word,role});}return a;}
function buildIndex(lex){
 const tree={},targetTree={},byLength={},byLetter={},byWord=new Map(),acceptable=[];
 const insert=(root,word)=>{let node=root;for(const c of word)node=node[c]||(node[c]={});node.$=word;};
 for(const x of normalizeLex(lex)){
  byWord.set(x.word,x);if(x.role!=='candidate'&&x.role!=='extra')continue;acceptable.push(x);insert(tree,x.word);
  if(x.role==='candidate'){
   insert(targetTree,x.word);(byLength[x.word.length]??=[]).push(x);
   if(x.word.length>=3&&x.word.length<=8)for(const c of new Set(x.word))(byLetter[c]??=[]).push(x);
  }
 }
 return {tree,targetTree,byLength,byLetter,letterPools:new Map(),byWord,acceptable};
}
function requiredSeedPool(missing,lengths,preferredLength,ix,rng){
 let best=null;
 for(const c of missing){
  const key=lengths.join(',')+'|'+c;
  if(!ix.letterPools.has(key))ix.letterPools.set(key,(ix.byLetter[c]||[]).filter(x=>lengths.includes(x.word.length)));
  const pool=ix.letterPools.get(key);
  if(pool.length&&(!best||pool.length<best.length))best=pool;
 }
 if(!best)return null;
 const available=lengths.filter(len=>best.some(x=>x.word.length===len));
 const len=available.includes(preferredLength)?preferredLength:pick(available,rng);
 return best.filter(x=>x.word.length===len);
}
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
 const required=target.requiredLetters||[];
 const trialLen=needEarly?[3,4]:target.k<6?[4,5,6]:target.stageStart>=51?[5,6,7,8]:[4,5,6,7];
 for(let step=0;step<5&&g.some(x=>!x);step++){
  const missing=required.filter(c=>!g.includes(c));
  let len=pick(trialLen,rng),pool=ix.byLength[len]||[];
  if(missing.length){
   // Seed words help the board cover the remaining letters. Individual target
   // words are never required to contain every configured letter.
   const guidedLengths=[...new Set([...trialLen,3,4])];
   const guided=requiredSeedPool(missing,guidedLengths,rng()<.5?pick([3,4],rng):len,ix,rng);
   if(guided)pool=guided;
  }
  if(!pool.length)continue;
  let best=null;for(let a=0;a<42;a++){
    let x=pool[Math.floor(rng()*pool.length)];if(used.has(x.word))continue;
    if(recent.has(x.word)&&rng()<.85)continue;
    let scratch=g.slice(), placement=placeWord(scratch,x.word,nb,rng,18);if(!placement)continue;
    let fresh=placement.fresh; if(fresh===0&&g.some(v=>!v))continue;
    const remaining=missing.filter(c=>!scratch.includes(c));
    if(remaining.length>scratch.filter(c=>!c).length)continue;
    let score= fresh*1.5+placement.old*.5-Math.max(0,fresh-(N-g.filter(Boolean).length))*.4;
    if(missing.length)score+=(missing.length-remaining.length)*12;
    if(step===0)score+=x.word.length*.1;
    if(!best||score>best.score)best={x,scratch,placement,score};
  }
  if(best){g=best.scratch;used.add(best.x.word);seeds.push(best.x.word);}
 }
 // Fill any still-missing required letter only into an empty square. The usual
 // target/path/coverage checks below still have to prove the entire board usable.
 for(const c of required)if(!g.includes(c)){const empty=g.map((v,i)=>v?-1:i).filter(i=>i>=0);if(!empty.length)return {g,seeds,nb};g[pick(empty,rng)]=c;}
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
// Generation and target-path validation never traverse the extra-word dictionary.
function scanTargets(g,w,h,ix,cap=14){return scan(g,w,h,{tree:ix.targetTree},cap);}
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
 let score=0;score-=dist(p.straightRatio,d.straight)*4;score-=dist(p.meanTurns,d.minTurns)*3;score-=dist(p.avgWordLength,d.avgLen)*3;score-=dist(p.letterKinds,d.letterKinds)*.75;score-=dist(p.maxLayer,d.maxLayers)*.5;score-=dist(p.relPairs,d.related)*1.1;
 if(p.uniqueRatio<config.uniqueMin)score-=(config.uniqueMin-p.uniqueRatio)*20;
 if(config.adjacency)score+=p.adjScore*.2;
 let Rcount=p.dirs.R,Lcount=p.dirs.L,Ucount=p.dirs.U,Dcount=p.dirs.D;
 let rbonus=(Rcount+Ucount)-(Lcount+Dcount);
 score+=rbonus*config.readingBias;
 return {metrics:p,score,extras:extras.map(x=>x.word),adj};
}
function validate(level,ix,config){if(!level||!Array.isArray(level.grid)||!Array.isArray(level.targets))return {ok:false,errors:['格式无效']};let errors=[],w=level.width,h=level.height,g=level.grid,targets=scanTargets(g,w,h,ix,32),found=new Map(targets.map(x=>[x.word,x]));let needed=Array(g.length).fill(0);
 if(g.length!==w*h)errors.push('棋盘格数不匹配');
 try{
  const configured=requiredLettersFor(level.number,config),saved=requiredLettersFor(level.number,{requiredLettersByLevel:{[level.number]:level.requiredLetters||[]}});
  const missing=[...new Set([...configured,...saved])].filter(c=>!g.includes(c));
  if(missing.length)errors.push('棋盘缺少必选字母：'+missing.join('、'));
 }catch(error){errors.push(error.message);}
 if(!level.targets.length)errors.push('没有必答词');
 for(let t of level.targets){let x=found.get(t);if(!x)errors.push(`${t}在棋盘不可达或不在合法词库`);else if(!x.safe)errors.push(`${t}存在用格不一致的多路径，顺序安全未证明`);else for(let i of x.path)needed[i]++;
 if(ix.byWord.get(t)?.role!=='candidate')errors.push(`${t}已非必答候选`);}
 if(needed.some((v,i)=>v!==level.counts?.[i]))errors.push('逐格次数与必答路径不一致');
 if(needed.some(v=>v===0))errors.push('存在不参与必答的格子');
 if(needed.some(v=>v>config.maxUse))errors.push(`超过单格复用上限${config.maxUse}`);
 // Extra words are identified on the completed board; they cannot reject a board.
 const items=scan(g,w,h,ix,32),extras=items.filter(x=>!level.targets.includes(x.word)).map(x=>x.word);
 return {ok:errors.length===0,errors,extras,checkedPaths:items.length};
}
// An attempt has its own random stream, so dispatch order and thread count cannot change a level.
function attemptLimit(config){return Math.max(1,Math.floor(config.attempts||DEFAULTS.attempts));}
function tryAttempt(d,a,ix,config,history){
 if((d.requiredLetters||[]).length>d.cells)return null;
 if((d.requiredLetters||[]).some(c=>!ix.byLetter[c]?.length))return null;
 let rng=random(config.seed+'|'+config.preset+'|'+d.n+'|generate|attempt|'+a);
 let {g}=fillBoard(d,ix,rng,config,history.recent||new Map());
 if((d.requiredLetters||[]).some(c=>!g.includes(c)))return null;
 let items=scanTargets(g,d.width,d.height,ix,18),pickings=selectTargets(items,d,ix,config,history,rng);
 if(!pickings)return null;
 let {selected,demands}=pickings;
 let board={g,w:d.width,h:d.height,counts:demands},evaluation=metrics(board,d,items,selected,ix,config);
 let lv={id:`${config.preset}-${d.n}-${hash(g.join('')+'|'+selected.map(x=>x.word).join(',')).toString(16)}`,number:d.n,preset:config.preset,width:d.width,height:d.height,grid:g,counts:demands,targets:selected.map(x=>x.word),extras:evaluation.extras,paths:Object.fromEntries(selected.map(x=>[x.word,x.path])),source:'generated',profile:d.stage,validated:true,metrics:evaluation.metrics};
 if(d.requiredLetters?.length)lv.requiredLetters=d.requiredLetters.slice();
 const checked=validate(lv,ix,config);if(!checked.ok)return null;
 lv.extras=checked.extras;lv.metrics.extraCount=checked.extras.length;
 return {ok:true,level:lv,score:evaluation.score,attempts:a+1,profile:d};
}
function generateAttempts(n,ix,profiles,config={},history={},start=0,count=1){
 config={...DEFAULTS,...config};const d=generationTarget(n,profiles,config),out=[],end=Math.min(attemptLimit(config),start+count);
 for(let a=start;a<end;a++)out.push(tryAttempt(d,a,ix,config,history));
 return out;
}
function stopAfterAttempt(best,candidate,index,limit){return !!candidate&&best.score>=-2&&index>Math.min(15,limit/3);}
function finishGeneration(n,profiles,config,best){
 if(best)return best;
 config={...DEFAULTS,...config};const d=generationTarget(n,profiles,config),N=attemptLimit(config);
 return {ok:false,number:n,reason:`尝试${N}次后未找到满足${d.requiredLetters?.length?'必选字母 '+d.requiredLetters.join(' ')+'、':''}覆盖和全路径安全的${d.width}×${d.height}棋盘；未放宽规则`,profile:d,attempts:N};
}
function generateOne(n,ix,profiles,config={},history={}){
 config={...DEFAULTS,...config};const d=generationTarget(n,profiles,config),N=attemptLimit(config);let best=null;
 for(let a=0;a<N;a++){
  const candidate=tryAttempt(d,a,ix,config,history);
  if(candidate&&(!best||candidate.score>best.score))best=candidate;
  if(stopAfterAttempt(best,candidate,a,N))break;
 }
 return finishGeneration(n,profiles,config,best);
}
function normalizeInitials(value=''){
 const text=(Array.isArray(value)?value.join(''):String(value??'')).toUpperCase();
 if(/[^A-Z\s,，、;]/.test(text))throw new Error('起始首字母只能填写 A–Z，可用空格或逗号分隔');
 return [...new Set(text.replace(/[^A-Z]/g,''))].sort().join('');
}
function straightPaths(width,height,length){
 const paths=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const endX=x+(length-1)*dx,endY=y+(length-1)*dy;
  if(endX>=0&&endX<width&&endY>=0&&endY<height)paths.push(Array.from({length},(_,k)=>(y+k*dy)*width+x+k*dx));
 }
 return paths;
}
function straightSeedSource(target,ix){
 const key=target.width+'x'+target.height;
 ix.straightSeeds??=new Map();
 if(!ix.straightSeeds.has(key)){
  const paths=Object.fromEntries([3,4].map(length=>[length,straightPaths(target.width,target.height,length)]));
  const words=[3,4].flatMap(length=>paths[length].length?(ix.byLength[length]||[]).map(x=>x.word):[]).sort();
  ix.straightSeeds.set(key,{paths,words});
 }
 return ix.straightSeeds.get(key);
}
function productionSeedInfo(spec,ix){
 const target=poolTarget(spec),source=straightSeedSource(target,ix);
 const words=source.words.filter(word=>!target.initialLetters||target.initialLetters.includes(word[0]));
 if(!words.length)throw new Error(target.width+'×'+target.height+' 没有可直线放置的'+(target.initialLetters?' '+target.initialLetters+' 首字母':'')+' 3／4 字母必答词，请调整首字母、尺寸或来源词库');
 const available=new Set(words.map(word=>word[0]));
 return {count:words.length,missing:[...target.initialLetters].filter(c=>!available.has(c))};
}
function fillStraightBoard(target,ix,rng){
 const g=Array(target.cells).fill(''),placements=[],used=new Set(),source=straightSeedSource(target,ix);
 function fill(words,phase){
  const groups=new Map();
  for(const word of words)if(!used.has(word)){if(!groups.has(word[0]))groups.set(word[0],[]);groups.get(word[0]).push(word);}
  for(const [letter,pool] of groups)groups.set(letter,shuffle(pool,rng));
  const initials=shuffle([...groups.keys()].sort(),rng);
  let progress=true;
  while(progress&&g.includes('')){
   progress=false;
   // Give each initial one placement per round, so large groups cannot monopolize the board.
   for(const letter of initials){
    const pool=groups.get(letter);
    while(pool.length){
     const word=pool.pop(),paths=source.paths[word.length].filter(path=>path.some(i=>!g[i])&&path.every((i,k)=>!g[i]||g[i]===word[k]));
     // Filling more cells cannot make a conflicting/exhausted path viable again.
     if(!paths.length)continue;
     const path=pick(paths,rng),fresh=path.filter(i=>!g[i]).length;
     path.forEach((i,k)=>g[i]=word[k]);used.add(word);placements.push({word,path,phase,fresh});progress=true;break;
    }
   }
  }
 }
 fill(source.words.filter(word=>!target.initialLetters||target.initialLetters.includes(word[0])),'initials');
 fill(source.words,'fill');
 const freq='EEEEEEEEEEAAAAAAAOOOOOOOIIIIIIITTTTTTRRRRRRNNNNNLLLLSSSSDDCCUUUMMHPBGFVWYK';
 for(let i=0;i<g.length;i++)if(!g[i])g[i]=pick(freq,rng);
 return {g,placements};
}
function tryStraightAttempt(target,ordinal,ix,config){
 const rng=random(config.seed+'|attempt|'+ordinal),{g,placements}=fillStraightBoard(target,ix,rng);
 const items=scanTargets(g,target.width,target.height,ix,32);
 const selected=items.filter(x=>x.safe&&x.length>=3&&x.length<=8).sort((a,b)=>a.word.localeCompare(b.word));
 const words=new Set(selected.map(x=>x.word));
 if(!selected.length||placements.some(p=>!words.has(p.word)))return null;
 const counts=Array(g.length).fill(0);for(const item of selected)for(const cell of item.path)counts[cell]++;
 if(counts.some(n=>!n||n>config.maxUse))return null;
 const evaluation=metrics({g,w:target.width,h:target.height,counts},{},items,selected,ix,config);
 const level={preset:'pool',width:target.width,height:target.height,grid:g,counts,targets:selected.map(x=>x.word),extras:[],
  paths:Object.fromEntries(selected.map(x=>[x.word,x.path])),source:'generated',validated:true,metrics:evaluation.metrics,
  construction:{strategy:SEARCH_VERSION,initialLetters:target.initialLetters,placements}};
 const checked=validate(level,ix,config);if(!checked.ok)return null;
 level.extras=checked.extras;level.metrics.extraCount=checked.extras.length;
 return {ok:true,level,score:0,attempts:ordinal+1,profile:target};
}
// Candidate ordinals are reproducibility coordinates, never campaign positions.
// Explicit legacy count specs remain reproducible for saved tooling/fixtures.
function poolTarget(spec,profiles){
 const width=Number(spec.width),height=Number(spec.height),k=Number(spec.targetCount);
 if(![[4,2],[3,3],[4,3],[5,3]].some(([w,h])=>w===width&&h===height))throw new Error('生成尺寸无效');
 if(spec.strategy&&spec.strategy!==SEARCH_VERSION)throw new Error('未知的生成策略');
 if(spec.strategy===SEARCH_VERSION||spec.initialLetters!==undefined||spec.targetCount===undefined)return {width,height,cells:width*height,initialLetters:normalizeInitials(spec.initialLetters),strategy:SEARCH_VERSION};
 if(!Number.isInteger(k)||k<2||k>16)throw new Error('旧版生成目标词数量无效');
 const p=profiles.list0.map((profile,index)=>({profile,index})).sort((a,b)=>Math.abs(a.profile.k-k)-Math.abs(b.profile.k-k)||Math.abs(a.profile.cells-width*height)-Math.abs(b.profile.cells-width*height)||a.index-b.index)[0].profile;
 const from=Number(p.stage.split(/[–-]/)[0]);
 return {...p,width,height,cells:width*height,k,stageStart:stage(from),n:0};
}
function generatePoolAttempts(spec,ix,profiles,config={},start=0,count=1){
 if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(count)||count<1)throw new Error('候选范围无效');
 const d=poolTarget(spec,profiles),straight=d.strategy===SEARCH_VERSION,key=d.width+'x'+d.height+'|'+(straight?d.initialLetters:d.k);
 if(straight)productionSeedInfo(d,ix);
 config={...DEFAULTS,...config,seed:String(config.seed||DEFAULTS.seed)+'|'+(straight?SEARCH_VERSION:'inventory-v1')+'|'+key,preset:'pool',requiredLettersByLevel:undefined};
 const out=[];for(let a=start;a<start+count;a++){
  const candidate=straight?tryStraightAttempt(d,a,ix,config):tryAttempt(d,a,ix,config,{});
  if(candidate){delete candidate.level.number;candidate.level.id='candidate-'+hash(config.seed+'|'+a).toString(16);candidate.ordinal=a;}
  out.push(candidate);
 }
 return out;
}
function generateRange(ix,profiles,options,onProgress){let opts={...DEFAULTS,...options},lv=[],failed=[],recent=new Map(),usage={},time=Date.now();for(let i=0;i<opts.count;i++){let n=opts.start+i,x=generateOne(n,ix,profiles,opts,{recent,usage});if(x.ok){lv.push(x.level);for(let w of x.level.targets){usage[w]=(usage[w]||0)+1;recent.set(w,n);}}else failed.push(x);if(onProgress)onProgress({index:i+1,requested:opts.count,ok:x.ok,level:x.level||null,failed:x.ok?null:x,elapsed:Date.now()-time});}
 return {levels:lv,failures:failed,config:opts,elapsedMs:Date.now()-time};}
function exportGame(levels){return {kind:'word-tiles-levels-v2',version:2,levels:levels.map(l=>({id:l.id,number:l.number,width:l.width,height:l.height,rows:Array.from({length:l.height},(_,i)=>l.grid.slice(i*l.width,(i+1)*l.width).join('')),counts:l.counts,targets:l.targets,extras:l.extras}))};}
function parseCSV(text){let rows=[],cur=[],v='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){v+='"';i++}else if(c==='"')quoted=false;else v+=c;}else if(c==='"')quoted=true;else if(c===','){cur.push(v);v=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;cur.push(v);v='';if(cur.some(x=>x))rows.push(cur);cur=[];}else v+=c;}if(v||cur.length){cur.push(v);rows.push(cur)}let heads=(rows.shift()||[]).map(x=>x.replace(/^\uFEFF/,'').trim());return rows.map(x=>Object.fromEntries(heads.map((k,i)=>[k,x[i]||''])));}
function historyFromLevels(levels){let recent=new Map(),usage={};for(let level of [...levels].sort((a,b)=>a.number-b.number)){for(let w of level.targets||[]){recent.set(w,level.number);usage[w]=(usage[w]||0)+1;}}return {recent,usage};}
return {DEFAULTS,SEARCH_VERSION,LEGACY_SEARCH_VERSION,normalizeInitials,productionSeedInfo,stage,getProfile,targetFor,requiredLettersFor,normalizeLex,buildIndex,scan,scanTargets,metrics,validate,attemptLimit,generateAttempts,stopAfterAttempt,finishGeneration,generateOne,poolTarget,generatePoolAttempts,generateRange,exportGame,parseCSV,historyFromLevels,random,direction,turns,adjacencyStats};
});
