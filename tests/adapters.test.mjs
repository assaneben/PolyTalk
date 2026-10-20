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
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createMcpServer} from '../agent/adapters/mcp.mjs';
test('official MCP client lists and calls messaging tools with errors contained',async t=>{
 const calls=[];const bridge={async call(method,params){calls.push({method,params});if(params.text==='blocked')throw Error('ACCESS_DENIED');if(params.text==='limited')throw Error('RATE_LIMITED');return method==='read'?{messages:[]}:{event_id:'$event'};}};
 const server=createMcpServer(bridge),client=new Client({name:'integration-client',version:'1.0.0'});const[a,b]=InMemoryTransport.createLinkedPair();t.after(async()=>{await client.close();await server.close();});await server.connect(b);await client.connect(a);
 const list=await client.listTools();assert.ok(list.tools.some(tool=>tool.name==='wait_for_message'));
 const result=await client.callTool({name:'send_message',arguments:{room_id:'!room',text:'hello'}});assert.equal(result.isError,undefined);assert.equal(calls[0].method,'send');
 const refused=await client.callTool({name:'send_message',arguments:{room_id:'!room',text:'blocked'}});assert.equal(refused.isError,true);
 const limited=await client.callTool({name:'send_message',arguments:{room_id:'!room',text:'limited'}});assert.equal(limited.isError,true);assert.match(limited.content[0].text,/une minute/);
 await client.callTool({name:'read_messages',arguments:{}});assert.equal(calls.at(-1).method,'read');
});
test('MCP wait validates bounds and respects cancellation without launching a model',async()=>{
 const {waitForMessage}=await import('../agent/adapters/mcp.mjs');let calls=0;
 const bridge={async call(){calls++;return {available:0};}};const controller=new AbortController();controller.abort();
 await assert.rejects(()=>waitForMessage(bridge,1000,controller.signal),/annul/);assert.equal(calls,0);
 await assert.rejects(()=>waitForMessage(bridge,31000),/30000/);
 assert.deepEqual(await waitForMessage(bridge,0),{available:0,timeout:true});assert.equal(calls,0);
});
test('MCP wait cancellation during an in-flight poll prevents another poll',async()=>{
 const {waitForMessage}=await import('../agent/adapters/mcp.mjs');const controller=new AbortController();let calls=0;
 const bridge={async call(){calls++;await new Promise(resolve=>setTimeout(resolve,10));return {available:0};}};
 const waiting=waitForMessage(bridge,1000,controller.signal);controller.abort();await assert.rejects(waiting,/annul/);assert.equal(calls,1);
});

test('MCP task tools forward only closed coordination operations to the native authenticated connector',async t=>{
 const calls=[],bridge={async call(method,params){calls.push({method,params});return {tasks:[]};}};
 const server=createMcpServer(bridge),client=new Client({name:'coordination-test',version:'1.0.0'}),[a,b]=InMemoryTransport.createLinkedPair();
 t.after(async()=>{await client.close();await server.close();});await server.connect(b);await client.connect(a);
 const listed=await client.listTools();assert.ok(listed.tools.some(x=>x.name==='list_tasks'));
 await client.callTool({name:'list_tasks',arguments:{}});assert.deepEqual(calls.at(-1),{method:'coordination',params:{operation:'tasks',data:{}}});
 const id='12345678-1234-4234-8234-123456789abc';
 await client.callTool({name:'list_tasks',arguments:{after:id}});assert.deepEqual(calls.at(-1),{method:'coordination',params:{operation:'tasks',data:{after:id}}});
 const beforeInvalid=calls.length;await client.callTool({name:'list_tasks',arguments:{after:'?url=https://invalid.example'}}).catch(()=>{});assert.equal(calls.length,beforeInvalid);
 await client.callTool({name:'update_task',arguments:{task_id:id,state:'running',version:1}});
 assert.deepEqual(calls.at(-1),{method:'coordination',params:{operation:'transition',id,data:{state:'running',version:1}}});
 const cancellation=await client.callTool({name:'cancel_task',arguments:{task_id:id,version:2}});assert.notEqual(cancellation.isError,true);assert.deepEqual(calls.at(-1),{method:'coordination',params:{operation:'transition',id,data:{state:'cancelled',version:2}}});
});

test('MCP private memory and skill tools preserve local scope and explicit optimistic versions',async t=>{
 const calls=[],bridge={async call(method,params){calls.push({method,params});return {version:1};}};
 const server=createMcpServer(bridge),client=new Client({name:'knowledge-test',version:'1.0.0'}),[a,b]=InMemoryTransport.createLinkedPair();
 t.after(async()=>{await client.close();await server.close();});await server.connect(b);await client.connect(a);
 const id='12345678-1234-4234-8234-123456789abc';
 await client.callTool({name:'save_private_knowledge',arguments:{kind:'skill',id,version:0,text:'Read tests before changing code.'}});
 assert.deepEqual(calls.at(-1),{method:'knowledge',params:{operation:'put',kind:'skill',id,version:0,text:'Read tests before changing code.'}});
 await client.callTool({name:'list_private_knowledge',arguments:{kind:'memory'}});assert.deepEqual(calls.at(-1),{method:'knowledge',params:{operation:'list',kind:'memory'}});
});
