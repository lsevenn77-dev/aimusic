import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
export async function buildOrigin(){
 const out='work/cafe24-public';
 await mkdir(out,{recursive:true});
 // Public HTML uses neither the Worker image mirror nor private chat delivery.
 // Keep those modules and their catalogs out of the public renderer revision.
 const workerBoundary={name:'worker-only-modules',setup(builder){
  // The public HTML renderer never sends inventory or imports browser currency components.
  builder.onResolve({filter:/^\.\/inventory-transfer\.js$/},args=>({path:args.path,external:true,sideEffects:false}));
  builder.onResolve({filter:/^\.\/(currency|image-mirror|dm-body|welcome-notices|signup-source|premium-event|deleted-content-reports|review-queues)\.js$/},args=>({path:resolve(args.resolveDir,args.path),sideEffects:false}));
 }};
 const {outputFiles}=await build({entryPoints:['ops/cafe24/renderer.mjs'],bundle:true,platform:'node',format:'esm',target:'node22',write:false,plugins:[workerBoundary]});
 const renderer=outputFiles[0].contents,shell=await readFile('dist/client/aifect-shell.txt');
 const revision=createHash('sha256').update(renderer).update('\0').update(shell).digest('hex');
 await Promise.all([writeFile(out+'/renderer.mjs',renderer),writeFile(out+'/shell.html',shell),writeFile(out+'/revision',revision+'\n')]);
 return revision;
}
