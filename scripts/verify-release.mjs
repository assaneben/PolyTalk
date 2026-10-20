/*! @license
Copyright (C) 2026 PolyTalk contributors
SPDX-License-Identifier: GPL-3.0-or-later

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import {spawn} from 'node:child_process';
import {readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
async function execute(command,args,{cwd,env}){
 return new Promise(resolve=>{const child=spawn(command,args,{cwd,env,shell:false,windowsHide:true,stdio:'inherit'});child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code===0?0:1));});
}
export async function verifyRelease({profile='local',root=process.cwd(),run=execute}={}){
 if(!['local','runtime','release'].includes(profile))throw Error('Profil attendu : local, runtime ou release.');
 const tests=(await readdir(join(root,'tests'))).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'tests/'+name);
 const node=(id,args)=>({id,command:process.execPath,args});
 const steps=[node('node-tests',['--test',...tests]),node('web-build',['scripts/build.mjs']),node('services',['scripts/doctor.mjs'])];
 const native=profile!=='local',release=profile==='release';
 if(native){
  steps.push({id:'native-tests',command:'cargo',args:['+1.99.1','test','--manifest-path','agent/Cargo.toml','--locked']});
  steps.push({id:release?'native-release':'native-debug',command:'cargo',args:['+1.99.1','build',...(release?['--release']:[]),'--manifest-path','agent/Cargo.toml','--locked']});
  steps.push(node('mcp-real',['--test','--test-force-exit','tests/mcp-native.integration.mjs']),node('a2a-real',['--test','--test-force-exit','tests/local-relay.integration.mjs']));
 }
 const env={...process.env};if(native)env.POLYTALK_AGENT_BINARY=join(root,'agent','target',release?'release':'debug','polytalk-agent'+(process.platform==='win32'?'.exe':''));
 const checks=steps.map(({id})=>({id,status:'not_run'}));
 for(let index=0;index<steps.length;index++){
  const step=steps[index],started=Date.now();let code=1;try{code=await run(step.command,step.args,{cwd:root,env});}catch{}
  checks[index]={id:step.id,status:code===0?'passed':'failed',durationMs:Date.now()-started};if(code!==0)break;
 }
 return {profile,passed:checks.every(check=>check.status==='passed'),checks,note:'Ce profil ne certifie pas les essais visuels, matériels, de charge ni le déploiement TLS. Les tests réels exigent une fixture native de qualification existante.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const report=await verifyRelease({profile:process.argv[2]||'local'});console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;}
