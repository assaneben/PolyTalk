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
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Store } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import {Wallet} from 'ethers';
import {createHmac} from 'node:crypto';
import {Security,totp} from '../server/security.mjs';

const origin = 'http://localhost:3210';
const policySecret = 'p'.repeat(64);
const alice = '@alice:localhost';
const bob = '@bob:localhost';
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers:{'Content-Type':'application/json'}});
test('public OpenAPI exposes contracts without Matrix access or installation secrets',async t=>{
 const {request}=await fixture(t,{matrix:()=>{throw Error('OpenAPI must not query Matrix');}});
 const result=await request('/api/openapi.json',{token:null});assert.equal(result.status,200);assert.equal(result.data.openapi,'3.1.0');assert.ok(result.data.paths['/api/policy/rules'].post);assert.equal(JSON.stringify(result.data).includes(policySecret),false);
});
test('session management lists only own devices and revokes another session with password and active MFA',async t=>{
 const removed=[];const {request,store}=await fixture(t,{matrix:(url,init)=>{
  if(url.pathname.endsWith('/devices'))return json({devices:[{device_id:'DEVICE',display_name:'Current',last_seen_ts:123,private_field:'never expose'},{device_id:'LOST',display_name:'Lost phone',last_seen_ts:456}]});
  if(url.pathname.endsWith('/delete_devices')){const b=JSON.parse(init.body);if(b.auth.password!=='correct-password-123')return json({},401);if(b.devices.length)removed.push(...b.devices);return json({});}
 }});
 const inventory=(await request('/api/security/devices')).data;assert.equal(inventory.currentDeviceId,'DEVICE');assert.equal(inventory.devices.length,2);assert.equal(JSON.stringify(inventory).includes('never expose'),false);
 const revoke=data=>request('/api/security/devices/revoke',{method:'POST',data:{password:'correct-password-123',...data}});
 assert.equal((await revoke({deviceId:'DEVICE'})).status,400);assert.equal((await revoke({deviceId:'OTHER-ACCOUNT'})).status,404);
 assert.equal((await revoke({deviceId:'LOST',password:'incorrect-password-123'})).status,403);
 const security=new Security(store,policySecret),setup=security.begin(alice,'fixture'),codes=security.confirm(alice,'fixture',totp(Buffer.from(setup.raw,'base64')));
 assert.equal((await revoke({deviceId:'LOST'})).status,403);assert.deepEqual(removed,[]);
 assert.equal((await revoke({deviceId:'LOST',code:codes[0]})).status,200);assert.deepEqual(removed,['LOST']);
 assert.ok((await request('/api/security/audit')).data.events.some(e=>e.event==='session.revoked'));
});
test('signup permits a pseudonym without requiring a civil name, email or phone',async t=>{
 const {request,store}=await fixture(t);
 const result=await request('/api/register',{token:null,method:'POST',data:{username:'newuser',password:'long-private-password',name:'',kind:'human'}});
 assert.equal(result.status,201);assert.equal(store.profile('@newuser:localhost').name,'newuser');
});
test('guided signup explains a taken identifier without exposing upstream diagnostics',async t=>{
 const {request}=await fixture(t,{matrix:(url,init)=>url.pathname==='/_synapse/admin/v1/register'&&init.method==='POST'?json({errcode:'M_USER_IN_USE',error:'private diagnostic'},400):undefined});
 const result=await request('/api/register',{method:'POST',data:{username:'alreadytaken',password:'long enough password',name:'Test',kind:'human'}});assert.equal(result.status,409);assert.match(result.data.error,/connectez-vous/);assert.doesNotMatch(result.data.error,/private diagnostic/);
});
test('wallet HTTP links only after password step-up and creates a nonce-bound Matrix JWT login',async t=>{
 const secret='j'.repeat(43);let confirmations=0,logouts=0,jwtLogins=0;
 const {request,store}=await fixture(t,{config:{walletJwtSecret:secret},matrix:(url,init)=>{
  if(url.pathname.endsWith('/delete_devices')){const b=JSON.parse(init.body);assert.deepEqual(b.devices,[]);assert.equal(b.auth.identifier.user,alice);confirmations++;return b.auth.password==='wrong-password'?json({},401):json({});}
  if(url.pathname.endsWith('/logout')){logouts++;return json({});}
  if(url.pathname.endsWith('/login')&&init.method==='POST'){
   const b=JSON.parse(init.body);
   if(b.type==='m.login.password'){confirmations++;return b.password==='wrong-password'?json({},401):json({user_id:alice,access_token:'confirmation',device_id:'STEPUP'});}
   if(b.type==='org.matrix.login.jwt'){jwtLogins++;const [header,payload,signature]=b.token.split('.');assert.equal(signature,createHmac('sha256',secret).update(header+'.'+payload).digest('base64url'));const claims=JSON.parse(Buffer.from(payload,'base64url'));assert.equal(claims.sub,'alice');assert.equal(claims.aud,origin);return json({user_id:alice,access_token:'wallet-session',device_id:'WALLET'});}
  }
 }});
 const wallet=Wallet.createRandom(),headers={Origin:origin};
 assert.equal((await request('/api/wallet/challenge',{method:'POST',data:{address:wallet.address,chainId:1,purpose:'login'}})).status,403);
 const challenge=await request('/api/wallet/challenge',{method:'POST',headers,data:{address:wallet.address,chainId:1,purpose:'link'}});assert.equal(challenge.status,200);assert.match(challenge.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 const cookie=challenge.headers.get('set-cookie').split(';')[0],signature=await wallet.signMessage(challenge.data.message),proof={id:challenge.data.id,signature};
 assert.equal((await request('/api/wallet/link',{method:'POST',headers:{...headers,Cookie:cookie},data:{...proof,password:'wrong-password'}})).status,403);
 assert.equal((await request('/api/wallet/link',{method:'POST',headers:{...headers,Cookie:cookie},data:{...proof,password:'valid-password'}})).status,200);assert.equal(confirmations,2);assert.equal(logouts,0);
 const security=new Security(store,policySecret),setup=security.begin(alice,'fixture'),codes=security.confirm(alice,'fixture',totp(Buffer.from(setup.raw,'base64')));
 const login=await request('/api/wallet/challenge',{method:'POST',headers,data:{address:wallet.address,chainId:1,purpose:'login'}}),loginProof={id:login.data.id,signature:await wallet.signMessage(login.data.message)},loginHeaders={...headers,Cookie:login.headers.get('set-cookie').split(';')[0]};
 const pending=await request('/api/wallet/login',{method:'POST',headers:loginHeaders,data:loginProof});assert.equal(pending.data.mfaRequired,true);assert.equal(pending.data.access_token,undefined);assert.equal(jwtLogins,1);
 assert.equal((await request('/api/auth/verify',{method:'POST',headers:{Cookie:pending.headers.get('set-cookie').split(';')[0]},data:{id:pending.data.id,code:codes[0]}})).data.access_token,'wallet-session');
 assert.equal((await request('/api/wallet/login',{method:'POST',headers:loginHeaders,data:loginProof})).status,403);assert.equal(jwtLogins,1);
});

test('delegation HTTP requires configured operator approval and preserves root supervision',async t=>{
 const charlie='@charlie:localhost';
 const {store,request}=await fixture(t,{config:{approvers:[alice]},matrix:(url,init)=>{
  if(url.pathname.endsWith('/whoami')&&init.headers.Authorization==='Bearer charlie')return json({user_id:charlie});
  if(url.pathname.endsWith('/joined_members'))return json({joined:{[alice]:{},[bob]:{},[charlie]:{}}});
  if(url.pathname.includes('/event/')){const id=decodeURIComponent(url.pathname.split('/').at(-1));return json({room_id:'!delegate',event_id:id,sender:id==='$root'?alice:bob,type:'m.room.encrypted'});}
 }});
 const b=store.ensure(bob,'B','agent'),c=store.ensure(charlie,'C','agent');
 for(const token of ['bob','charlie'])assert.equal((await request('/api/coordination/agents/me',{token,method:'PUT',data:{provider:'test',capabilities:['consult'],protocols:['api']}})).status,200);
 const root=(await request('/api/coordination/tasks',{method:'POST',data:{requestId:'root',roomId:'!delegate',assigneeId:b.id,instructionEventId:'$root'}})).data;
 assert.equal((await request('/api/coordination/tasks/'+root.id,{token:'bob',method:'PUT',data:{state:'running',version:1}})).status,200);
 const policy={decision:'ask',maxDepth:2,maxTasks:8};
 assert.equal((await request('/api/coordination/tasks/'+root.id+'/delegation',{token:'bob',method:'PUT',data:policy})).status,403);
 assert.equal((await request('/api/coordination/tasks/'+root.id+'/delegation',{method:'PUT',data:policy})).status,200);
 const input={requestId:'child',parentId:root.id,roomId:'!delegate',assigneeId:c.id,instructionEventId:'$child'};
 assert.equal((await request('/api/coordination/tasks',{token:'bob',method:'POST',data:input})).status,403);
 const approval=(await request('/api/coordination/approvals',{token:'bob',method:'POST',data:input})).data;
 assert.equal(approval.state,'pending');assert.equal((await request('/api/coordination/approvals/'+approval.id,{token:'bob',method:'PUT',data:{state:'approved'}})).status,403);
 assert.equal((await request('/api/coordination/approvals/'+approval.id,{method:'PUT',data:{state:'approved'}})).status,200);
 const child=(await request('/api/coordination/tasks',{token:'bob',method:'POST',data:{...input,approvalId:approval.id}})).data;assert.equal(child.controller_id,store.profile(alice).id);
 assert.equal((await request('/api/coordination/tasks')).data.tasks.length,2);
 const toReject=(await request('/api/coordination/approvals',{token:'bob',method:'POST',data:{...input,requestId:'reject-after-block'}})).data;store.setRule(bob,alice,'block');
 const rejected=await request('/api/coordination/approvals/'+toReject.id,{method:'PUT',data:{state:'rejected'}});assert.equal(rejected.status,200);assert.deepEqual(rejected.data,{id:toReject.id,state:'rejected'});store.setRule(bob,alice,'remove');

 assert.equal((await request('/api/coordination/tasks/'+root.id,{method:'PUT',data:{state:'cancelled',version:2}})).status,200);
 assert.equal((await request('/api/coordination/tasks',{token:'charlie'})).data.tasks[0].state,'cancelled');
});

test('coordination HTTP binds agents to authenticated identities and validates encrypted room references',async t=>{
 let membership=true,encrypted=true;
 const {store,request,server}=await fixture(t,{matrix:(url,init)=>{
  if(url.pathname.endsWith('/joined_members'))return json({joined:membership?{[alice]:{},[bob]:{}}:{[alice]:{}}});
  if(url.pathname.includes('/event/'))return json({room_id:'!coord',event_id:'$instruction',sender:alice,type:encrypted?'m.room.encrypted':'m.room.message'});
 }});
 const worker=store.ensure(bob,'Worker','agent');
 assert.equal((await request('/api/coordination/agents/me',{token:'bob',method:'PUT',data:{provider:'external',capabilities:['coding'],protocols:['api']}})).status,200);
 assert.equal((await request('/api/coordination/agents?roomId=!coord')).data.agents[0].id,worker.id);
 const input={requestId:'first',roomId:'!coord',assigneeId:worker.id,instructionEventId:'$instruction'};
 encrypted=false;assert.equal((await request('/api/coordination/tasks',{method:'POST',data:input})).status,400);
 encrypted=true;membership=false;assert.equal((await request('/api/coordination/tasks',{method:'POST',data:input})).status,403);
 membership=true;const created=await request('/api/coordination/tasks',{method:'POST',data:input});assert.equal(created.status,201);assert.equal(created.data.state,'assigned');
 const duplicate=await request('/api/coordination/tasks',{method:'POST',data:input});assert.equal(duplicate.data.id,created.data.id);
 assert.equal((await request('/api/coordination/tasks/'+created.data.id,{token:'bob',method:'PUT',data:{state:'running',version:1}})).status,200);
 assert.equal((await request('/api/coordination/events?after=0')).data.events.length,2);
 assert.equal((await request('/api/coordination/events?after=NaN')).status,400);
 const abort=new AbortController();
 const stream=await fetch(`http://127.0.0.1:${server.address().port}/api/coordination/events?stream=1&after=0`,{headers:{Authorization:'Bearer alice'},signal:abort.signal});
 assert.match(stream.headers.get('content-type'),/text\/event-stream/);const reader=stream.body.getReader();const chunk=await reader.read();assert.match(new TextDecoder().decode(chunk.value),/event: coordination/);abort.abort();await reader.cancel().catch(()=>{});
 const {watchCoordination}=await import('../web/coordination-stream.js'),{SessionScope}=await import('../web/session-scope.js');
 const scope=new SessionScope();scope.begin();const live=[];
 const watcher=watchCoordination({scope,token:'alice',fetchImpl:(path,options)=>fetch('http://127.0.0.1:'+server.address().port+path,options),onStatus(){},onEvent:event=>{live.push(event.state);if(live.length===2)watcher.stop();}});
 const deadline=setTimeout(()=>watcher.stop(),5000);try{await watcher.done;}finally{clearTimeout(deadline);watcher.stop();}
 assert.deepEqual(live,['assigned','running'],'browser SSE client consumes the real HTTP coordination stream');
 store.setRule(bob,alice,'block');assert.equal((await request('/api/coordination/tasks')).data.tasks.length,0);assert.equal((await request('/api/coordination/events?after=0')).data.events.length,0);
});
test('coordination exposes a closed server-owned tool catalog and serves installation metadata',async t=>{
 const {request,directory}=await fixture(t);const catalog=await request('/api/coordination/tools');assert.equal(catalog.data.schema,'polytalk.tools.v1');
 assert.ok(catalog.data.tools.length>=4);for(const tool of catalog.data.tools){assert.equal(tool.version,1);assert.equal(tool.inputSchema.additionalProperties,false);assert.match(tool.path,/^\/api\/coordination\//);}
 await writeFile(join(directory,'manifest.webmanifest'),JSON.stringify({name:'PolyTalk'}));const manifest=await request('/manifest.webmanifest',{token:null});assert.equal(manifest.headers.get('content-type'),'application/manifest+json');assert.equal(manifest.headers.get('cache-control'),'no-store');
});

async function fixture(t, options={}) {
  const directory = await mkdtemp(join(tmpdir(),'polytalk-api-'));
  const store = new Store(join(directory,'state.sqlite'));
  const calls=[];
  const fetchImpl=async (url, init={}) => {
    const u=new URL(url); calls.push({url:u,init});
    const custom = await options.matrix?.(u,init);
    if(custom) return custom;
    if(u.pathname==='/_matrix/client/v3/account/whoami') {
      const token=init.headers.Authorization;
      if(token==='Bearer expired') return json({errcode:'M_UNKNOWN_TOKEN'},401);
      return json({user_id:token==='Bearer bob'?bob:token==='Bearer historical'?'@Old+User:[::1]:8448':alice,device_id:'DEVICE',is_guest:false});
    }
    if(u.pathname==='/_matrix/client/v3/rooms/!room%3Alocalhost/event/%24event') return json({event_id:'$event',room_id:'!room:localhost',type:'m.room.encrypted',sender:bob,content:{algorithm:'m.megolm.v1.aes-sha2'}});
    if(u.pathname==='/_synapse/admin/v1/register') return init.method==='POST'?json({user_id:'@newuser:localhost'}):json({nonce:'registration-nonce'});
    if(u.pathname==='/_matrix/client/versions') return json({versions:['v1.11']});
    return json({errcode:'M_NOT_FOUND'},404);
  };
  const server=createApp({store,upstream:'http://matrix.internal:8008',serverName:options.serverName||'localhost',origin,
    policySecret,approvers:[alice],registrationSecret:'r'.repeat(64),staticDir:directory,fetchImpl,...options.config});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();await rm(directory,{recursive:true,force:true});});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=async(path, {token='alice',method='GET',data,headers={},raw}={})=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(data!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:raw??(data===undefined?undefined:JSON.stringify(data))});
    const text=await response.text();
    return {status:response.status,headers:response.headers,data:text?JSON.parse(text):undefined};
  };
  return {store,calls,request,directory,server};
}

test('protected routes require a verified Matrix session and failed authentication cannot mutate SQLite',async t=>{
  const {request,store}=await fixture(t);
  assert.equal((await request('/api/policy',{token:null})).status,401);
  assert.equal((await request('/api/policy',{token:'expired',method:'PUT',data:{mode:'allowlist'}})).status,401);
  assert.equal(store.profile(alice),undefined);
  assert.deepEqual(store.policy(alice),{mode:'open',rules:[]});
});

test('foreign origins are denied before state changes',async t=>{
  const {request,store}=await fixture(t);
  assert.equal((await request('/api/me',{headers:{Origin:'https://attacker.example'}})).status,403);
  assert.equal(store.profile(alice),undefined);
});

test('profile, exact contact lookup and contact card use the authenticated registry identity',async t=>{
  const {request,store}=await fixture(t);
  store.ensure(bob,'Bob','agent');
  const profile=await request('/api/me');
  assert.equal(profile.status,200);assert.equal(profile.data.profile.mxid,alice);
  assert.equal((await request('/api/me',{method:'PUT',data:{name:'Alice',kind:'human'}})).data.name,'Alice');
  assert.deepEqual((await request('/api/contacts?q=Bob')).data.contacts,[]);
  const contacts=await request('/api/contacts?q='+encodeURIComponent(bob));
  assert.equal(contacts.data.contacts[0].mxid,bob);
  const card=await request('/api/contacts/'+contacts.data.contacts[0].id);
  assert.equal(card.data.schema,'polytalk.contact.v1');assert.equal(card.data.mxid,bob);
  assert.equal(card.data.verification,'matrix-account');
});

test('policy updates and receipt state remain isolated to the verified owner',async t=>{
  const {request,store}=await fixture(t);
  await request('/api/policy',{method:'PUT',data:{mode:'allowlist',owner:bob}});
  await request('/api/policy/rules',{method:'POST',data:{target:bob,action:'allow',owner:bob}});
  assert.deepEqual((await request('/api/policy')).data,{mode:'allowlist',rules:[{target:bob,action:'allow'}]});
  assert.deepEqual((await request('/api/policy',{token:'bob'})).data,{mode:'open',rules:[]});
  assert.equal((await request('/api/can-contact',{token:'bob',method:'POST',data:{target:alice}})).data.allowed,true);
  await request('/api/receipts',{method:'POST',data:{roomId:'!room:localhost',eventId:'$event',state:'processed',owner:bob}});
  assert.equal(store.db.prepare('SELECT owner FROM receipts').get().owner,alice);
});

test('request bodies enforce size, JSON object shape and route schemas',async t=>{
  const {request}=await fixture(t);
  assert.equal((await request('/api/me',{method:'PUT',headers:{'Content-Type':'application/json'},raw:'x'.repeat(65537)})).status,413);
  for(const raw of ['[]','null','{bad','"text"']) assert.equal((await request('/api/me',{method:'PUT',headers:{'Content-Type':'application/json'},raw})).status,400);
  for(const [path,data] of [['/api/me',{name:'',kind:'human'}],['/api/policy',{mode:'anything'}],['/api/policy/rules',{target:alice,action:'allow'}],['/api/can-contact',{target:'bad'}],['/api/receipts',{eventId:'x',state:'bad'}]])
    assert.equal((await request(path,{method:path==='/api/me'||path==='/api/policy'?'PUT':'POST',data})).status,400);
  assert.equal((await request('/api/me',{method:'PUT',raw:'{}'})).status,415);
});

test('abuse is rate limited with a 429 response',async t=>{
  const {request}=await fixture(t);
  let response;
  for(let i=0;i<91;i++) response=await request('/api/config');
  assert.equal(response.status,429);
});

test('signup and Matrix login have a stricter five-attempt quota',async t=>{
  const {request}=await fixture(t,{matrix:url=>url.pathname.endsWith('/login')?json({errcode:'M_FORBIDDEN'},403):undefined});
  for(let i=0;i<5;i++) assert.equal((await request('/api/register',{method:'POST',data:{}})).status,400);
  assert.equal((await request('/api/register',{method:'POST',data:{}})).status,429);
  for(let i=0;i<5;i++) assert.equal((await request('/_matrix/client/v3/login',{method:'POST',data:{}})).status,403);
  assert.equal((await request('/_matrix/client/v3/login',{method:'POST',data:{}})).status,429);
});

test('internal evaluation needs its separate secret and validates recipient identities',async t=>{
  const {request,store}=await fixture(t);
  store.setRule(bob,alice,'block');
  assert.equal((await request('/internal/evaluate',{method:'POST',data:{sender:alice,recipients:[bob]}})).status,403);
  const headers={'x-polytalk-policy-secret':policySecret};
  assert.equal((await request('/internal/evaluate',{method:'POST',headers,data:{sender:alice,recipients:[bob]}})).data.allowed,false);
  assert.equal((await request('/internal/evaluate',{method:'POST',headers,data:{sender:alice,recipients:['bad']}})).status,400);
});

test('historical Matrix localparts and IPv6 server names agree with the store grammar',async t=>{
  const {request}=await fixture(t,{serverName:'[::1]:8448'});
  const response=await request('/api/me',{token:'historical'});
  assert.equal(response.status,200);assert.equal(response.data.profile.mxid,'@Old+User:[::1]:8448');
});

test('malformed registration values yield 400 rather than coercion or internal errors',async t=>{
  const {request,store}=await fixture(t);
  const data={username:['newuser'],password:'password-long-enough',name:'New user',kind:'human'};
  assert.equal((await request('/api/register',{method:'POST',data})).status,400);
  assert.equal(store.profile('@newuser:localhost'),undefined);
});

test('invite codes validate value types without exposing internal errors',async t=>{
  const {request}=await fixture(t,{config:{inviteCode:'private-code'}});
  const config=(await request('/api/config',{token:null})).data;assert.equal(config.signupRequiresCode,true);assert.equal(JSON.stringify(config).includes('private-code'),false);
  assert.equal((await request('/api/register',{method:'POST',data:{code:{secret:true}}})).status,403);
  const registration={username:'newuser',password:'long-private-password',kind:'human'};
  assert.equal((await request('/api/register',{method:'POST',data:registration})).status,403);
  assert.equal((await request('/api/register',{method:'POST',data:{...registration,code:'private-code'}})).status,201);
});

test('registration creates a profile from a valid Matrix response and uses a fixed non-admin request',async t=>{
  const {request,store,calls}=await fixture(t);
  const response=await request('/api/register',{method:'POST',data:{username:'newuser',password:'password-long-enough',name:'New user',kind:'agent'}});
  assert.equal(response.status,201);assert.equal(response.data.user_id,'@newuser:localhost');
  assert.equal(store.profile('@newuser:localhost').kind,'agent');
  const registration=calls.find(c=>c.init.method==='POST');
  assert.equal(registration.url.href,'http://matrix.internal:8008/_synapse/admin/v1/register');
  const payload=JSON.parse(registration.init.body);assert.equal(payload.admin,false);assert.equal(payload.inhibit_login,true);assert.match(payload.mac,/^[0-9a-f]{40}$/);
});

test('registration rejects an upstream identity for another account without local mutation',async t=>{
  const {request,store}=await fixture(t,{matrix:(url,init)=>url.pathname==='/_synapse/admin/v1/register'&&init.method==='POST'?json({user_id:'@other:elsewhere.example'}):undefined});
  assert.equal((await request('/api/register',{method:'POST',data:{username:'newuser',password:'password-long-enough',name:'New user',kind:'human'}})).status,502);
  assert.equal(store.profile('@other:elsewhere.example'),undefined);
});

test('receipt writes require room and event access under the caller token',async t=>{
  const {request,store,calls}=await fixture(t,{matrix:(url,init)=>url.pathname.includes('/event/')&&init.headers.Authorization==='Bearer bob'?json({errcode:'M_FORBIDDEN'},403):undefined});
  assert.equal((await request('/api/receipts',{method:'POST',data:{eventId:'$event',state:'received'}})).status,400);
  assert.equal((await request('/api/receipts',{token:'bob',method:'POST',data:{roomId:'!room:localhost',eventId:'$event',state:'processed'}})).status,403);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM receipts').get().n,0);
  assert.equal((await request('/api/receipts',{method:'POST',data:{roomId:'!room:localhost',eventId:'$event',state:'received'}})).status,200);
  assert.equal(calls.find(c=>c.url.pathname.includes('/event/')&&c.init.headers.Authorization==='Bearer alice').init.redirect,'error');
});

test('receipt writes reject mismatched Matrix event identities',async t=>{
  const {request,store}=await fixture(t,{matrix:url=>url.pathname.includes('/event/')?json({event_id:'$another',room_id:'!room:localhost'}):undefined});
  assert.equal((await request('/api/receipts',{method:'POST',data:{roomId:'!room:localhost',eventId:'$event',state:'received'}})).status,502);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM receipts').get().n,0);
});

test('receipt room identifiers reject controls and invalid Unicode before contacting Matrix',async t=>{
  const {request,store,calls}=await fixture(t);
  for(const roomId of ['!room:localhost\u0000','!room:localhost\ud800'])
    assert.equal((await request('/api/receipts',{method:'POST',data:{roomId,eventId:'$event',state:'received'}})).status,400);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM receipts').get().n,0);
  assert.equal(calls.filter(c=>c.url.pathname.includes('/event/')).length,0);
});

test('proxy forwards only configured upstream, method, body and allowlisted headers',async t=>{
  const {request,calls}=await fixture(t,{matrix:url=>url.pathname==='/_matrix/client/v3/sync'?json({next_batch:'next'}):undefined});
  const response=await request('/_matrix/client/v3/sync?timeout=0',{method:'POST',data:{since:'old'},headers:{Cookie:'private=x','X-Forwarded-Host':'evil.example','X-Custom':'private'}});
  assert.equal(response.status,200);assert.equal(response.data.next_batch,'next');
  const call=calls[0];assert.equal(call.url.href,'http://matrix.internal:8008/_matrix/client/v3/sync?timeout=0');
  assert.equal(call.init.method,'POST');assert.deepEqual(JSON.parse(call.init.body.toString()),{since:'old'});
  assert.deepEqual(call.init.headers,{'Content-Type':'application/json',Authorization:'Bearer alice'});assert.equal(call.init.redirect,'error');
});

test('proxy refuses encoded path traversal and unsupported Matrix endpoints',async t=>{
  const {request,calls}=await fixture(t);
  for(const path of ['/_matrix/client/v3/%2e%2e%2fadmin','/_matrix/client/v3/%252e%252e%252fadmin','/_matrix/client/v3/a%5c..%5cadmin','/_matrix/key/v2/server'])
    assert.equal((await request(path)).status,404,path);
  assert.equal(calls.length,0);
});

test('proxy preserves valid encoded historical identifiers without changing its destination',async t=>{
  const {request,calls}=await fixture(t,{matrix:url=>url.pathname.includes('/profile/')?json({displayname:'Old user'}):undefined});
  const response=await request('/_matrix/client/v3/profile/%40old%2Fuser%3Alocalhost');
  assert.equal(response.status,200);assert.equal(response.data.displayname,'Old user');
  assert.equal(calls[0].url.href,'http://matrix.internal:8008/_matrix/client/v3/profile/%40old%2Fuser%3Alocalhost');
});

test('proxy rejects redirects returned by an external transport without sending Location to the caller',async t=>{
  const {request}=await fixture(t,{matrix:()=>new Response(null,{status:302,headers:{Location:'https://attacker.example'}})});
  const response=await request('/_matrix/client/v3/sync');
  assert.equal(response.status,503);assert.equal(response.headers.get('Location'),null);
});

test('Matrix network and redirect failures are contained as 503 responses',async t=>{
  const {request}=await fixture(t,{matrix:()=>{throw new Error('secret upstream address');}});
  const response=await request('/api/me');assert.equal(response.status,503);assert.doesNotMatch(JSON.stringify(response.data),/secret upstream/);
  assert.equal((await request('/_matrix/client/v3/sync')).status,503);
});

test('malformed Matrix JSON is a 502 response',async t=>{
  const {request}=await fixture(t,{matrix:()=>new Response('not JSON',{status:200})});
  assert.equal((await request('/api/me')).status,502);
});

test('SQLite failures become generic 500 responses without SQL or filesystem disclosure',async t=>{
  const {request,store}=await fixture(t);
  store.db.exec('DROP TABLE policies');
  const response=await request('/api/policy');
  assert.equal(response.status,500);
  assert.deepEqual(response.data,{error:'Une erreur interne est survenue.'});
});

test('unknown static paths and unsupported verbs return controlled errors',async t=>{
  const {request,directory}=await fixture(t);
  await writeFile(join(directory,'index.html'),'<!doctype html><title>Polytalk</title>');
  assert.equal((await request('/missing.js')).status,404);
  assert.equal((await request('/api/me',{method:'PATCH'})).status,404);
  assert.equal((await request('/',{method:'OPTIONS'})).status,405);
});

const setupScript=resolve('scripts/setup.mjs');
test('setup generates private random secrets without stdout disclosure and preserves existing deployment keys',async t=>{
  const dirs=await Promise.all([1,2].map(()=>mkdtemp(join(tmpdir(),'polytalk-setup-'))));
  t.after(async()=>{for(const dir of dirs)await rm(dir,{recursive:true,force:true});});
  const contents=[];
  for(const directory of dirs){
    const result=spawnSync(process.execPath,[setupScript],{cwd:directory,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const content=await readFile(join(directory,'.env'),'utf8');contents.push(content);
    for(const key of ['POLICY_SECRET','REGISTRATION_SECRET']) {
      const secret=content.match(new RegExp(`^${key}=(.+)$`,'m'))?.[1];
      assert.ok(secret?.length>=43,key);assert.ok(!result.stdout.includes(secret));assert.ok(!result.stderr.includes(secret));
    }
    assert.match(content,/^SIGNUP_CODE=$/m);
    const again=spawnSync(process.execPath,[setupScript],{cwd:directory,encoding:'utf8'});
    assert.equal(again.status,0,again.stderr);assert.equal(await readFile(join(directory,'.env'),'utf8'),content);
  }
  assert.notEqual(contents[0],contents[1]);
});

test('setup import has no filesystem side effects',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'polytalk-import-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const {pathToFileURL}=await import('node:url');
  const result=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(pathToFileURL(setupScript).href)})`],{cwd:directory,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  await assert.rejects(readFile(join(directory,'.env')), {code:'ENOENT'});
});

test('server configuration rejects unsafe public origins and credentialed upstream URLs',async t=>{
  const {store,directory}=await fixture(t);
  for(const config of [{origin:'http://public.example'}, {origin:'https://user:private@public.example'}, {origin:'https://public.example/path'}, {upstream:'http://user:private@matrix.internal:8008'}])
    assert.throws(()=>createApp({store,upstream:'http://matrix.internal:8008',serverName:'localhost',origin,policySecret,staticDir:directory,...config}));
});

test('index refuses cleartext network exposure and malformed TLS origin configuration',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'polytalk-index-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  for(const publicOrigin of ['http://public.example','https://user:private@public.example','https://public.example/path']){
    const result=spawnSync(process.execPath,[resolve('server/index.mjs')],{cwd:directory,env:{...process.env,HOST:'0.0.0.0',PORT:'0',PUBLIC_ORIGIN:publicOrigin,POLICY_SECRET:policySecret},encoding:'utf8',timeout:15000});
    assert.notEqual(result.status,null,'unsafe origin must fail before listening');
    assert.notEqual(result.status,0);assert.ok(!result.stdout.includes('private'));
  }
});

test('index permits IPv6 loopback HTTP development',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'polytalk-index6-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const child=spawn(process.execPath,[resolve('server/index.mjs')],{cwd:directory,env:{...process.env,HOST:'::1',PORT:'0',PUBLIC_ORIGIN:'http://localhost:3210',POLICY_SECRET:policySecret},stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const result=await new Promise(resolve=>{
    let stdout='',stderr='';
    // Wait for the readiness event, with a bounded startup deadline. Compiling
    // the native connector concurrently can delay process startup on Windows.
    const timer=setTimeout(()=>{child.kill();resolve({stdout,stderr});},15000);
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('Polytalk :'))child.kill();});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('exit',()=>{clearTimeout(timer);resolve({stdout,stderr});});
  });
  assert.match(result.stdout,/Polytalk : http:\/\/localhost:3210/,result.stderr||'Readiness event missing before startup deadline');
});
test('room version 12 opaque identifiers support received notified and processed access-checked receipts',async t=>{
 const roomId='!or4n8Glr2V7EiOkNPYdAz2ps6m1Kao0N8rHMABC-fvU';
 const {request,store,calls}=await fixture(t,{matrix:url=>url.pathname.includes('/event/')?json({room_id:roomId,event_id:'$event',type:'m.room.encrypted'}):undefined});
 for(const state of ['received','notified','processed'])assert.equal((await request('/api/receipts',{method:'POST',data:{roomId,eventId:'$event',state}})).status,200);
 assert.equal(calls.filter(call=>call.url.pathname.includes('/event/')).length,3);
 assert.equal(store.db.prepare('SELECT state FROM receipts WHERE event_id=?').get('$event').state,'processed');
});
test('Matrix transport traffic does not exhaust the authenticated policy API budget',async t=>{
 const {request}=await fixture(t,{matrix:url=>url.pathname.endsWith('/sync')?json({next_batch:'fixture',rooms:{}}):undefined});
 for(let i=0;i<90;i++)assert.equal((await request('/_matrix/client/v3/sync')).status,200);
 assert.equal((await request('/api/policy')).status,200);
});
test('Matrix session quotas remain isolated with an aggregate per-address ceiling',async t=>{
 const {request}=await fixture(t,{matrix:url=>url.pathname.endsWith('/sync')?json({next_batch:'fixture',rooms:{}}):undefined});
 for(let i=0;i<50;i++){assert.equal((await request('/_matrix/client/v3/sync',{token:'alice'})).status,200);assert.equal((await request('/_matrix/client/v3/sync',{token:'bob'})).status,200);}
 for(let i=0;i<40;i++)assert.equal((await request('/_matrix/client/v3/sync',{token:'alice'})).status,200);
 assert.equal((await request('/_matrix/client/v3/sync',{token:'alice'})).status,429);
 assert.equal((await request('/_matrix/client/v3/sync',{token:'bob'})).status,200);
});
test('rotating unverified Matrix tokens cannot evade the aggregate transport ceiling',async t=>{
 const {request}=await fixture(t,{matrix:url=>url.pathname.endsWith('/sync')?json({next_batch:'fixture',rooms:{}}):undefined});
 for(let i=0;i<360;i++)assert.equal((await request('/_matrix/client/v3/sync',{token:'rotating-'+i})).status,200);
 assert.equal((await request('/_matrix/client/v3/sync',{token:'another-token'})).status,429);
});


test('channel API verifies Matrix membership and power before configuring response modes',async t=>{
 let joined=true,admin=false;
 const {request}=await fixture(t,{matrix:(url)=>{
  if(url.pathname.endsWith('/joined_members'))return json({joined:joined?{[alice]:{},[bob]:{}}:{[bob]:{}}});
  if(url.pathname.endsWith('/state/m.room.power_levels/'))return json({users:{[alice]:admin?100:0},users_default:0,state_default:50});
 }});
 await request('/api/me',{token:'bob',method:'PUT',data:{name:'Worker',kind:'agent'}});
 const worker=(await request('/api/coordination/agents/me',{token:'bob',method:'PUT',data:{provider:'test',capabilities:['coding'],protocols:['api']}})).data;
 const path='/api/coordination/channels/'+encodeURIComponent('!channel');
 assert.equal((await request(path)).data.mode,'manual');
 const config={mode:'principal',principalId:worker.id,version:0};
 assert.equal((await request(path,{method:'PUT',data:config})).status,403);
 admin=true;assert.equal((await request(path,{method:'PUT',data:config})).data.version,1);
 assert.deepEqual((await request(path+'/resolve',{method:'POST',data:{mentions:[]}})).data.recipients,[worker.id]);
 assert.equal((await request(path,{method:'PUT',data:config})).status,409);
 joined=false;assert.equal((await request(path)).status,403);
});


test('configured proxy isolates login quotas while spoofed forwarding from an untrusted peer is ignored',async t=>{
 const matrix=url=>url.pathname.endsWith('/login')?json({}):undefined;
 const trusted=await fixture(t,{config:{trustedProxyPeers:['127.0.0.1']},matrix});
 for(let i=0;i<5;i++)assert.equal((await trusted.request('/_matrix/client/v3/login',{token:null,method:'POST',headers:{'X-Forwarded-For':'192.0.2.1'},data:{}})).status,200);
 assert.equal((await trusted.request('/_matrix/client/v3/login',{token:null,method:'POST',headers:{'X-Forwarded-For':'192.0.2.1'},data:{}})).status,429);
 assert.equal((await trusted.request('/_matrix/client/v3/login',{token:null,method:'POST',headers:{'X-Forwarded-For':'192.0.2.2'},data:{}})).status,200);
 assert.equal((await trusted.request('/api/health',{headers:{'X-Forwarded-For':'192.0.2.1, 192.0.2.2'}})).status,400);
 const untrusted=await fixture(t,{matrix});for(let i=0;i<5;i++)await untrusted.request('/_matrix/client/v3/login',{token:null,method:'POST',headers:{'X-Forwarded-For':'192.0.2.'+(i+1)},data:{}});
 assert.equal((await untrusted.request('/_matrix/client/v3/login',{token:null,method:'POST',headers:{'X-Forwarded-For':'192.0.2.100'},data:{}})).status,429);
});

test('controller can revoke task contracts after blocking or excluding an assignee without content disclosure',async t=>{
 let member=true;const {store,request}=await fixture(t,{matrix:url=>{
 if(url.pathname.endsWith('/joined_members'))return json({joined:member?{[alice]:{},[bob]:{}}:{[alice]:{}}});
 if(url.pathname.includes('/event/'))return json({room_id:'!revoke',event_id:decodeURIComponent(url.pathname.split('/').at(-1)),sender:alice,type:'m.room.encrypted'});
 }});
 const worker=store.ensure(bob,'Worker','agent');await request('/api/coordination/agents/me',{token:'bob',method:'PUT',data:{provider:'test',capabilities:[],protocols:['api']}});
 const tasks=[];for(const requestId of ['revoke-block','revoke-exclude'])tasks.push((await request('/api/coordination/tasks',{method:'POST',data:{requestId,roomId:'!revoke',assigneeId:worker.id,instructionEventId:'$'+requestId}})).data);
 assert.equal((await request('/api/coordination/tasks/'+tasks[0].id,{token:'bob',method:'PUT',data:{state:'cancelled',version:1}})).status,403);
 store.setRule(bob,alice,'block');
 assert.equal((await request('/api/coordination/tasks/'+tasks[0].id+'/delegation',{method:'PUT',data:{decision:'never',maxDepth:1,maxTasks:1}})).status,200);
 const cancelled=await request('/api/coordination/tasks/'+tasks[0].id,{method:'PUT',data:{state:'cancelled',version:1}});assert.equal(cancelled.status,200);assert.deepEqual(Object.keys(cancelled.data).sort(),['id','state','version']);
 store.setRule(bob,alice,'remove');member=false;
 const revocable=await request('/api/coordination/revocable-tasks');assert.equal(revocable.status,200);assert.ok(revocable.data.tasks.some(task=>task.id===tasks[1].id));assert.equal(revocable.data.tasks[0].room_id,undefined);
 assert.equal((await request('/api/coordination/tasks/'+tasks[1].id,{method:'PUT',data:{state:'cancelled',version:1}})).status,200);
 assert.deepEqual((await request('/api/coordination/revocable-tasks',{token:'bob'})).data.tasks,[]);
});
