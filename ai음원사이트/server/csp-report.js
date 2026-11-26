// Count sampled violation types. URLs, referrers and document contents can include private data.
export async function cspReport(req){
 const ignored=()=>new Response(null,{status:204,headers:{'cache-control':'no-store'}});
 const origin=new URL(req.url).origin;
 if(req.method!=='POST'||req.headers.get('origin')!==origin||!req.headers.get('content-type')?.startsWith('application/csp-report')||Number(req.headers.get('content-length'))>8192||!req.body||Math.random()>=0.01)return ignored();
 const reader=req.body.getReader(), chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return ignored();}chunks.push(value);}
  const payload=await new Response(new Blob(chunks)).json();
  const directive=payload?.['csp-report']?.['effective-directive'];
  if(typeof directive==='string'&&/^(?:script|style|img|media|connect|font|frame|worker|object)-src(?:-elem|-attr)?$|^base-uri$/.test(directive))console.info('CSP report-only:',directive);
 }catch{/* Ignore malformed reports. */}finally{reader.releaseLock();}
 return ignored();
}
