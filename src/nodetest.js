require('./gen.js'); const G=globalThis.WPGen;
const lex=require('./lex.json'), policy=require('./policy.json');
const rows=lex.g.split('\n').filter(Boolean).map(l=>{const p=l.split('\t');return {w:p[0],band:p[1],zipf:p[2]?+p[2]:null,spec:p[3]==='1'};});
const valid=new Set(rows.map(r=>r.w)); lex.v.split('\n').forEach(w=>w&&valid.add(w));
const P=G.prepare(rows,valid,policy);
const cfg={seed:1,from:1,to:+process.argv[2]||100,dStart:0.05,dEnd:0.85,period:10,relief:0.2,sizes:[[3,3],[4,2],[4,3],[5,3]],tries:80};
const out=[];const t0=Date.now();const rej={};
for(let n=cfg.from;n<=cfg.to;n++){const ex=new Set();out.slice(-10).forEach(l=>l.t.split(' ').forEach(w=>ex.add(w)));
 const r=G.generateOne(P,n,cfg,ex); Object.entries(r.reasons).forEach(([k,v])=>rej[k]=(rej[k]||0)+v);
 if(!r.level){console.log('FAIL',n);continue;} r.level.id=n; out.push(r.level);
 if(n%10==0||n<4) console.log(n,r.level.g,r.level.t,'n='+r.level.n,'tries',r.tries,'relax',r.relax,'states',r.stats.states,Date.now()-t0+'ms');}
console.log('rej',rej,'time',Date.now()-t0);
require('fs').writeFileSync('/tmp/gen_out.json',JSON.stringify(out));
