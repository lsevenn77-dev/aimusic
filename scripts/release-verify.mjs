import {readFileSync} from 'node:fs';
import {checkProject} from './release-files.mjs';
const {policy}=checkProject();
const expected=readFileSync('dist/client/index.html','utf8').match(/aifect-app-[a-f0-9]{16}\.js/)?.[0];
if(!expected)throw new Error('Build first; expected client asset is missing.');
const home=await fetch(policy.production_url+'/',{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(15000)});
if(!home.ok||new URL(home.url).origin!==policy.production_url)throw new Error('Production URL failed');
if(!(await home.text()).includes(expected))throw new Error('Production is not serving the prepared client asset');
const asset=await fetch(policy.production_url+'/'+expected,{signal:AbortSignal.timeout(15000)});if(!asset.ok)throw new Error('Published client asset failed');
// Sites serves authenticated MCP on the connection URL returned by get_site.
// Its ingress may reject anonymous requests with plain text before the Worker runs.
const mcpUrl=new URL(policy.mcp_url||'/mcp',policy.production_url);
if(mcpUrl.protocol!=='https:'||mcpUrl.pathname!=='/mcp')throw new Error('Invalid verified MCP connection URL');
const denied=await fetch(mcpUrl,{method:'POST',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),signal:AbortSignal.timeout(15000)});
if(denied.status!==401||(await denied.text()).includes('inputSchema'))throw new Error('Anonymous MCP access is not denied correctly');
console.log('Verified production URL, client asset and anonymous MCP denial.');
console.log('Also verify deployment ID/version using official Sites status, then authenticated discovery/read-only tools using the installed plugin. No production mutations were performed.');
