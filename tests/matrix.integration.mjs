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
// Real Synapse/PostgreSQL integration. The opaque encrypted envelope below tests
// server authorization only; SDK encryption/decryption is verified in task 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {Store} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';

const direct='http://127.0.0.1:8008';
const appOrigin='http://localhost:3210';

test('real Synapse enforces Polytalk policy against direct third-party client requests', {timeout:120000},async t=>{
  const env=parseEnv(await readFile('.env','utf8'));
  const directory=await mkdtemp(join(tmpdir(),'polytalk-real-matrix-'));
  const store=new Store(join(directory,'policy.sqlite'));
  let server;
  async function start(){
    server=createApp({store,upstream:direct,serverName:env.MATRIX_SERVER_NAME||'localhost',origin:appOrigin,
      policySecret:env.POLICY_SECRET,registrationSecret:env.REGISTRATION_SECRET,inviteCode:env.SIGNUP_CODE});
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3210,'127.0.0.1',resolve);});
  }
  async function stop(){if(server?.listening)await new Promise(resolve=>server.close(resolve));}
  t.after(async()=>{await stop();store.close();await rm(directory,{recursive:true,force:true});});
  await start();
  async function request(base,path,token,method='GET',data,retries=0){
    const response=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},
      body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(10000)});
    const result={status:response.status,data:await response.json()};
    // Respect short Synapse invitation backoffs without changing server quotas.
    if(result.status===429&&retries<2&&result.data.retry_after_ms>0&&result.data.retry_after_ms<=5000){
      await new Promise(resolve=>setTimeout(resolve,result.data.retry_after_ms+50));
      return request(base,path,token,method,data,retries+1);
    }
    return result;
  }
  const matrix=(path,token,method,data)=>request(direct,'/_matrix/client/v3'+path,token,method,data);
  const api=(path,token,method,data)=>request('http://127.0.0.1:3210','/api'+path,token,method,data);
  const denied=response=>{assert.equal(response.status,403,JSON.stringify(response.data));assert.equal(response.data.errcode,'M_FORBIDDEN');};
  const ok=response=>{assert.ok(response.status>=200&&response.status<300,`HTTP ${response.status}: ${JSON.stringify(response.data)}`);return response.data;};
  const health=await matrix('/account/whoami');
  assert.equal(health.status,401,'A real listening Synapse is required; integration never skips');
  const suffix=randomBytes(5).toString('hex');
  const users=[];
  for(const label of ['alice','bob','carol','dave']){
    const username=label+suffix,password=randomBytes(24).toString('base64url');
    const registered=ok(await api('/register',null,'POST',{username,password,name:label,kind:'human',code:env.SIGNUP_CODE}));
    const login=ok(await matrix('/login',null,'POST',{type:'m.login.password',identifier:{type:'m.id.user',user:username},password}));
    assert.equal(login.user_id,registered.user_id);
    users.push({id:login.user_id,token:login.access_token});
  }
  const [alice,bob,carol,dave]=users;
  const encryption=[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}}];
  const create=extra=>matrix('/createRoom',alice.token,'POST',{visibility:'private',preset:'private_chat',initial_state:encryption,creation_content:{'m.federate':false},...extra});
  const rule=(owner,target,action)=>api('/policy/rules',owner.token,'POST',{target:target.id,action});
  let roomId;
  const invite=user=>matrix(`/rooms/${encodeURIComponent(roomId)}/invite`,alice.token,'POST',{user_id:user.id});
  const joinRoom=user=>matrix(`/join/${encodeURIComponent(roomId)}`,user.token,'POST',{});
  let txn=0;
  const send=(type='m.room.encrypted')=>matrix(`/rooms/${encodeURIComponent(roomId)}/send/${type}/${++txn}`,alice.token,'PUT',type==='m.room.encrypted'
    ?{algorithm:'m.megolm.v1.aes-sha2',sender_key:'opaque-test-sender',device_id:'POLICY_TEST',session_id:'opaque-test-session',ciphertext:'opaque-test-ciphertext'}
    :{msgtype:'m.text',body:'plaintext must fail'});

  await t.test('direct clients cannot create public or unencrypted rooms',async()=>{
    denied(await create({visibility:'public'}));
    denied(await create({initial_state:[]}));
    roomId=ok(await create()).room_id;
    denied(await matrix(`/directory/list/room/${encodeURIComponent(roomId)}`,alice.token,'PUT',{visibility:'public'}));
    denied(await matrix(`/rooms/${encodeURIComponent(roomId)}/state/m.room.join_rules/`,alice.token,'PUT',{join_rule:'public'}));
  });
  await t.test('blocked invitation and empty allowlist are rejected through direct Matrix ingress',async()=>{
    ok(await rule(bob,alice,'block'));denied(await invite(bob));
    ok(await rule(bob,alice,'remove'));ok(await api('/policy',bob.token,'PUT',{mode:'allowlist'}));denied(await invite(bob));
  });
  await t.test('allowlist grant permits invitation, join and opaque encrypted event',async()=>{
    ok(await rule(bob,alice,'allow'));ok(await invite(bob));ok(await joinRoom(bob));
    assert.ok(ok(await send()).event_id);
  });
  await t.test('allowlist revocation immediately rejects new messages from a joined third-party client',async()=>{
    ok(await rule(bob,alice,'remove'));denied(await send());
    ok(await rule(bob,alice,'allow'));assert.ok(ok(await send()).event_id);
    ok(await rule(bob,alice,'block'));denied(await send());
    ok(await rule(bob,alice,'allow'));
  });
  await t.test('one rejecting joined local group member rejects the whole event',async()=>{
    // Exercise Synapse's normal profile propagation on invitation and join.
    ok(await matrix(`/profile/${encodeURIComponent(carol.id)}/displayname`,carol.token,'PUT',{displayname:'already visible Carol'}));
    ok(await invite(carol));ok(await joinRoom(carol));
    assert.equal(ok(await matrix(`/rooms/${encodeURIComponent(roomId)}/state/m.room.member/${encodeURIComponent(carol.id)}`,carol.token)).displayname,'already visible Carol');
    ok(await rule(carol,alice,'block'));denied(await send());
    ok(await rule(carol,alice,'remove'));assert.ok(ok(await send()).event_id);
  });
  await t.test('plaintext fallback and arbitrary timeline event bypasses are rejected',async()=>{
    denied(await send('m.room.message'));denied(await send('com.attacker.plaintext'));
    denied(await matrix(`/rooms/${encodeURIComponent(roomId)}/state/m.room.encryption/`,alice.token,'PUT',{algorithm:'other'}));
  });
  let profileRevision=0;
  const memberUpdate=()=>matrix(`/rooms/${encodeURIComponent(roomId)}/state/m.room.member/${encodeURIComponent(alice.id)}`,alice.token,'PUT',
    {membership:'join',displayname:`plaintext policy bypass ${++profileRevision}`,avatar_url:'mxc://localhost/plaintext',custom:'plaintext policy bypass'});
  await t.test('blocked clients cannot deliver plaintext through member profiles or room control metadata',async()=>{
    ok(await memberUpdate());
    ok(await rule(bob,alice,'remove'));denied(await memberUpdate());
    ok(await rule(bob,alice,'allow'));
    ok(await rule(bob,alice,'block'));denied(await memberUpdate());
    for(const [type,content] of [['m.room.join_rules',{join_rule:'invite'}],['m.room.encryption',{algorithm:'m.megolm.v1.aes-sha2'}],
      ['m.room.history_visibility',{history_visibility:'shared'}],['m.room.guest_access',{guest_access:'forbidden'}]])
      denied(await matrix(`/rooms/${encodeURIComponent(roomId)}/state/${type}/`,alice.token,'PUT',{...content,custom:'plaintext policy bypass'}));
    const power=ok(await matrix(`/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels/`,alice.token));
    denied(await matrix(`/rooms/${encodeURIComponent(roomId)}/state/m.room.power_levels/`,alice.token,'PUT',{...power,custom:'plaintext policy bypass'}));
    ok(await rule(bob,alice,'allow'));ok(await memberUpdate());
    ok(await rule(carol,alice,'block'));denied(await memberUpdate());
    ok(await rule(carol,alice,'remove'));ok(await memberUpdate());
  });
  await t.test('unavailable policy service denies messages and invitations, then recovers',async()=>{
    const declineRoom=ok(await create()).room_id;
    // A separate lifecycle recipient respects Synapse's unchanged invitation
    // quotas after the earlier blocked/allowlist invitation attempts.
    ok(await matrix(`/rooms/${encodeURIComponent(declineRoom)}/invite`,alice.token,'POST',{user_id:dave.id}));
    const removalRoom=ok(await create()).room_id;
    ok(await matrix(`/rooms/${encodeURIComponent(removalRoom)}/invite`,alice.token,'POST',{user_id:dave.id}));
    ok(await matrix(`/join/${encodeURIComponent(removalRoom)}`,dave.token,'POST',{}));
    await stop();
    try{
      denied(await send());denied(await memberUpdate());
      denied(await matrix(`/rooms/${encodeURIComponent(roomId)}/leave`,carol.token,'POST',{reason:'plaintext policy bypass'}));
      ok(await matrix(`/rooms/${encodeURIComponent(roomId)}/leave`,carol.token,'POST',{}));
      denied(await invite(carol));
      ok(await matrix(`/rooms/${encodeURIComponent(declineRoom)}/leave`,dave.token,'POST',{}));
      ok(await matrix(`/rooms/${encodeURIComponent(removalRoom)}/kick`,alice.token,'POST',{user_id:dave.id}));
      ok(await matrix(`/rooms/${encodeURIComponent(removalRoom)}/ban`,alice.token,'POST',{user_id:dave.id}));
      assert.ok(ok(await create()).room_id,'Empty encrypted room bootstrap works during policy outage');
    }finally{await start();}
    assert.ok(ok(await send()).event_id);ok(await invite(carol));
  });
});
