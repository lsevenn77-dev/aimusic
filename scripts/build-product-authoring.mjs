import {copyFile,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {zipParts} from '../server/product-zip-write.js';

const guide='AIFECT_Product_Production_Standard_v2.0.md';
export const kitName='AIFECT_Asset_Authoring_Kit_v2.0.zip';

async function readTree(root,dir){
 const files=[];
 for(const item of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const path=join(dir,item.name);
  if(item.isDirectory())files.push(...await readTree(root,path));
  else if(item.isFile())files.push([relative(root,path).replaceAll('\\','/'),await readFile(path)]);
 }
 return files;
}

export async function buildAuthoringKit(out){
 const entries=new Map([
  ['package.json',Buffer.from(JSON.stringify({name:'aifect-asset-authoring-kit',private:true,type:'module',engines:{node:'>=24'}},null,2)+'\n')],
  [guide,await readFile('authoring/'+guide)]
 ]);
 const files=['authoring/product-assets.mjs','server/db.js','server/product-zip.js','server/product-zip-write.js','shared/product-asset-contract.js',
  'ops/cafe24/package.json','ops/cafe24/package-lock.json','ops/cafe24/product-media.mjs'];
 for(const path of files)entries.set(path,await readFile(path));
 for(const dir of ['shared/product-assets','authoring/samples','authoring/layouts']){
  const root=dir==='authoring/layouts'?'authoring':'.';
  for(const [name,data] of await readTree(root,dir))entries.set(name,data);
 }
 await mkdir(out,{recursive:true});
 await writeFile(join(out,kitName),Buffer.concat(zipParts(entries)));
 await copyFile('authoring/'+guide,join(out,guide));
}
