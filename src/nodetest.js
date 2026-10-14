require('./gen.js'); const G=globalThis.WPGen;
const lex=require('./lex.json'), policy=require('./policy.json');
const spec=new Set(policy.specialist);
const rows=[], valid=new Set();
lex.r.forEach((blob,t)=>{
  const words=blob.split(' '), scores=lex.s[t].split(' ');
  words.forEach((w,i)=>{
    if(!w) return;
    valid.add(w);
    if(t>2) return;
    rows.push({w:w, tier:t, score:(+scores[i])/10000, spec:spec.has(w)});
  });
});
const P=G.prepare(rows,valid,policy);
const count=+process.argv[2]||100;
const cfg={seed:process.argv[3]||'test-320',from:1,to:61,dStart:0.05,dEnd:0.8,period:10,relief:0.2,sizes:[[3,3],[4,2],[4,3],[5,3]],tries:80,maxCount:9,maxStates:60000};
const out=[];const t0=Date.now();const rej={}; let failed=0;
for(let k=0;k<count;k++){
 const n=cfg.from+k;
 const ex=new Set();
 out.slice(-10).forEach(l=>l.t.split(' ').forEach(w=>ex.add(w)));
 const r=G.generateOne(P,n,cfg,ex);
 Object.entries(r.reasons).forEach(([key,v])=>rej[key]=(rej[key]||0)+v);
 if(!r.level){failed++; console.log('FAIL',n); continue;}
 r.level.id='g'+n; r.level.name='生成 '+n;
 out.push(r.level);
 if(n%10==0||n<4) console.log(n,r.level.g,r.level.t,'n='+r.level.n,'tries',r.tries,'relax',r.relax,'states',r.stats.states,Date.now()-t0+'ms');
}
console.log('made',out.length,'failed',failed,'rej',rej,'time',Date.now()-t0);
require('fs').writeFileSync('/tmp/gen_out.json',JSON.stringify(out));
