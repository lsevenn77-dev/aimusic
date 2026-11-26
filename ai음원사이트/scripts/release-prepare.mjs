import {spawn} from 'node:child_process';
import {mkdirSync,createWriteStream,writeFileSync,readFileSync,readdirSync,existsSync,unlinkSync} from 'node:fs';
import {once} from 'node:events';
import {checkProject,git,sourceFiles,changedFiles,hashFiles,buildFiles} from './release-files.mjs';

const {policy}=checkProject();
mkdirSync('work/releases',{recursive:true});
const latest='work/releases/latest.json';if(existsSync(latest))unlinkSync(latest);
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),base='work/releases/'+stamp;
const fingerprint=hashFiles(sourceFiles());
async function run(args,log){
 const out=createWriteStream(log);
 const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});
 child.stdout.pipe(out,{end:false});child.stderr.pipe(out,{end:false});
 const [code]=await once(child,'close');out.end();await once(out,'finish');
 if(code!==0){console.error(readFileSync(log,'utf8').slice(-6000));throw new Error('Release check failed; see '+log);}
}
git('diff','--check');
const tests=readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>'tests/'+f);
console.log('Running all '+tests.length+' test files. Full log: '+base+'-tests.log');
await run(['--test','--test-concurrency=4','--test-reporter=tap',...tests],base+'-tests.log');
const testLog=readFileSync(base+'-tests.log','utf8');
console.log(testLog.split('\n').filter(x=>/^# (tests|pass|fail|skipped|duration_ms) /.test(x)).join('\n'));
console.log('Building the existing Sites Worker and client.');
await run(['scripts/build.mjs'],base+'-build.log');
console.log('Checking built Worker/assets routing and public media with isolated local storage.');
await run(['tests/preview-public-music.mjs','--check'],base+'-public-smoke.log');
if(hashFiles(sourceFiles())!==fingerprint)throw new Error('Source changed while testing/building; run release:prepare again.');
const changed=changedFiles(),migrations=changed.filter(f=>/^drizzle\/[^/]+\.sql$/.test(f));
const report={prepared_at:new Date().toISOString(),project_id:policy.project_id,production_url:policy.production_url,
 source_head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),source_sha256:fingerprint,build_sha256:hashFiles(buildFiles()),
 changed_files:changed,pending_migrations:migrations,tests:{files:tests.length,passed:Number(testLog.match(/^# pass (\d+)/m)?.[1]||0),failed:0,log:base+'-tests.log'},
 build:{passed:true,log:base+'-build.log'},public_smoke:{passed:true,log:base+'-public-smoke.log'},saved_version:null,deployment_approved:false,database_change_approved:false};
writeFileSync(latest,JSON.stringify(report,null,2)+'\n');writeFileSync(base+'.json',JSON.stringify(report,null,2)+'\n');
console.log('Prepared without saving or deploying: '+latest);
console.log('Pending migration files: '+(migrations.join(', ')||'none'));
console.log('Use the official Sites source helper and save_site_version after review; deployment and production DB changes require separate user approval.');
