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
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {parseEnv,promisify} from 'node:util';
import {execFile,spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {setup} from '../scripts/setup.mjs';
const run=promisify(execFile);
const docker=(args)=>run('docker',args,{windowsHide:true,maxBuffer:1048576});
const inside=`
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createClient,ClientEvent,RoomEvent} from 'matrix-js-sdk';
const base='http://polytalk:3210',suffix=randomBytes(5).toString('hex'),password=randomBytes(24).toString('base64url');
async function request(path,token,method='GET',data){const response=await fetch(base+path,{method,headers:{Origin:process.env.PUBLIC_ORIGIN,...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});assert.ok(response.ok,'HTTP '+response.status);return response.json();}
const clients=[],accounts=[];
const silent={trace(){},debug(){},info(){},warn(){},error(){},getChild(){return this;}};
async function until(check){const end=Date.now()+30000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,250));}throw Error('Expected offline SDK state unavailable');}
try{
 for(const prefix of ['offlinea','offlineb']){const username=prefix+suffix;await request('/api/register',null,'POST',{username,password,name:prefix,kind:'human',code:process.env.SIGNUP_CODE});const account=await request('/_matrix/client/v3/login',null,'POST',{type:'m.login.password',identifier:{type:'m.id.user',user:username},password});accounts.push(account);const client=createClient({baseUrl:base,userId:account.user_id,accessToken:account.access_token,deviceId:account.device_id,logger:silent});await client.initRustCrypto({useIndexedDB:false});const synced=new Promise((done,reject)=>{client.on(ClientEvent.Sync,state=>{if(state==='PREPARED')done();if(state==='ERROR')reject(Error('Sync failed'));});});await client.startClient({initialSyncLimit:20});await synced;clients.push(client);}
 const [a,b]=clients,[alice,bob]=accounts;
 await request('/api/me',bob.access_token,'PUT',{name:'Offline agent',kind:'agent'});await request('/api/coordination/agents/me',bob.access_token,'PUT',{provider:'sdk-qualification',capabilities:['messaging'],protocols:['api']});assert.equal((await request('/api/coordination/agents/me/heartbeat',bob.access_token,'POST',{})).online,true);
 const room=await a.createRoom({visibility:'private',preset:'private_chat',invite:[bob.user_id],creation_content:{'m.federate':false},initial_state:[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}}]});
 await until(()=>b.getRoom(room.room_id)?.getMyMembership()==='invite');await b.joinRoom(room.room_id);await until(()=>a.getRoom(room.room_id)?.getJoinedMemberCount()===2);
 const sent=await a.sendTextMessage(room.room_id,'Encrypted offline qualification payload');
 await until(async()=>{const event=b.getRoom(room.room_id)?.getLiveTimeline().getEvents().find(e=>e.getId()===sent.event_id);if(!event)return false;await b.decryptEventIfNeeded(event);return event.getContent().body==='Encrypted offline qualification payload';});
 const raw=await request('/_matrix/client/v3/rooms/'+encodeURIComponent(room.room_id)+'/event/'+encodeURIComponent(sent.event_id),bob.access_token);assert.equal(raw.type,'m.room.encrypted');assert.equal(raw.content.body,undefined);
 await request('/api/policy/rules',bob.access_token,'POST',{target:alice.user_id,action:'block'});
 await assert.rejects(()=>a.sendTextMessage(room.room_id,'Blocked offline payload'));
 console.log('Offline isolated stack: signup, sessions, SDK E2EE and blocking passed');
}finally{for(const client of clients)client.stopClient();}
process.exit(0);
`;
test('container intranet stack exchanges SDK-encrypted messages without external egress',{timeout:240000},async t=>{
 const project='polytalk-offline-qa-'+randomBytes(4).toString('hex'),directory=resolve('.local',project);await mkdir(directory);
 for(const file of ['deploy/compose.yaml','deploy/compose.intranet.yaml','deploy/synapse/polytalk_policy.py']){await mkdir(dirname(join(directory,file)),{recursive:true});await copyFile(file,join(directory,file));}
 await setup({directory,containerized:true});const env=parseEnv(await readFile(join(directory,'.env'),'utf8'));env.PUBLIC_ORIGIN='https://polytalk-qa.invalid';env.MATRIX_SERVER_NAME='qa.local';await writeFile(join(directory,'.env'),Object.entries(env).map(([key,value])=>key+'='+value).join('\n')+'\n',{mode:0o600});await setup({directory,containerized:true});
 const args=['compose','-p',project,'--env-file',join(directory,'.env'),'-f',join(directory,'deploy/compose.yaml'),'-f',join(directory,'deploy/compose.intranet.yaml')];
 const config=JSON.parse((await docker([...args,'config','--format','json'])).stdout);for(const service of Object.values(config.services)){delete service.ports;delete service.build;}assert.equal(Object.values(config.networks)[0].internal,true);
 const configPath=join(directory,'compose.qa.json');await writeFile(configPath,JSON.stringify(config),{mode:0o600});const qa=['compose','-p',project,'-f',configPath];
 t.after(async()=>{await docker([...qa,'down','--timeout','10']);});
 await docker([...qa,'up','-d','--no-build','--pull','never']);
 let ready=false;for(let i=0;i<45;i++){try{await docker([...qa,'exec','-T','polytalk','node','-e',"fetch('http://127.0.0.1:3210/api/health').then(r=>r.json()).then(v=>process.exit(v.matrix?0:1)).catch(()=>process.exit(1))"]);ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 assert.equal(ready,true,'Isolated stack must become ready');
 await new Promise((done,reject)=>{const child=spawn('docker',[...qa,'exec','-T','polytalk','node','--input-type=module'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('exit',code=>{if(code===0){assert.match(stdout,/SDK E2EE and blocking passed/);done();}else reject(Error('Offline runtime qualification failed: '+stderr.slice(-1400)));});child.stdin.end(inside);});
 await docker([...qa,'stop','synapse']);
 const health=config.services.polytalk.healthcheck.test;assert.equal(health[0],'CMD');await assert.rejects(docker([...qa,'exec','-T','polytalk',...health.slice(1)]),'Readiness must fail when Synapse stops');

});
