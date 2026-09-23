export const query=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
export const one=(env,sql,...args)=>query(env,sql,...args).first();
export const rows=async(env,sql,...args)=>(await query(env,sql,...args).all()).results;
export const run=(env,sql,...args)=>query(env,sql,...args).run();
export const now=()=>Math.floor(Date.now()/1000);
export const id=()=>crypto.randomUUID();
export function fail(status,message){throw Object.assign(new Error(message),{status});}
export function str(value,max=200,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(400,'입력 내용을 확인해주세요.');return value.trim();}
export const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',...headers}});
export async function rate(env,key,max,period){
 const t=now(), bucket=`${key}:${Math.floor(t/period)}`;
 const v=await query(env,'INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',bucket,t+period).first();
 if(v.count>max)fail(429,'요청이 많습니다. 잠시 후 다시 시도해주세요.');
}
