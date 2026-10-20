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
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {NativeBridge} from '../agent/adapters/bridge.mjs';
import {createA2aServer} from '../agent/adapters/a2a.mjs';

test('real local A2A relay sends through persistent Rust crypto and uses the authenticated coordination API',{timeout:120000},async t=>{
 const fixture=JSON.parse(await readFile('.local/last-agent-fixture.json','utf8')),store=resolve(fixture.store);
 assert.ok(store.startsWith(resolve('.local')+sep),'Only the private QA fixture may be used');
 const bridge=new NativeBridge({executable:process.env.POLYTALK_AGENT_BINARY||resolve('agent/target/debug/polytalk-agent.exe'),env:{...process.env,POLYTALK_ORIGIN:'http://localhost:3210',POLYTALK_AGENT_STORE:store,POLYTALK_AGENT_PASSWORD:'Integration-only local vault phrase 2026'}});
 t.after(()=>bridge.close());const call=bridge.call.bind(bridge);bridge.call=async(method,params)=>{try{return await call(method,params);}catch(error){throw Error(method+': '+error.message);}};
 const status=await bridge.call('status');assert.equal(status.authenticated,true);assert.equal(status.user_id,fixture.userId);assert.equal(status.device_id,fixture.deviceId);
 const tasks=await bridge.call('coordination',{operation:'tasks',data:{}});assert.ok(Array.isArray(tasks.tasks));
 const rooms=await bridge.call('rooms'),room=rooms.rooms.find(room=>room.state==='Joined');assert.ok(room,'QA encrypted room must exist');
 const token=randomBytes(32).toString('base64url'),server=createA2aServer({bridge,token,roomId:room.room_id});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port,card=await(await fetch(origin+'/.well-known/agent-card.json')).json();assert.equal(card.capabilities.streaming,false);
 const body=JSON.stringify({jsonrpc:'2.0',id:'qa-relay',method:'SendMessage',params:{message:{messageId:randomUUID(),role:'ROLE_USER',parts:[{text:'Local A2A encrypted runtime qualification '+randomUUID()}]}}});
 assert.equal((await fetch(origin+'/rpc',{method:'POST',headers:{'content-type':'application/json'},body})).status,401);
 const result=await(await fetch(origin+'/rpc',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body,signal:AbortSignal.timeout(70000)})).json();
 assert.equal(result.id,'qa-relay');assert.equal(result.error,undefined,JSON.stringify(result.error));assert.match(result.result.message.metadata.matrixEventId,/^\$/);
 assert.match(result.result.message.parts[0].text,/does not mean/);
});
