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
import {ConversationCreation} from '../web/conversation-creation.js';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture(){const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},options={storage,account:['https://qa.local','@qa:qa.local'],randomId:()=>id,locks:null};return {storage,options,creation:new ConversationCreation(options)};}
test('successful creation records a correlation event and clears the pending marker',async()=>{
 const f=fixture();let payload;const result=await f.creation.create({createRoom:async options=>{payload=options;assert.equal(f.creation.pending(),id);return {room_id:'!qa'};}},{initial_state:[{type:'m.room.encryption',content:{algorithm:'m.megolm.v1.aes-sha2'}}]},()=>{});
 assert.equal(result,'!qa');assert.equal(payload.initial_state[0].type,'m.room.encryption');assert.equal(payload.initial_state[1].content.id,id);assert.equal(f.creation.pending(),null);
});
test('ambiguous transport result persists across reload and blocks repeated invitations',async()=>{
 const f=fixture();let calls=0;const client={createRoom:async()=>{calls++;throw Error('Synthetic timeout');}};
 await assert.rejects(f.creation.create(client,{},()=>{}),/pas été confirmée/);
 const reload=new ConversationCreation(f.options);await assert.rejects(reload.create(client,{},()=>{}),/précédente/);assert.equal(calls,1);
 assert.throws(()=>reload.recover({getRooms:()=>[]},()=>{}),/indéterminée/);assert.equal(reload.pending(),id);
 const room=trustedRoom();
 assert.equal(reload.recover({getUserId:()=> '@qa:qa.local',getRooms:()=>[room]},()=>{}),'!qa');assert.equal(reload.pending(),null);
});
test('second concurrent creation cannot pass the persisted marker',async()=>{
 const f=fixture();let resolve,calls=0;const client={createRoom:()=>{calls++;return new Promise(done=>resolve=done);}};
 const pending=f.creation.create(client,{},()=>{});await assert.rejects(f.creation.create(client,{},()=>{}),/précédente/);assert.equal(calls,1);resolve({room_id:'!qa'});await pending;
});
test('explicit Matrix rejection allows a corrected request; timeout and rate-limit remain uncertain',async()=>{
 for(const status of [403,408,429,502]){
  const f=fixture();const error=Object.assign(Error('Synthetic rejection'),{httpStatus:status});
  await assert.rejects(f.creation.create({createRoom:async()=>{throw error;}},{},()=>{}));assert.equal(f.creation.pending(),status===403?null:id);
 }
});
test('unavailable or corrupted storage refuses creation before any network mutation',async()=>{
 let calls=0;const client={createRoom:async()=>{calls++;}};
 for(const storage of [{getItem(){throw Error();}},{getItem(){return 'corrupted';}},{getItem(){return null;},setItem(){throw Error();}}]){
  const c=new ConversationCreation({storage,account:['qa'],randomId:()=>id});await assert.rejects(c.create(client,{},()=>{}));
 }
 assert.equal(calls,0);
});
test('account namespaces cannot recover another account creation and session changes keep uncertain state',async()=>{
 const f=fixture();let active=true;const check=()=>{if(!active)throw Error('Session changed');};
 await assert.rejects(f.creation.create({createRoom:async()=>{active=false;return {room_id:'!qa'};}},{},check),/pas été confirmée/);
 assert.equal(f.creation.pending(),id);assert.equal(new ConversationCreation({...f.options,account:['https://qa.local','@other:qa.local']}).pending(),null);
});
test('an occupied cross-tab Web Lock refuses creation before touching storage or network',async()=>{
 const f=fixture();let requests=0,calls=0;const c=new ConversationCreation({...f.options,locks:{request:async(key,options,action)=>{requests++;assert.equal(options.ifAvailable,true);return action(null);}}});
 await assert.rejects(c.create({createRoom:async()=>calls++},{},()=>{}),/autre onglet/);assert.equal(requests,1);assert.equal(calls,0);assert.equal(c.pending(),null);
});

function trustedRoom(roomId='!qa',sender='@qa:qa.local',encrypted=true){return {roomId,getMyMembership:()=> 'join',currentState:{getStateEvents:type=>({getSender:()=>sender,getContent:()=>type==='m.room.encryption'?{algorithm:encrypted?'m.megolm.v1.aes-sha2':'invalid'}:{id}})}};}
test('recovery rejects foreign, unencrypted and ambiguous rooms without losing the marker',async()=>{
 for(const rooms of [[trustedRoom('!foreign','@other:qa.local')],[trustedRoom('!plain','@qa:qa.local',false)],[trustedRoom('!one'),trustedRoom('!two')]]){
 const f=fixture();await assert.rejects(f.creation.create({createRoom:async()=>{throw Error('timeout');}},{},()=>{}));
 assert.throws(()=>f.creation.recover({getUserId:()=> '@qa:qa.local',getRooms:()=>rooms},()=>{}),/indéterminée/);assert.equal(f.creation.pending(),id);
 }
});
