// Ported from the user-provided leveleditor calibrated vocabulary page.
// Standalone geometry only; no source page data, UI or runtime dependencies.
/* Area-proportional Venn geometry for 1–7 circles. Browser helper + CommonJS tests. */
(function (root) {
  'use strict';
  const PI = Math.PI, TAU = 2 * PI;
  const COLORS = ['#80aec9','#efb77f','#8cbf91','#b398cd','#cf9da7','#87bdb9','#c5a660'];
  const escapeText = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = value => Number(value).toLocaleString('zh-CN');
  const fixed = value => Number(value.toFixed(6));
  const clamp = (value,low,high) => Math.max(low,Math.min(high,value));
  const layoutCache = new Map();
  const CACHE_LIMIT = 24;

  function circleIntersectionArea(r1,r2,distance) {
    if (![r1,r2,distance].every(Number.isFinite)||r1<0||r2<0||distance<0) throw new RangeError('Invalid circle geometry');
    if (!r1||!r2||distance>=r1+r2) return 0;
    if (distance<=Math.abs(r1-r2)) return PI*Math.min(r1,r2)**2;
    const product=(-distance+r1+r2)*(distance+r1-r2)*(distance-r1+r2)*(distance+r1+r2);
    const h=Math.sqrt(Math.max(0,product))/(2*distance);
    const x1=(distance*distance+(r1-r2)*(r1+r2))/(2*distance),x2=distance-x1;
    const a=Math.atan2(h,x1),b=Math.atan2(h,x2);
    const segment=t=>t<.001?(2/3*t**3-2/15*t**5+4/315*t**7-2/2835*t**9):t-Math.sin(t)*Math.cos(t);
    return Math.max(0,r1*r1*segment(a)+r2*r2*segment(b));
  }

  function distanceForIntersection(r1,r2,targetArea) {
    const maximum=PI*Math.min(r1,r2)**2;
    if (!r1||!r2||targetArea<=0) return (r1+r2)*1.08;
    if (targetArea>=maximum*(1-1e-13)) return 0;
    let lower=Math.abs(r1-r2),upper=r1+r2;
    for(let i=0;i<90;i++){
      const middle=(lower+upper)/2;
      if(circleIntersectionArea(r1,r2,middle)>targetArea)lower=middle;else upper=middle;
    }
    return (lower+upper)/2;
  }

  function regionCount(value) {
    if(Array.isArray(value))return value.length;
    if(value instanceof Set)return value.size;
    if(typeof value==='number'&&value>=0&&Number.isFinite(value))return value;
    if(value&&typeof value.count==='number'&&Number.isFinite(value.count)&&value.count>=0)return value.count;
    return 0;
  }

  function countRegions(partition,n) {
    const source=partition&&partition.regions,regions=new Map();
    for(let mask=1;mask<(1<<n);mask++)regions.set(mask,regionCount(source instanceof Map?source.get(mask):source&&source[mask]));
    return regions;
  }

  function summarize(regions,n) {
    const sizes=Array(n).fill(0),intersections=Array.from({length:n},()=>Array(n).fill(0));
    for(const [mask,count] of regions){
      if(!count)continue;
      const active=[];
      for(let i=0;i<n;i++)if(mask&(1<<i)){sizes[i]+=count;active.push(i);}
      for(const i of active)for(const j of active)intersections[i][j]+=count;
    }
    return {sizes,intersections};
  }

  // Classical MDS with a deterministic Jacobi eigensolver, at most seven points.
  function mdsSeed(distances) {
    const n=distances.length,squares=distances.map(row=>row.map(d=>d*d));
    const means=squares.map(row=>row.reduce((a,b)=>a+b,0)/n),mean=means.reduce((a,b)=>a+b,0)/n;
    const matrix=squares.map((row,i)=>row.map((d,j)=>-.5*(d-means[i]-means[j]+mean)));
    const vectors=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
    for(let iteration=0;iteration<150;iteration++){
      let p=0,q=1,largest=0;
      for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(Math.abs(matrix[i][j])>largest){largest=Math.abs(matrix[i][j]);p=i;q=j;}
      if(largest<1e-12)break;
      const angle=.5*Math.atan2(2*matrix[p][q],matrix[q][q]-matrix[p][p]),c=Math.cos(angle),s=Math.sin(angle);
      const pp=matrix[p][p],qq=matrix[q][q],pq=matrix[p][q];
      for(let i=0;i<n;i++)if(i!==p&&i!==q){const ip=matrix[i][p],iq=matrix[i][q];matrix[i][p]=matrix[p][i]=c*ip-s*iq;matrix[i][q]=matrix[q][i]=s*ip+c*iq;}
      matrix[p][p]=c*c*pp-2*c*s*pq+s*s*qq;matrix[q][q]=s*s*pp+2*c*s*pq+c*c*qq;matrix[p][q]=matrix[q][p]=0;
      for(let i=0;i<n;i++){const ip=vectors[i][p],iq=vectors[i][q];vectors[i][p]=c*ip-s*iq;vectors[i][q]=s*ip+c*iq;}
    }
    const ranked=Array.from({length:n},(_,i)=>i).sort((a,b)=>matrix[b][b]-matrix[a][a]||a-b);
    return Array.from({length:n},(_,i)=>[0,1].map(axis=>vectors[i][ranked[axis]]*Math.sqrt(Math.max(0,matrix[ranked[axis]][ranked[axis]]))));
  }

  function normalizeSeed(seed) {
    const shifted=seed.map(p=>[p[0]-seed[0][0],p[1]-seed[0][1]]);
    const angle=Math.atan2(shifted[1][1],shifted[1][0]),c=Math.cos(angle),s=Math.sin(angle);
    return shifted.map(p=>[p[0]*c+p[1]*s,-p[0]*s+p[1]*c]);
  }

  function buildRawGeometry(sizes,intersections) {
    const largest=Math.max(0,...sizes);
    const circles=sizes.map((size,index)=>({x:0,y:0,r:largest?Math.sqrt(size/largest):0,size,index}));
    const groups=[];
    for(let i=0;i<sizes.length;i++){
      if(!sizes[i])continue;
      const group=groups.find(g=>sizes[g[0]]===sizes[i]&&intersections[g[0]][i]===sizes[i]);
      if(group)group.push(i);else groups.push([i]);
    }
    if(groups.length<2)return {circles,groups,objective:0};
    groups.sort((a,b)=>sizes[b[0]]-sizes[a[0]]||a[0]-b[0]);
    const ideal=(i,j)=>distanceForIntersection(circles[i].r,circles[j].r,PI*intersections[i][j]/largest);
    let second=1;
    for(let i=2;i<groups.length;i++)if(ideal(groups[0][0],groups[i][0])>ideal(groups[0][0],groups[second][0]))second=i;
    [groups[1],groups[second]]=[groups[second],groups[1]];
    const reps=groups.map(g=>g[0]),m=reps.length,distances=reps.map(i=>reps.map(j=>i===j?0:ideal(i,j)));
    if(m===2){for(const i of groups[1])circles[i].x=distances[0][1];return {circles,groups,objective:0};}
    if(Math.max(...distances.flat())<1e-12)return {circles,groups,objective:0};
    const pairs=[];
    for(let i=0;i<m;i++)for(let j=i+1;j<m;j++){
      const a=reps[i],b=reps[j],minimum=PI*Math.min(circles[a].r,circles[b].r)**2;
      pairs.push({i,j,r1:circles[a].r,r2:circles[b].r,target:PI*intersections[a][b]/largest,
                  denominator:Math.max(minimum,1e-14),weight:.25+.75*Math.sqrt(Math.min(sizes[a],sizes[b])/largest),ideal:distances[i][j]});
    }
    const objective=positions=>{
      let score=0;
      for(const p of pairs){
        const distance=Math.hypot(positions[p.i][0]-positions[p.j][0],positions[p.i][1]-positions[p.j][1]);
        const error=(circleIntersectionArea(p.r1,p.r2,distance)-p.target)/p.denominator;
        score+=p.weight*error*error+1e-7*((distance-p.ideal)/(p.r1+p.r2))**2;
      }
      return score;
    };
    const mds=mdsSeed(distances),seeds=[mds,mds.map(p=>p.map(x=>x*.86)),mds.map(p=>p.map(x=>x*1.14))];
    seeds.push(reps.map((_,i)=>i?[distances[0][i]*Math.cos(TAU*(i-1)/(m-1)),distances[0][i]*Math.sin(TAU*(i-1)/(m-1))]:[0,0]));
    const average=distances.flat().reduce((a,b)=>a+b,0)/(m*(m-1));
    seeds.push(reps.map((_,i)=>[average*.8*Math.cos(TAU*i/m),average*.8*Math.sin(TAU*i/m)]));
    let winner=null,bestScore=Infinity;
    for(const seed of seeds){
      let positions=normalizeSeed(seed),score=objective(positions),step=.32;
      for(let iteration=0;iteration<240&&step>2e-5&&score>1e-20;iteration++){
        let improved=false;
        for(let i=1;i<m;i++)for(let axis=0;axis<2;axis++){
          if(i===1&&axis===1)continue;
          for(const sign of [-1,1]){
            const previous=positions[i][axis];positions[i][axis]=previous+sign*step;
            if(i===1)positions[i][0]=Math.max(0,positions[i][0]);
            const next=objective(positions);
            if(next<score-1e-15){score=next;improved=true;}else positions[i][axis]=previous;
          }
        }
        if(!improved)step*=.62;
      }
      if(score<bestScore){bestScore=score;winner=positions.map(p=>p.slice());}
    }
    const firstY=winner.slice(2).find(p=>Math.abs(p[1])>1e-9);
    if(firstY&&firstY[1]<0)winner.forEach(p=>p[1]*=-1);
    groups.forEach((group,j)=>group.forEach(i=>{circles[i].x=winner[j][0];circles[i].y=winner[j][1];}));
    return {circles,groups,objective:bestScore};
  }

  function fitGeometry(circles,box) {
    const active=circles.filter(c=>c.r>0);
    if(!active.length)return circles.map(c=>({...c,x:box.x+box.width/2,y:box.y+box.height/2,r:0}));
    const minX=Math.min(...active.map(c=>c.x-c.r)),maxX=Math.max(...active.map(c=>c.x+c.r));
    const minY=Math.min(...active.map(c=>c.y-c.r)),maxY=Math.max(...active.map(c=>c.y+c.r));
    const scale=Math.min(box.width/(maxX-minX),box.height/(maxY-minY));
    const left=box.x+(box.width-(maxX-minX)*scale)/2,top=box.y+(box.height-(maxY-minY)*scale)/2;
    return circles.map(c=>({...c,x:left+(c.x-minX)*scale,y:top+(c.y-minY)*scale,r:c.r*scale}));
  }

  function maskAt(x,y,circles) {
    let mask=0;
    for(let i=0;i<circles.length;i++){const c=circles[i];if(c.r>0&&(x-c.x)**2+(y-c.y)**2<=c.r*c.r)mask|=1<<i;}
    return mask;
  }

  function rectangleInRegion(x,y,halfWidth,halfHeight,mask,circles) {
    for(let i=0;i<circles.length;i++){
      const c=circles[i],inside=Boolean(mask&(1<<i));
      if(!c.r){if(inside)return false;continue;}
      if(inside){if(Math.hypot(Math.abs(x-c.x)+halfWidth,Math.abs(y-c.y)+halfHeight)>c.r-3)return false;}
      else if(Math.hypot(Math.max(Math.abs(x-c.x)-halfWidth,0),Math.max(Math.abs(y-c.y)-halfHeight,0))<c.r+3)return false;
    }
    return true;
  }

  function sameCircle(a,b) {return Math.hypot(a.x-b.x,a.y-b.y)<1e-7&&Math.abs(a.r-b.r)<1e-7;}

  function arcPath(c,start,end) {
    const point=angle=>[fixed(c.x+c.r*Math.cos(angle)),fixed(c.y+c.r*Math.sin(angle))];
    const [sx,sy]=point(start),[ex,ey]=point(end),r=fixed(c.r),span=end-start;
    if(span>TAU-1e-7){const [mx,my]=point(start+PI);return `M ${sx} ${sy} A ${r} ${r} 0 1 1 ${mx} ${my} A ${r} ${r} 0 1 1 ${ex} ${ey}`;}
    return `M ${sx} ${sy} A ${r} ${r} 0 ${span>PI?1:0} 1 ${ex} ${ey}`;
  }

  // One arrangement/grid scan supplies every mask, rather than 127 full scans.
  function scanRegions(circles,regions,box) {
    const stats=new Map(),labels=new Map(),arcs=[];
    const positive=circles.filter(c=>c.r>0),unique=[];
    for(const c of positive)if(!unique.some(other=>sameCircle(c,other)))unique.push(c);
    const record=(x,y,fromGrid=false)=>{
      const mask=maskAt(x,y,circles);if(!mask)return 0;
      const clearance=Math.min(...positive.map(c=>Math.abs(Math.hypot(x-c.x,y-c.y)-c.r)));
      if(clearance<1e-7)return 0;
      let stat=stats.get(mask);
      if(!stat){stat={mask,gridHits:0,bestClearance:clearance,witness:{x,y}};stats.set(mask,stat);}
      if(fromGrid)stat.gridHits++;
      if(clearance>stat.bestClearance){stat.bestClearance=clearance;stat.witness={x,y};}
      const count=regions.get(mask)||0,width=Math.max(39,format(count).length*11+16);
      if(count&&clearance>=17&&rectangleInRegion(x,y,width/2,17,mask,circles)){
        const old=labels.get(mask);
        if(!old||clearance>old.clearance)labels.set(mask,{x,y,width,height:34,mask,count,clearance});
      }
      return mask;
    };
    for(const c of positive)record(c.x,c.y);
    const step=3;
    for(let y=box.y+1.5;y<box.y+box.height;y+=step)for(let x=box.x+1.5;x<box.x+box.width;x+=step)record(x,y,true);
    for(const c of unique){
      const angles=[0];
      for(const other of unique){
        if(other===c)continue;
        const distance=Math.hypot(other.x-c.x,other.y-c.y);
        if(distance<1e-9||distance>c.r+other.r+1e-8||distance<Math.abs(c.r-other.r)-1e-8)continue;
        const base=Math.atan2(other.y-c.y,other.x-c.x);
        const delta=Math.acos(clamp((c.r*c.r+distance*distance-other.r*other.r)/(2*c.r*distance),-1,1));
        for(const angle of [base-delta,base+delta])angles.push(((angle%TAU)+TAU)%TAU);
      }
      angles.sort((a,b)=>a-b);
      const cuts=angles.filter((angle,i)=>!i||angle-angles[i-1]>1e-9);
      for(let i=0;i<cuts.length;i++){
        const start=cuts[i],end=i+1<cuts.length?cuts[i+1]:cuts[0]+TAU;
        if(end-start<1e-9)continue;
        const middle=(start+end)/2,nx=Math.cos(middle),ny=Math.sin(middle),x=c.x+c.r*nx,y=c.y+c.r*ny;
        const others=unique.filter(other=>other!==c);
        const otherClearance=others.length?Math.min(...others.map(other=>Math.abs(Math.hypot(x-other.x,y-other.y)-other.r))):Infinity;
        const epsilon=Math.min(.6,c.r*.015,otherClearance*.2);
        if(epsilon<1e-8)continue;
        const inner=record(x-epsilon*nx,y-epsilon*ny),outer=record(x+epsilon*nx,y+epsilon*ny);
        if(inner||outer)arcs.push({circleIndex:c.index,inner,outer,path:arcPath(c,start,end),start,end});
      }
    }
    return {stats,labels,arcs,step};
  }

  function layoutFor(regions,sizes,intersections,n,options) {
    const rows=n>3?Math.ceil(n/3):1,legendHeight=n>3?rows*64:85;
    const box={x:38,y:legendHeight+20,width:684,height:n>3?430:374};
    const key=n+'|'+[...regions.values()].join(',');
    if(options.cache!==false&&layoutCache.has(key)){
      const cached=layoutCache.get(key);layoutCache.delete(key);layoutCache.set(key,cached);
      return {...cached,cacheHit:true};
    }
    const raw=buildRawGeometry(sizes,intersections),geometry=fitGeometry(raw.circles,box);
    const scan=scanRegions(geometry,regions,box);
    const result={geometry,box,scan,groups:raw.groups,objective:raw.objective,cacheKey:key,cacheHit:false};
    if(options.cache!==false){layoutCache.set(key,result);while(layoutCache.size>CACHE_LIMIT)layoutCache.delete(layoutCache.keys().next().value);}
    return result;
  }

  function regionDescription(mask,entries,short) {
    const included=[],excluded=[];
    entries.forEach((entry,i)=>(mask&(1<<i)?included:excluded).push(short?String.fromCharCode(65+i):entry.label));
    return included.join(' ∩ ')+(excluded.length?'（不含 '+excluded.join('、')+'）':'（全部共有）');
  }

  function lineWrap(text,maxChars) {
    if(Array.from(String(text)).length<=maxChars)return [String(text)];
    const words=String(text).split(' '),lines=[''];
    for(const word of words){const i=lines.length-1;if((lines[i]+' '+word).trim().length<=maxChars)lines[i]=(lines[i]+' '+word).trim();else lines.push(word);}
    return lines.flatMap(line=>line.length>maxChars?[line.slice(0,maxChars),line.slice(maxChars)]:[line]).slice(0,2);
  }

  function buildProportionalVenn(entries,partition,chosenMask,filterLabel,options={}) {
    const n=entries.length;
    if(n<1||n>7)throw new RangeError('Area-proportional Venn supports 1–7 sets');
    const regions=countRegions(partition,n),{sizes,intersections}=summarize(regions,n);
    const layout=layoutFor(regions,sizes,intersections,n,options),geometry=layout.geometry,box=layout.box;
    const requestedMask=chosenMask===null||chosenMask===undefined?(1<<n)-1:Number(chosenMask);
    const selectedMask=Number.isInteger(requestedMask)&&requestedMask>0&&requestedMask<(1<<n)?requestedMask:0;
    const selectedCount=regions.get(selectedMask)||0,selectedStat=layout.scan.stats.get(selectedMask);
    const selectedMasks=new Set((Array.isArray(options.selectedMasks)?options.selectedMasks:[selectedMask]).map(Number).filter(mask=>Number.isInteger(mask)&&mask>0&&mask<(1<<n)));
    const areaMasks=[...selectedMasks].filter(mask=>(regions.get(mask)||0)>0&&layout.scan.stats.has(mask));
    const anySelectedArea=areaMasks.length>0;
    const selectedHasArea=Boolean(selectedMasks.has(selectedMask)&&selectedCount&&selectedStat),selectedVisible=selectedHasArea;
    const maxLabels=n<=3?7:clamp(Number.isFinite(options.maxInteriorLabels)?Math.floor(options.maxInteriorLabels):12,0,12);
    let interior=[...layout.scan.labels.values()].sort((a,b)=>b.count-a.count||a.mask-b.mask).slice(0,maxLabels);
    if(maxLabels&&layout.scan.labels.has(selectedMask)&&!interior.some(p=>p.mask===selectedMask)){
      if(interior.length===maxLabels)interior.pop();interior.push(layout.scan.labels.get(selectedMask));
    }
    const interiorMasks=new Set(interior.map(p=>p.mask));
    const external=[...regions].filter(([mask])=>!interiorMasks.has(mask)).map(([mask,count])=>({mask,count}));
    const footerY=box.y+box.height+25,externalStart=footerY+31;
    const height=n<=3&&external.length?externalStart+Math.ceil(external.length/3)*62+13:footerY+(n>3?43:29);
    const note=n>=3?'圆面积按真实词数比例；多圆交叠面积近似，精确词数以区域数字和组合列表为准。':n===2?'圆面积及交叠面积按词数比例；区域数字为精确词数。':'圆面积按词数比例；区域数字为精确词数。';
    let defs=geometry.map((c,i)=>`<clipPath id="pv-clip-${i}"><circle cx="${fixed(c.x)}" cy="${fixed(c.y)}" r="${fixed(c.r)}"/></clipPath>`).join('');
    let highlight='';
    if(anySelectedArea){
      defs+=`<pattern id="pv-selected-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="9" stroke="white" stroke-opacity=".48" stroke-width="2"/></pattern>`;
      const pieces=areaMasks.map(mask=>{
        defs+=`<mask id="pv-selected-exclude-${mask}"><rect width="760" height="${height}" fill="white"/>${geometry.filter((c,i)=>c.r>0&&!(mask&(1<<i))).map(c=>`<circle cx="${fixed(c.x)}" cy="${fixed(c.y)}" r="${fixed(c.r)}" fill="black"/>`).join('')}</mask>`;
        let fill=`<g mask="url(#pv-selected-exclude-${mask})"><rect width="760" height="${height}" fill="#1c70d6" fill-opacity=".76"/><rect width="760" height="${height}" fill="url(#pv-selected-hatch)"/></g>`;
        geometry.forEach((c,i)=>{if(mask&(1<<i))fill=`<g clip-path="url(#pv-clip-${i})">${fill}</g>`;});
        const boundary=layout.scan.arcs.filter(arc=>arc.inner===mask||arc.outer===mask).map(arc=>arc.path).join(' ');
        const outline=boundary?`<path d="${boundary}" fill="none" stroke="white" stroke-width="4" stroke-linejoin="round"/><path d="${boundary}" fill="none" stroke="#0753a9" stroke-width="1.6" stroke-linejoin="round"/>`:'';
        return `<g data-selection-mask="${mask}" data-count="${regions.get(mask)||0}">${fill}${outline}</g>`;
      }).join('');
      highlight=`<g id="selected-region-highlight" data-testid="selected-region-highlight" data-selected-masks="${[...selectedMasks].join(',')}" pointer-events="none">${pieces}</g>`;
    }
    const circles=geometry.filter(c=>c.r>0).map(c=>`<circle data-set-index="${c.index}" data-count="${c.size}" data-testid="venn-circle-${c.index}" cx="${fixed(c.x)}" cy="${fixed(c.y)}" r="${fixed(c.r)}" fill="${escapeText(entries[c.index].color||COLORS[c.index])}" fill-opacity="${anySelectedArea?'.12':n>3?'.28':'.45'}" stroke="${escapeText(entries[c.index].color||COLORS[c.index])}" stroke-opacity="${anySelectedArea?'.43':'.94'}" stroke-width="1.8"><title>${escapeText(entries[c.index].label)}：${format(c.size)} 词</title></circle>`).join('');
    const legends=entries.map((entry,i)=>{
      const row=n>3?Math.floor(i/3):0,column=n>3?i%3:i,columns=n>3?Math.min(3,n-row*3):n;
      const x=760*(column+.5)/columns,base=n>3?row*64:0,lines=lineWrap(entry.label,n>=3?24:32);
      const name=lines.map((line,j)=>`<tspan x="${fixed(x)}" dy="${j?16:0}">${escapeText((j?'':String.fromCharCode(65+i)+' · ')+line)}</tspan>`).join('');
      const y=base+(n>3?17:25),countY=base+(n>3?(lines.length>1?49:35):(lines.length>1?67:49));
      return `<text x="${fixed(x)}" y="${y}" text-anchor="middle" fill="#20374f" font-size="${n>3?13:15}" font-weight="600">${name}</text><text x="${fixed(x)}" y="${countY}" text-anchor="middle" fill="#536a7c" font-size="${n>3?13:16}">${format(sizes[i])} 词${sizes[i]===0?' · 空集合':''}</text><rect x="${fixed(x-53)}" y="${base+(n>3?57:79)}" width="106" height="3" rx="1.5" fill="${escapeText(entry.color||COLORS[i])}"/>`;
    }).join('');
    const interiorLabels=interior.map(p=>{
      const selected=selectedMasks.has(p.mask);
      return `<g class="region-target" role="button" tabindex="0" data-mask="${p.mask}" data-testid="region-${p.mask}" aria-label="${escapeText(regionDescription(p.mask,entries,false))}：${p.count} 个词" aria-pressed="${selected}"><title>${escapeText(regionDescription(p.mask,entries,false))}：${format(p.count)} 个词；${Array.isArray(options.selectedMasks)?(selected?'点击取消选择':'点击选中'):'点击查看'}</title><rect x="${fixed(p.x-p.width/2)}" y="${fixed(p.y-17)}" width="${p.width}" height="34" rx="8" fill="${selected?'#064c9b':'white'}" fill-opacity="${selected?'1':'.72'}" stroke="${selected?'white':'#ffffff77'}" stroke-width="${selected?'1.8':'1'}"/><text x="${fixed(p.x)}" y="${fixed(p.y+7)}" text-anchor="middle" fill="${selected?'white':'#173047'}" font-size="22" font-weight="650" style="pointer-events:none">${format(p.count)}</text></g>`;
    }).join('');
    const externalLabels=n<=3?external.map((p,j)=>{
      const x=19+(j%3)*244,y=externalStart+Math.floor(j/3)*62,selected=selectedMasks.has(p.mask);
      return `<g class="region-target" role="button" tabindex="0" data-mask="${p.mask}" data-testid="region-${p.mask}" data-placement="external" aria-label="${escapeText(regionDescription(p.mask,entries,false))}：${p.count} 个词" aria-pressed="${selected}"><title>${escapeText(regionDescription(p.mask,entries,false))}：${format(p.count)} 个词；${Array.isArray(options.selectedMasks)?(selected?'点击取消选择':'点击选中'):'点击查看'}</title><rect x="${x}" y="${y}" width="234" height="53" rx="8" fill="${selected?'#e0edff':'#f5f7fa'}" stroke="${selected?'#1768cd':'#e2e8ee'}" stroke-width="${selected?'2.5':'1'}"/><text x="${x+11}" y="${y+18}" fill="#617386" font-size="11.7">${escapeText(regionDescription(p.mask,entries,true))}</text><text x="${x+11}" y="${y+41}" fill="#20374f" font-size="19" font-weight="650">${format(p.count)}<tspan font-size="11" font-weight="400"> 词</tspan></text></g>`;
    }).join(''):'';
    const empty=sizes.every(size=>size===0)?`<text x="380" y="${fixed(box.y+box.height/2)}" text-anchor="middle" fill="#718397" font-size="18">所选词库均为 0 词 · 无面积可绘制</text>`:'';
    const equalGroups=layout.groups.filter(group=>group.length>1).map(group=>group.map(i=>String.fromCharCode(65+i)).join(' = '));
    let footer=`<text x="380" y="${footerY}" text-anchor="middle" font-size="11.6" fill="#617386">圆面积 ∝ 词数${equalGroups.length?' · '+escapeText(equalGroups.join('；'))+'，圆完全重合':''}</text>`;
    if(n>3)footer+=`<text x="380" y="${footerY+21}" text-anchor="middle" fill="#718397" font-size="11">多圆交叠仅作近似；全部精确组合可在下方列表选择。</text>`;
    else if(external.length)footer+=`<text x="20" y="${externalStart-10}" fill="#718397" font-size="10.6">图内空间不足、无法准确表达或为 0 的区域，精确词数列于图下：</text>`;
    const markup=`<svg id="venn-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 ${height}" role="img" aria-label="${escapeText(n+' 集合面积比例韦恩图；'+filterLabel)}" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif"><title>${escapeText(entries.map(e=>e.label).join('、'))} · ${escapeText(filterLabel)}</title><desc>${escapeText(note)} 半径按词数平方根缩放。空集合不绘制圆。选中精确几何区域以蓝色条纹及边界高亮。</desc><defs>${defs}</defs><rect width="760" height="${height}" fill="white"/>${circles}${highlight}${legends}${interiorLabels}${empty}${footer}${externalLabels}</svg>`;
    const regionDiagnostics=[...regions].map(([mask,count])=>{
      const stat=layout.scan.stats.get(mask),hasArea=Boolean(count&&stat);
      return {mask,count,geometricallyPresent:Boolean(stat),hasArea,visible:hasArea,approxPixelArea:stat?stat.gridHits*layout.scan.step**2:0,witness:stat?{...stat.witness}:null,labelAvailable:layout.scan.labels.has(mask)};
    });
    const positive=geometry.find(c=>c.size>0);
    return {markup,geometry:geometry.map(c=>({...c})),note,diagnostics:{sizes,intersections,regions:regionDiagnostics,
      selectedMask,selectedCount,selectedHasArea,selectedVisible,selectedMasks:[...selectedMasks],selectedTotal:[...selectedMasks].reduce((sum,mask)=>sum+(regions.get(mask)||0),0),selectedLabelVisible:interiorMasks.has(selectedMask),
      interior:interior.map(p=>({...p})),external,areaPerWord:positive?PI*positive.r**2/positive.size:null,
      cacheHit:layout.cacheHit,layoutObjective:layout.objective,duplicateGroups:layout.groups.filter(group=>group.length>1).map(group=>group.slice()),
      representedNonZeroCount:regionDiagnostics.filter(region=>region.hasArea).length,nonZeroRegionCount:[...regions.values()].filter(Boolean).length}};
  }

  function clearLayoutCache(){layoutCache.clear();}
  root.buildProportionalVenn=buildProportionalVenn;
  const api={buildProportionalVenn,circleIntersectionArea,distanceForIntersection,maskAt,rectangleInRegion,clearLayoutCache};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.ProportionalVenn=api;
})(typeof globalThis!=='undefined'?globalThis:this);
