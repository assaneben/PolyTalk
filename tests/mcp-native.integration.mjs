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
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
test('official MCP stdio client reads through the real native Matrix connector',{timeout:90000},async t=>{
 const fixture=JSON.parse(await readFile('.local/last-agent-fixture.json','utf8'));
 const base=resolve('.local');const store=resolve(fixture.store);assert.ok(store.startsWith(base+'\\')||store.startsWith(base+'/'),'Only the local test fixture may be used');
 const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
 Object.assign(env,{POLYTALK_ORIGIN:'http://localhost:3210',POLYTALK_AGENT_STORE:store,POLYTALK_AGENT_PASSWORD:'Integration-only local vault phrase 2026',POLYTALK_AGENT_BINARY:process.env.POLYTALK_AGENT_BINARY||resolve('agent/target/debug/polytalk-agent.exe')});
 const transport=new StdioClientTransport({command:process.execPath,args:[resolve('agent/adapters/mcp.mjs')],env,stderr:'pipe'});
 const client=new Client({name:'polytalk-native-qualification',version:'1.0.0'});t.after(()=>client.close());await client.connect(transport);
 const status=await client.callTool({name:'connection_status',arguments:{}},undefined,{timeout:65000});assert.notEqual(status.isError,true);const account=JSON.parse(status.content[0].text);assert.equal(account.authenticated,true);assert.equal(account.user_id,fixture.userId);assert.equal(account.device_id,fixture.deviceId);
 const tasks=await client.callTool({name:'list_tasks',arguments:{}},undefined,{timeout:65000});assert.notEqual(tasks.isError,true);assert.ok(Array.isArray(JSON.parse(tasks.content[0].text).tasks));
 const result=await client.callTool({name:'read_messages',arguments:{}},undefined,{timeout:65000});assert.notEqual(result.isError,true);const received=JSON.parse(result.content[0].text);assert.ok(received.messages.some(message=>message.content.body==='Offline catch-up payload'));
 const knowledgeId=randomUUID();
 const saved=await client.callTool({name:'save_private_knowledge',arguments:{kind:'memory',id:knowledgeId,version:0,text:'Local qualification note'}},undefined,{timeout:65000});assert.notEqual(saved.isError,true);assert.equal(JSON.parse(saved.content[0].text).version,1);
 const memory=await client.callTool({name:'read_private_knowledge',arguments:{kind:'memory',id:knowledgeId}},undefined,{timeout:65000});assert.notEqual(memory.isError,true);assert.equal(JSON.parse(memory.content[0].text).text,'Local qualification note');
 const forgotten=await client.callTool({name:'forget_private_knowledge',arguments:{kind:'memory',id:knowledgeId,version:1}},undefined,{timeout:65000});assert.notEqual(forgotten.isError,true);

});
