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
import {logger} from 'matrix-js-sdk/lib/logger.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createClient,ClientEvent} from 'matrix-js-sdk';
logger.setLevel('silent');
const origin='http://localhost:3210';
async function until(check,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await new Promise(done=>setTimeout(done,1200));}throw Error('Expected native history state unavailable');}
test('missing room keys do not starve another room and delayed keys recover retained history',{timeout:180000},async t=>{
 const env=parseEnv(await readFile('.env','utf8')),suffix=randomBytes(5).toString('hex'),password=randomBytes(24).toString('base64url');
 async function request(path,token,method='GET',data){const response=await fetch(origin+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});assert.ok(response.ok,'HTTP '+response.status);return response.json();}
 const names=['historypeer'+suffix,'historyagent'+suffix];for(const username of names)await request('/api/register',null,'POST',{username,password,name:username,kind:username.includes('agent')?'agent':'human',code:env.SIGNUP_CODE});
 const peerLogin=await request('/_matrix/client/v3/login',null,'POST',{type:'m.login.password',identifier:{type:'m.id.user',user:names[0]},password});
 let hold=false;const delayed=[];const silent={trace(){},debug(){},info(){},warn(){},error(){},getChild(){return this;}};
 const peer=createClient({baseUrl:origin,userId:peerLogin.user_id,deviceId:peerLogin.device_id,accessToken:peerLogin.access_token,logger:silent,fetchFn:async(input,init)=>{if(hold&&new URL(String(input)).pathname.includes('/sendToDevice/')){delayed.push({input,init});return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});}return fetch(input,init);}});
 await peer.initRustCrypto({useIndexedDB:false});const prepared=new Promise(done=>peer.on(ClientEvent.Sync,state=>{if(state==='PREPARED')done();}));await peer.startClient({initialSyncLimit:20});await prepared;t.after(()=>peer.stopClient());
 const store=resolve('.local','qa-history-'+suffix);await mkdir(store);const child=spawn(resolve('agent/target/debug/polytalk-agent.exe'),[],{windowsHide:true,env:{...process.env,POLYTALK_ORIGIN:origin,POLYTALK_AGENT_STORE:store,POLYTALK_AGENT_PASSWORD:'History qualification private phrase 2026'},stdio:['pipe','pipe','pipe']});
 const pending=new Map();let sequence=0;child.stderr.resume();createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line),waiter=pending.get(value.id);if(waiter){pending.delete(value.id);clearTimeout(waiter.timer);value.error?waiter.reject(Error(value.error.code)):waiter.resolve(value.result);}});
 t.after(()=>new Promise(done=>{if(child.exitCode!==null){done();return;}child.once('exit',done);child.kill();}));
 function call(method,params={}){const id=String(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Native command timeout'));},65000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({v:1,id,method,params})+'\n');});}
 const agent=await call('login',{username:names[1],password});
 async function createRoom(){const room=await peer.createRoom({visibility:'private',preset:'private_chat',invite:[agent.user_id],creation_content:{'m.federate':false},initial_state:[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}}]});await until(async()=>(await call('rooms')).rooms.some(r=>r.room_id===room.room_id&&r.state==='Invited'));await call('join',{room_id:room.room_id});await until(()=>peer.getRoom(room.room_id)?.getJoinedMemberCount()===2);return room.room_id;}
 const healthy=await createRoom();await peer.sendTextMessage(healthy,'Initial healthy payload');await until(async()=>(await call('read')).messages.some(m=>m.content.body==='Initial healthy payload'));
 const waiting=await createRoom();hold=true;try{await peer.sendTextMessage(waiting,'Delayed room key payload');}finally{hold=false;}assert.ok(delayed.length>0,'SDK room-key delivery must actually be held');
 await until(async()=>(await call('status')).history_issues.some(issue=>issue.room_id===waiting&&issue.state==='keys_pending'));
 await peer.sendTextMessage(healthy,'Healthy room still progresses');await until(async()=>(await call('read')).messages.some(m=>m.content.body==='Healthy room still progresses'));
 for(const packet of delayed){const response=await fetch(packet.input,packet.init);assert.ok(response.ok,'Delayed key delivery must succeed');}
 await until(async()=>(await call('read')).messages.some(m=>m.content.body==='Delayed room key payload'));
 await until(async()=>!(await call('status')).history_issues.some(issue=>issue.room_id===waiting));
});
