import {readFileSync} from 'node:fs';
import {checkProject,hashFiles,sourceFiles,buildFiles} from './release-files.mjs';
const {policy}=checkProject(),report=JSON.parse(readFileSync('work/releases/latest.json','utf8'));
if(report.project_id!==policy.project_id||report.tests.failed!==0||!report.build.passed||!report.tests.passed)throw new Error('No passing release preparation. Run npm run release:prepare.');
if(report.source_sha256!==hashFiles(sourceFiles())||report.build_sha256!==hashFiles(buildFiles()))throw new Error('Source or build changed after validation. Run npm run release:prepare again.');
console.log('Verified tested source and build: '+report.source_sha256);
console.log('This command does not authorize deployment or database changes.');
