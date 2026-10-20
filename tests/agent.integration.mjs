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
import {createA2aServer} from '../agent/adapters/a2a.mjs';
// Explicit real-service gate: requires local Polytalk, Synapse and the compiled Rust connector.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createClient,ClientEvent} from 'matrix-js-sdk';
import {logger} from 'matrix-js-sdk/lib/logger.js';
logger.setLevel('silent');
const origin='http://localhost:3210';
const silent={trace(){},debug(){},info(){},warn(){},error(){},getChild(){return this;}};
async function request(path,token,method='GET',body){const response=await fetch(origin+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const value=await response.json();assert.ok(response.ok,`Service response ${response.status}`);return value;}
function connector(store){
 const child=spawn(resolve('agent/target/debug/polytalk-agent.exe'),[],{env:{...process.env,POLYTALK_ORIGIN:origin,POLYTALK_AGENT_STORE:store,POLYTALK_AGENT_PASSWORD:'Integration-only local vault phrase 2026',POLYTALK_AGENT_TRACE:'1'},stdio:['pipe','pipe','pipe']});
 const pending=new Map(),methodForId=new Map();let counter=0,stderr='';child.stderr.on('data',chunk=>{stderr+=chunk.toString();for(const line of chunk.toString().split('\n'))if(line.startsWith('NATIVE_PHASE'))console.info(line);});
 const events=[];createInterface({input:child.stdout}).on('line',line=>{const value=JSON.parse(line);if(value.event){events.push(value);return;}const waiter=pending.get(value.id);if(waiter){pending.delete(value.id);clearTimeout(waiter.timer);value.error?waiter.reject(Error(methodForId.get(value.id)+': '+value.error.code)):waiter.resolve(value.result);}});
 child.on('exit',code=>{for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('Connector exited '+code+' '+stderr.slice(0,400)));}pending.clear();});
 return {child,events,call(method,params={}){if(child.exitCode!==null||child.signalCode!==null)return Promise.reject(Error('Connector not running'));const id='req-'+(++counter);methodForId.set(id,method);console.info('native command',method);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Connector timeout: '+method));},55000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({v:1,id,method,params})+'\n');});},stop(){return new Promise(done=>{if(child.exitCode!==null||child.signalCode!==null){done();return;}child.once('exit',done);child.kill();});}};
}
async function until(predicate,timeout=15000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,500));}throw Error('Expected SDK state unavailable');}
test('Rust connector interoperates with web SDK, replays after interruption and catches up offline',{timeout:180000},async t=>{
 const env=parseEnv(await readFile('.env','utf8')),suffix=process.env.POLYTALK_TEST_SUFFIX||randomBytes(5).toString('hex'),password=randomBytes(24).toString('base64url');assert.match(suffix,/^[a-f0-9]{10}$/);
 const names=['peer'+suffix,'agent'+suffix];for(const username of names)await request('/api/register',null,'POST',{username,password,name:username,kind:username.startsWith('agent')?'agent':'human',code:env.SIGNUP_CODE});
 const login=await request('/_matrix/client/v3/login',null,'POST',{type:'m.login.password',identifier:{type:'m.id.user',user:names[0]},password});
 const peer=createClient({fetchFn:async(input,init)=>{const response=await fetch(input,init);if(!response.ok)console.info("Peer HTTP",new URL(input).pathname,response.status);return response;},logger:silent,baseUrl:origin,userId:login.user_id,deviceId:login.device_id,accessToken:login.access_token});
 await peer.initRustCrypto({useIndexedDB:false});
 const synced=new Promise((done,reject)=>{peer.on(ClientEvent.Sync,state=>{if(state==='PREPARED')done();if(state==='ERROR')reject(Error('Peer sync unavailable'));});});await peer.startClient({initialSyncLimit:100});await synced;
 const store=resolve('.local','qa-agent-'+suffix);await mkdir(store,{recursive:true});let agent=connector(store);t.after(async()=>{peer.stopClient();await agent.stop();});
 console.info('stage: native login');
 const status=await agent.call('login',{username:names[1],password});assert.equal(status.authenticated,true);assert.equal(status.store_mode,"exclusive-process");await writeFile(resolve(".local/last-agent-fixture.json"),JSON.stringify({store,userId:status.user_id,deviceId:status.device_id}));
 const room=await peer.createRoom({visibility:'private',preset:'private_chat',invite:[status.user_id],creation_content:{'m.federate':false},initial_state:[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}}]});
 await until(async()=>{const result=await agent.call('rooms');return result.rooms.some(item=>item.room_id===room.room_id&&item.state==='Invited');});await agent.call('join',{room_id:room.room_id});await agent.call('rooms');
 await until(()=>peer.getRoom(room.room_id)?.getJoinedMemberCount()===2);
 await agent.call('listen',{timeout_ms:1});
 await peer.sendTextMessage(room.room_id,'SDK to Rust: encrypted integration payload');
 let messages;await until(async()=>{messages=(await agent.call('read')).messages;return messages.some(message=>message.content.body==='SDK to Rust: encrypted integration payload');},30000);
 const first=messages.find(message=>message.content.body==='SDK to Rust: encrypted integration payload');
 console.info('stage: first Rust encrypted send');
 const initialReply=await agent.call('send',{room_id:room.room_id,text:'Initial Rust encrypted reply'});
 await until(()=>peer.getRoom(room.room_id)?.getLiveTimeline().getEvents().some(event=>event.getId()===initialReply.event_id&&event.getContent().body==='Initial Rust encrypted reply'),30000);
 const concurrent=connector(store);await assert.rejects(concurrent.call('status'),/Connector exited/);await concurrent.stop();
 console.info('stage: notify');
 await agent.call('listen',{timeout_ms:10000});assert.ok(agent.events.some(event=>event.event_id===first.event_id));
 console.info('stage: restart before processing ack');
 await agent.stop();agent=connector(store);assert.equal((await agent.call('status')).device_id,status.device_id);
 messages=(await agent.call('read')).messages;assert.equal(messages.filter(message=>message.event_id===first.event_id).length,1);
 await agent.call('ack',{room_id:first.room_id,event_id:first.event_id});
 console.info('stage: send during connector stop');
 await agent.stop();await peer.sendTextMessage(room.room_id,'Offline catch-up payload');agent=connector(store);
 await until(async()=>{messages=(await agent.call('read')).messages;return messages.some(message=>message.content.body==='Offline catch-up payload');},30000);
 assert.ok(!messages.some(message=>message.event_id===first.event_id));
 console.info('stage: policy checks');
 const agentLogin=await request('/_matrix/client/v3/login',null,'POST',{type:'m.login.password',identifier:{type:'m.id.user',user:names[1]},password});
 await request('/api/policy/rules',agentLogin.access_token,'POST',{target:login.user_id,action:'block'});
 assert.equal((await agent.call('read')).messages.length,0,'previously received messages are hidden by current policy');
 await request('/api/policy/rules',agentLogin.access_token,'POST',{target:login.user_id,action:'remove'});
 await request('/api/policy',agentLogin.access_token,'PUT',{mode:'allowlist'});
 assert.equal((await agent.call('read')).messages.length,0,'empty allowlist fails closed');
 await request('/api/policy/rules',agentLogin.access_token,'POST',{target:login.user_id,action:'allow'});
 assert.ok((await agent.call('read')).messages.some(message=>message.content.body==='Offline catch-up payload'));
 await request('/api/policy/rules',login.access_token,'POST',{target:status.user_id,action:'block'});
 await assert.rejects(agent.call('send',{room_id:room.room_id,text:'must be blocked'}),/ACCESS_DENIED/);
 await request('/api/policy/rules',login.access_token,'POST',{target:status.user_id,action:'remove'});
 console.info('stage: real coordination contract');
 const registered=await request('/api/coordination/agents/me',agentLogin.access_token,'PUT',{provider:'integration-native',capabilities:['encrypted-messaging'],protocols:['api','mcp']});
 const task=await request('/api/coordination/tasks',login.access_token,'POST',{requestId:'integration-'+suffix,roomId:room.room_id,assigneeId:registered.id,instructionEventId:first.event_id});
 assert.equal(task.state,'assigned');
 const repeated=await request('/api/coordination/tasks',login.access_token,'POST',{requestId:'integration-'+suffix,roomId:room.room_id,assigneeId:registered.id,instructionEventId:first.event_id});assert.equal(repeated.id,task.id);
 const running=await request('/api/coordination/tasks/'+task.id,agentLogin.access_token,'PUT',{state:'running',version:task.version});assert.equal(running.state,'running');
 console.info('stage: Rust to SDK');
 const a2aToken=randomBytes(32).toString('base64url');
 const relay=createA2aServer({bridge:agent,token:a2aToken,roomId:room.room_id});
 await new Promise(done=>relay.listen(0,'127.0.0.1',done));t.after(()=>relay.close());
 const response=await fetch(`http://127.0.0.1:${relay.address().port}/rpc`,{method:'POST',headers:{authorization:'Bearer '+a2aToken,'content-type':'application/json','A2A-Version':'1.0'},body:JSON.stringify({jsonrpc:'2.0',id:'real-a2a',method:'SendMessage',params:{message:{messageId:randomBytes(16).toString('hex'),role:'ROLE_USER',parts:[{text:'Rust to SDK: encrypted reply'}]}}})});
 const receipt=await response.json();assert.equal(receipt.id,'real-a2a');assert.equal(receipt.error,undefined);const reply={event_id:receipt.result.message.metadata.matrixEventId};assert.ok(reply.event_id);

 await until(()=>peer.getRoom(room.room_id)?.getLiveTimeline().getEvents().some(event=>event.getId()===reply.event_id&&event.getContent().body==='Rust to SDK: encrypted reply'),30000);
 const completed=await request('/api/coordination/tasks/'+task.id,agentLogin.access_token,'PUT',{state:'completed',version:running.version,resultEventId:reply.event_id});assert.equal(completed.state,'completed');
 const taskEvents=await request('/api/coordination/events?after=0',login.access_token);assert.equal(taskEvents.events.filter(event=>event.task_id===task.id).length,3);
 if(process.env.POLYTALK_TEST_DELEGATION==='1'){
  console.info('stage: real approved delegation and cascading cancellation');
  const target='agentb'+suffix;await request('/api/register',null,'POST',{username:target,password,name:target,kind:'agent',code:env.SIGNUP_CODE});
  const targetLogin=await request('/_matrix/client/v3/login',null,'POST',{type:'m.login.password',identifier:{type:'m.id.user',user:target},password});await peer.invite(room.room_id,targetLogin.user_id);await request('/_matrix/client/v3/join/'+encodeURIComponent(room.room_id),targetLogin.access_token,'POST',{});
  const targetAgent=await request('/api/coordination/agents/me',targetLogin.access_token,'PUT',{provider:'integration-target',capabilities:['consult'],protocols:['api']});
  const parent=await request('/api/coordination/tasks',login.access_token,'POST',{requestId:'delegation-root-'+suffix,roomId:room.room_id,assigneeId:registered.id,instructionEventId:first.event_id});
  const started=await request('/api/coordination/tasks/'+parent.id,agentLogin.access_token,'PUT',{state:'running',version:1});
  await request('/api/coordination/tasks/'+parent.id+'/delegation',login.access_token,'PUT',{decision:'ask',maxDepth:2,maxTasks:8});
  await until(async()=>{const rooms=await agent.call('rooms');return rooms.rooms.some(r=>r.room_id===room.room_id);});
  const childInstruction=await agent.call('send',{room_id:room.room_id,text:'Encrypted delegated consultation'});
  const contract={requestId:'delegated-'+suffix,parentId:parent.id,roomId:room.room_id,assigneeId:targetAgent.id,instructionEventId:childInstruction.event_id};
  // Earlier scenario deliberately enabled A's allowlist. New peers need a separate explicit grant.
  await assert.rejects(request('/api/coordination/approvals',agentLogin.access_token,'POST',contract),/Service response 403/);
  await request('/api/policy/rules',agentLogin.access_token,'POST',{target:targetLogin.user_id,action:'allow'});
  const approval=await request('/api/coordination/approvals',agentLogin.access_token,'POST',contract);assert.equal(approval.state,'pending');
  await request('/api/coordination/approvals/'+approval.id,login.access_token,'PUT',{state:'approved'});
  const child=await request('/api/coordination/tasks',agentLogin.access_token,'POST',{...contract,approvalId:approval.id});assert.equal(child.depth,1);
  const replay=await request('/api/coordination/tasks',agentLogin.access_token,'POST',{...contract,approvalId:approval.id});assert.equal(replay.id,child.id);
  await request('/api/coordination/tasks/'+parent.id,login.access_token,'PUT',{state:'cancelled',version:started.version});
  const targetTasks=await request('/api/coordination/tasks',targetLogin.access_token);assert.equal(targetTasks.tasks.find(t=>t.id===child.id).state,'cancelled');
 }
});
