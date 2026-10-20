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
import {createA2aServer} from '../agent/adapters/a2a.mjs';
const token='a'.repeat(48);
test('A2A HTTP authenticates, routes only to operator room and preserves correlation',async t=>{
 const calls=[];const server=createA2aServer({token,roomId:'!fixed',bridge:{async call(method,params){calls.push({method,params});return {event_id:'$sent'};}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base=`http://127.0.0.1:${server.address().port}`;
 const send=(body,auth=token)=>fetch(base+'/rpc',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${auth}`},body:JSON.stringify(body)});
 const request={jsonrpc:'2.0',id:'correlation',method:'SendMessage',params:{message:{messageId:'unique',role:'ROLE_USER',parts:[{text:'bonjour'}]}}};
 assert.equal((await send(request,'wrong')).status,401);assert.equal(calls.length,0);
 const result=await (await send(request)).json();assert.equal(result.id,'correlation');assert.equal(result.result.message.role,'ROLE_AGENT');assert.ok(result.result.message.contextId);assert.deepEqual(calls,[{method:'send',params:{room_id:'!fixed',text:'bonjour'}}]);
 assert.equal((await (await send({...request,method:'SendStreamingMessage'})).json()).error.code,-32601);
 assert.equal((await (await send({...request,params:{...request.params,metadata:{room_id:'!evil'}}})).json()).error.code,-32602);assert.equal(calls.length,1);
 const card=await(await fetch(base+'/.well-known/agent-card.json')).json();assert.equal(card.capabilities.streaming,false);assert.deepEqual(card.securityRequirements,[{schemes:{owner:{list:[]}}}]);assert.equal(card.supportedInterfaces[0].protocolVersion,'1.0');
});
test('A2A refuses denied sends and malformed/oversized input without leaking native errors',async t=>{
 const server=createA2aServer({token,roomId:'!fixed',bridge:{async call(){throw Error('ACCESS_DENIED private detail');}}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}`;const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
 const result=await(await fetch(base+'/rpc',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'SendMessage',params:{message:{messageId:'m',role:'ROLE_USER',parts:[{text:'hello'}]}}})})).json();assert.equal(result.error.code,-32603);assert.doesNotMatch(JSON.stringify(result),/private detail/);
 assert.equal((await fetch(base+'/rpc',{method:'POST',headers,body:'x'.repeat(66000)})).status,413);
 assert.equal((await(await fetch(base+'/rpc',{method:'POST',headers,body:'{'})).json()).error.code,-32700);
 assert.equal((await fetch(base+'/rpc',{method:'POST',headers:{...headers,origin:'https://foreign.example'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/rpc',{method:'POST',headers:{...headers,'a2a-version':'0.3'},body:'{}'})).status,400);
 assert.throws(()=>createA2aServer({token:'weak',roomId:'!fixed',bridge:{}}));
});
