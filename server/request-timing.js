// Bounded read diagnostics: never retain SQL, parameters, results, cookies or IDs.
const paths=new Set(['/api/me','/api/library','/api/studio','/api/catalog','/api/search','/api/discovery','/api/discovery/profiles','/api/decorations/avatars','/api/community','/api/dm/summary','/api/notifications/summary','/api/karaoke','/api/play/works']);
function routeName(req){
 if(req.method!=='GET')return null;
 const path=new URL(req.url).pathname;if(paths.has(path))return path;
 const match=path.match(/^\/api\/(producers|artists|tracks)\/[\w-]+(?:\/(preview|comments|covers|gifts|gallery))?$/);
 return match?'/api/'+match[1]+'/:id'+(match[2]?'/'+match[2]:''):null;
}
const round=n=>Math.round(n*100)/100;
function safeMeta(meta){
 if(!meta||typeof meta!=='object')return {};
 const data={},sql=meta.timings?.sql_duration_ms??meta.duration;
 if(Number.isFinite(sql))data.sql_ms=round(sql);
 for(const key of ['rows_read','rows_written'])if(Number.isFinite(meta[key]))data[key]=meta[key];
 if(['WNAM','ENAM','WEUR','EEUR','APAC','OC'].includes(meta.served_by_region))data.region=meta.served_by_region;
 if(/^[A-Z]{3}$/.test(meta.served_by_colo||''))data.colo=meta.served_by_colo;
 if(typeof meta.served_by_primary==='boolean')data.primary=meta.served_by_primary;
 return data;
}
function measuredDatabase(db,state,clock){
 const originals=new WeakMap();
 const observe=async(method,invoke)=>{
  const start=clock();let value,failed=false;
  try{value=await invoke();return value;}catch(error){failed=true;throw error;}
  finally{
   // Background operations finishing after the response are not response time.
   if(!state.finished&&state.operations.length<32){
    const record={method,wall_ms:round(clock()-start),...safeMeta(value?.meta)};
    if(failed)record.failed=true;
    if(method==='batch')record.statements=(value||[]).slice(0,16).map(item=>safeMeta(item.meta));
    state.operations.push(record);
   }
  }
 };
 const statement=target=>{
  const proxy=new Proxy(target,{get(target,key){
   if(key==='bind')return (...args)=>statement(target.bind(...args));
   if(['first','all','run','raw'].includes(key))return (...args)=>observe(key,()=>target[key](...args));
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});originals.set(proxy,target);return proxy;
 };
 return new Proxy(db,{get(target,key){
  if(key==='prepare')return sql=>statement(target.prepare(sql));
  if(key==='batch')return statements=>observe('batch',()=>target.batch(statements.map(s=>originals.get(s)||s)));
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
export async function observeReadRequest(req,env,ctx,handle,{clock=()=>performance.now(),log=value=>console.log(JSON.stringify(value))}={}){
 const route=routeName(req);if(!route||!env.DB)return handle(req,env,ctx);
 const start=clock(),state={operations:[],finished:false};
 let response;
 try{response=await handle(req,{...env,DB:measuredDatabase(env.DB,state,clock)},ctx);}
 finally{state.finished=true;}
 const elapsed=round(clock()-start),probe=req.headers.get('x-aifect-timing')==='1';
 if(probe||elapsed>=1000){
  const ray=req.headers.get('cf-ray')||'',colo=req.cf?.colo;
  const event={event:'aifect_read_timing',route,status:response.status,response_ms:elapsed,completed_db_operations:state.operations};
  if(/^[\da-f]{16,32}(?:-[A-Z]{3})?$/i.test(ray))event.ray=ray;
  if(/^[A-Z]{3}$/.test(colo||''))event.colo=colo;
  log(event);
 }
 if(!probe)return response;
 const headers=new Headers(response.headers);
 headers.set('server-timing','aifect;dur='+elapsed+state.operations.map((op,i)=>', db'+i+';dur='+op.wall_ms+';desc="'+op.method+(op.sql_ms===undefined?'':';sql_ms='+op.sql_ms)+(op.region?';region='+op.region:'')+(op.colo?';colo='+op.colo:'')+'"').join(''));
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
