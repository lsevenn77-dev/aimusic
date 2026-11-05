import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
export async function buildOrigin(){
 const out='work/cafe24-public';
 await mkdir(out,{recursive:true});
 // The public HTML renderer has no media bucket or image grants. Keep its
 // revision independent of the Worker-only list of verified CDN files.
 const mediaBoundary={name:'worker-only-image-mirror',setup(builder){
  builder.onResolve({filter:/^\.\/image-mirror\.js$/},args=>({path:resolve(args.resolveDir,args.path),sideEffects:false}));
 }};
 const {outputFiles}=await build({entryPoints:['ops/cafe24/renderer.mjs'],bundle:true,platform:'node',format:'esm',target:'node22',write:false,plugins:[mediaBoundary]});
 const renderer=outputFiles[0].contents,shell=await readFile('dist/client/aifect-shell.txt');
 const revision=createHash('sha256').update(renderer).update('\0').update(shell).digest('hex');
 await Promise.all([writeFile(out+'/renderer.mjs',renderer),writeFile(out+'/shell.html',shell),writeFile(out+'/revision',revision+'\n')]);
 return revision;
}
