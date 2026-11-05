import {readFileSync} from 'node:fs';
import {checkProject} from './release-files.mjs';
const {policy}=checkProject();
const expected=readFileSync('dist/client/aifect-shell.txt','utf8').match(/aifect-app-[a-f0-9]{16}\.js/)?.[0];
if(!expected)throw new Error('Build first; expected client asset is missing.');
const expectedOrigin=readFileSync('work/cafe24-public/revision','utf8').trim();
function verifyOrigin(response){
 if(response.headers.get('x-aifect-web-origin')!=='cafe24'||response.headers.get('x-aifect-origin-revision')!==expectedOrigin)
  throw new Error('Cafe24 renderer is not serving the prepared release. Synchronize work/cafe24-public and ops/cafe24 before completing deployment.');
}
const home=await fetch(policy.production_url+'/',{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});
if(!home.ok||new URL(home.url).origin!==policy.production_url)throw new Error('Production URL failed');
verifyOrigin(home);
const homeHTML=await home.text();
if(!homeHTML.includes(expected))throw new Error('Production is not serving the prepared client asset');
const publicMusicPath=homeHTML.match(/href="(\/music\/[\w-]+)"/)?.[1];
if(!publicMusicPath)throw new Error('Homepage is missing its server-rendered public music links');
const song=await fetch(new URL(publicMusicPath,policy.production_url),{signal:AbortSignal.timeout(15000)});
verifyOrigin(song);
const songHTML=await song.text(),previewPath=songHTML.match(/<audio[^>]+src="(\/media\/[\w-]+\/preview)"/)?.[1];
if(!song.ok||!previewPath)throw new Error('Public music detail is missing its anonymous preview');
const preview=await fetch(new URL(previewPath,policy.production_url),{method:'HEAD',headers:{'content-length':'0'},signal:AbortSignal.timeout(15000)});
if(!preview.ok||!preview.headers.get('content-type')?.startsWith('audio/'))throw new Error('Public audio HEAD probe failed');
const ads=await fetch(policy.production_url+'/ads.txt',{signal:AbortSignal.timeout(15000)});
if(!ads.ok||!(await ads.text()).includes('google.com, pub-5910265378731607, DIRECT, f08c47fec0942fa0'))throw new Error('Verified publisher ads.txt line is missing');
const bundles=[...homeHTML.matchAll(/(?:src|href)="(\/bundles\/aifect-app-[a-f0-9]{16}\.(?:js|css))"/g)].map(m=>m[1]);
if(bundles.length!==2||!bundles.includes('/bundles/'+expected))throw new Error('Published bundle URLs differ from the prepared shell');
for(const path of bundles){
 const asset=await fetch(policy.production_url+path,{method:'HEAD',signal:AbortSignal.timeout(15000)});
 if(!asset.ok||!asset.headers.get('cache-control')?.includes('immutable'))throw new Error('Published bundle or immutable cache policy failed for '+path);
}
// Sites serves authenticated MCP on the connection URL returned by get_site.
// Its ingress may reject anonymous requests with plain text before the Worker runs.
const mcpUrl=new URL(policy.mcp_url||'/mcp',policy.production_url);
if(mcpUrl.protocol!=='https:'||mcpUrl.pathname!=='/mcp')throw new Error('Invalid verified MCP connection URL');
const denied=await fetch(mcpUrl,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),signal:AbortSignal.timeout(15000)});
if(denied.status!==401||(await denied.text()).includes('inputSchema'))throw new Error('Anonymous MCP access is not denied correctly');
console.log('Verified matching Cafe24 renderer revision, production URL, client asset, initial public catalog, anonymous preview HEAD, ads.txt and anonymous MCP denial.');
console.log('Also verify deployment ID/version using official Sites status, then authenticated discovery/read-only tools using the installed plugin. No production mutations were performed.');
