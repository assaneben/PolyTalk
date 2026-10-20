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
import {createContextProxy} from '../agent/adapters/context-proxy.mjs';
test('context proxy denies feedback and write tools even when the upstream advertises them',async t=>{
 const calls=[],tool=name=>({name,inputSchema:{type:'object'}});
 const server=await createContextProxy({listTools:async()=>({tools:['xerj_search','xerj_field_report','delete_index'].map(tool)}),callTool:async params=>{calls.push(params);return {content:[{type:'text',text:'synthetic source match'}]};}},'xerj');
 const client=new Client({name:'context-test',version:'1.0.0'}),[a,b]=InMemoryTransport.createLinkedPair();t.after(async()=>{await client.close();await server.close();});await server.connect(b);await client.connect(a);
 assert.deepEqual((await client.listTools()).tools.map(tool=>tool.name),['xerj_search']);
 await assert.rejects(client.callTool({name:'xerj_field_report',arguments:{}}));assert.equal(calls.length,0);
 await client.callTool({name:'xerj_search',arguments:{query:{match_all:{}}}});assert.equal(calls.length,1);
});
