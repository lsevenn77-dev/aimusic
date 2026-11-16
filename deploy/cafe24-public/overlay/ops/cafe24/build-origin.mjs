import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
export async function buildOrigin(){
 const out='work/cafe24-public';
 await mkdir(out,{recursive:true});
 const {outputFiles}=await build({entryPoints:['ops/cafe24/renderer.mjs'],bundle:true,platform:'node',format:'esm',target:'node22',write:false});
 const renderer=outputFiles[0].contents,shell=await readFile('dist/client/aifect-shell.txt');
 const revision=createHash('sha256').update(renderer).update('\0').update(shell).digest('hex');
 await Promise.all([writeFile(out+'/renderer.mjs',renderer),writeFile(out+'/shell.html',shell),writeFile(out+'/revision',revision+'\n')]);
 return revision;
}
