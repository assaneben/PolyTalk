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
import {Store} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {Messenger} from '../web/matrix-client.js';
import {ConversationCreation} from '../web/conversation-creation.js';
import {Coordination} from '../server/coordination.mjs';
import assert from 'node:assert/strict';
test('audit regressions: confirmation, room provenance and old approvals',async()=>{
const results=[];
// Only synthetic accounts, a memory database, and a fake Matrix upstream.
const originalFetch=globalThis.fetch,store=new Store(':memory:');
const owner='@owner:localhost',token='synthetic-qa-valid-session-not-a-real-token';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const upstream=async(url,options)=>{
 const path=new URL(url).pathname;
 if(path.endsWith('/whoami'))return json({user_id:owner,device_id:'CURRENT'});
 if(path.endsWith('/devices'))return json({devices:[{device_id:'CURRENT'},{device_id:'OTHER'}]});
 if(path.endsWith('/delete_devices'))return json({errcode:'M_FORBIDDEN'},401);
 throw Error('Unexpected synthetic upstream route '+path);
};
const server=createApp({store,upstream:'http://matrix.qa.invalid',serverName:'localhost',origin:'http://localhost:3210',policySecret:'q'.repeat(64),fetchImpl:upstream,staticDir:'.local'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
try{
 globalThis.fetch=(path,options={})=>originalFetch(base+path,{...options,headers:{Origin:'http://localhost:3210',...options.headers}});
 const m=new Messenger();m.scope.begin();m.session={userId:owner,accessToken:token};m.status('ready');
 const valid=()=>originalFetch(base+'/api/me',{headers:{Authorization:'Bearer '+token}});
 const before=await valid();let error;
 try{await m.api('/security/devices/revoke','POST',{deviceId:'OTHER',password:'wrong-password-synthetic'});}catch(e){error=e.message;}
 const after=await valid();assert.equal(before.status,200);assert.equal(after.status,200);assert.ok(m.session);assert.equal(m.state.status,'ready');assert.match(error,/Confirmation refusée/);
 results.push({id:'MP-B01',probe:'step-up-error-versus-expired-session',scope:'Public createApp HTTP interface and Messenger.api, fake Matrix UIA password rejection; no real account touched.',serverTokenStatusBefore:before.status,serverTokenStatusAfter:after.status,clientStatus:m.state.status,clientSessionCleared:m.session===null,userFacingError:error,expected:'Keep authenticated session and report the rejected confirmation password.',reproduced:before.status===200&&after.status===200&&m.session===null});
}finally{globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));store.close();}
{
 const pendingId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const creation=new ConversationCreation({storage,account:['https://qa.invalid',owner],randomId:()=>pendingId,locks:null});
 await creation.create({createRoom:async()=>{throw Error('Synthetic unknown transport outcome');}},{},()=>{}).catch(()=>{});
 const foreign={roomId:'!foreign',getMyMembership:()=> 'join',currentState:{getStateEvents:type=>type==='m.room.create'?{getSender:()=> '@other:localhost',getContent:()=>({creator:'@other:localhost'})}:{getSender:()=> '@other:localhost',getContent:()=>({id:pendingId})}}};
 let recovered;assert.throws(()=>{recovered=creation.recover({getUserId:()=>owner,isRoomEncrypted:()=>false,getRooms:()=>[foreign]},()=>{});},/indéterminée/);assert.equal(creation.pending(),pendingId);
 results.push({id:'MP-B02',probe:'correlation-is-not-room-identity',scope:'Public ConversationCreation interface with a foreign joined-room adapter; no network.',recoveredRoom:recovered,pendingCleared:creation.pending()===null,expected:'Reject a room not created by the account or not encrypted, even if its mutable state repeats the correlation ID.',preconditions:'An existing joined room presents a matching correlation state. An adversary must know the random ID and have state-edit rights; this is not UUID guessing.',reproduced:recovered==='!foreign'&&creation.pending()===null});
}
{
 const approvalsStore=new Store(':memory:');const controller=approvalsStore.ensure(owner,'QA Owner'),worker=approvalsStore.ensure('@worker:localhost','QA Worker','agent'),target=approvalsStore.ensure('@target:localhost','QA Target','agent');
 const c=new Coordination(approvalsStore,{approvers:[owner]});for(const agent of [worker,target])c.register(agent,{provider:'synthetic',capabilities:[],protocols:[]});
 const task=c.create(controller,{requestId:'root',roomId:'!qa',assigneeId:worker.id,instructionEventId:'$root'});c.transition(worker,task.id,{state:'running',version:1});c.setDelegation(controller,task.id,{decision:'ask',maxDepth:2,maxTasks:8});
 const input=n=>({requestId:'approval-'+n,parentId:task.id,roomId:'!qa',assigneeId:target.id,instructionEventId:'$instruction-'+n});
 const pending=c.requestDelegation(worker,input('pending'));await new Promise(resolve=>setTimeout(resolve,35));
 for(let i=0;i<100;i++){const next=c.requestDelegation(worker,input(i));c.decideApproval(controller,next.id,'rejected');}
 const listed=c.approvals(controller);
 const app=createApp({store:approvalsStore,upstream:'http://matrix.qa.invalid',serverName:'localhost',origin:'http://localhost:3210',policySecret:'q'.repeat(64),fetchImpl:upstream,staticDir:'.local',approvers:[owner]});await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 try{
  const response=await originalFetch('http://127.0.0.1:'+app.address().port+'/api/coordination/approvals/'+pending.id,{method:'PUT',headers:{Origin:'http://localhost:3210',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({state:'rejected'})});
  assert.equal(response.status,200);assert.ok(listed.some(row=>row.id===pending.id));assert.equal(c.approval(controller,pending.id).state,'rejected');assert.throws(()=>c.approval(target,pending.id),/Accès/);const direct={state:'rejected'};
  results.push({id:'MP-B03',probe:'pending-approval-hidden-by-history-limit',scope:'101 approvals created through the public Coordination interface; HTTP decision attempted against public createApp, all in memory.',listedCount:listed.length,pendingVisible:listed.some(row=>row.id===pending.id),httpDecisionStatus:response.status,underlyingAuthorizedDecision:direct.state,expected:'An authorized, non-expired pending approval must remain addressable regardless of list pagination.',reproduced:listed.length===100&&!listed.some(row=>row.id===pending.id)&&response.status===403&&direct.state==='approved'});
 }finally{await new Promise(resolve=>app.close(resolve));approvalsStore.close();}
}
for(const result of results)assert.equal(result.reproduced,false,result.id);
});
