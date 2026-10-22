'use strict';
let arrangementJob=null;
self.onmessage=({data})=>{
 if(data.type==='cancel'){if(arrangementJob)arrangementJob.cancelled=true;return;}
 if(data.type!=='arrange'||arrangementJob)return;
 const job={cancelled:false};arrangementJob=job;
 const iterator=WPArrangement.solveSteps(data.plan,data.entries,{cancelled:()=>job.cancelled});
 function pump(){
  try{const step=iterator.next();if(step.done){self.postMessage({type:'result',result:step.value});arrangementJob=null;}
   else{self.postMessage({type:'progress',progress:step.value});setTimeout(pump,0);}}
  catch(error){arrangementJob=null;self.postMessage({type:'error',message:error.message||String(error)});}
 }
 pump();
};
