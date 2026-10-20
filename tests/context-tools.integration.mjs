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
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const base=()=>Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
test('real Graphify MCP exposes the local source graph',{timeout:60000},async t=>{
 assert.ok(process.env.POLYTALK_GRAPHIFY_BINARY);assert.ok(process.env.POLYTALK_GRAPHIFY_GRAPH);
 const client=new Client({name:'polytalk-graph-test',version:'1.0.0'});t.after(()=>client.close());
 await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('agent/adapters/context-proxy.mjs'),'graphify'],env:{...base(),GRAPHIFY_BACKEND:'none',POLYTALK_GRAPHIFY_BINARY:process.env.POLYTALK_GRAPHIFY_BINARY,POLYTALK_GRAPHIFY_GRAPH:process.env.POLYTALK_GRAPHIFY_GRAPH,POLYTALK_GRAPHIFY_PYTHON:process.env.POLYTALK_GRAPHIFY_PYTHON||'0'},stderr:'pipe'}));
 const tools=await client.listTools();assert.ok(tools.tools.some(tool=>tool.name==='graph_stats'));
 const result=await client.callTool({name:'graph_stats',arguments:{}});assert.notEqual(result.isError,true);assert.ok(result.content.some(item=>item.type==='text'&&/645|nodes|nœuds/i.test(item.text)));
});
test('real authenticated XERJ MCP discovers source search',{timeout:60000},async t=>{
 assert.ok(process.env.POLYTALK_XERJ_BINARY);assert.ok(process.env.XERJ_AUTH);
 const client=new Client({name:'polytalk-xerj-test',version:'1.0.0'});t.after(()=>client.close());
 await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('agent/adapters/context-proxy.mjs'),'xerj'],env:{...base(),POLYTALK_XERJ_BINARY:process.env.POLYTALK_XERJ_BINARY,XERJ_URL:'http://127.0.0.1:9320',XERJ_AUTH:process.env.XERJ_AUTH,XERJ_DISABLE_FEEDBACK:'true'},stderr:'pipe'}));
 const tools=await client.listTools();assert.ok(tools.tools.some(tool=>tool.name==='xerj_search'));assert.equal(tools.tools.length,1);
 const result=await client.callTool({name:'xerj_search',arguments:{index:'*',query:{match_all:{}},size:1}});assert.notEqual(result.isError,true);assert.ok(result.content.length>0);
});
