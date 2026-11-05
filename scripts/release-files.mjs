import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
export const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024}).trim();
export const hashFiles=files=>{
 const hash=createHash('sha256');
 for(const file of [...new Set(files)].sort()){hash.update(file+'\0');hash.update(existsSync(file)?readFileSync(file):'DELETED');hash.update('\0');}
 return hash.digest('hex');
};
export const sourceFiles=()=>git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean);
export const changedFiles=()=>[...new Set([...git('diff','HEAD','--name-only','-z').split('\0'),...git('ls-files','--others','--exclude-standard','-z').split('\0')])].filter(Boolean).sort();
export function buildFiles(){
 const all=[];
 function walk(dir){for(const name of readdirSync(dir)){const full=resolve(dir,name);if(statSync(full).isDirectory())walk(full);else all.push(relative(process.cwd(),full).replaceAll('\\','/'));}}
 for(const dir of ['dist/client','dist/server','dist/.openai','work/cafe24-public'])walk(dir);
 return all;
}
export function checkProject(){
 const manifest=JSON.parse(readFileSync('.openai/hosting.json','utf8')),policy=JSON.parse(readFileSync('.openai/release-policy.json','utf8'));
 for(const key of ['project_id','d1','r2'])if(manifest[key]!==policy[key])throw new Error('Existing Sites binding changed: '+key);
 if(policy.production_url!=='https://aifect.co.kr'||policy.production_approval_required!==true||policy.database_approval_required!==true)throw new Error('Release approval policy changed');
 return {manifest,policy};
}
