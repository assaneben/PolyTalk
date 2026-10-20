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
import {resolve} from 'node:path';
import {integrationConfig} from '../scripts/agent-integrations.mjs';
test('integration profiles use the existing MCP entry and never serialize operator secrets',()=>{
 const config=integrationConfig();assert.equal(config.mcpServers.polytalk.command,process.execPath);assert.equal(config.mcpServers.polytalk.args[0],resolve('agent/adapters/mcp.mjs'));
 const yaml=integrationConfig({target:'deepseek'});assert.match(yaml,/@deepseek-ai\/dsh-mcp-client/);assert.match(yaml,/!!js process.env.POLYTALK_AGENT_PASSWORD/);assert.match(yaml,/toolCallTimeoutMs: 75000/);
 assert.throws(()=>integrationConfig({node:'node'}),/Absolute/);assert.throws(()=>integrationConfig({graphify:resolve('tool')}),/together/);assert.throws(()=>integrationConfig({xerj:resolve('xerj'),xerjUrl:'http://remote.example'}),/Local/);
 const combined=integrationConfig({graphify:resolve('graphify-mcp'),graph:resolve('graph.json'),xerj:resolve('xerj')});assert.equal(Object.keys(combined.mcpServers).length,3);assert.equal(combined.mcpServers.xerj.env.XERJ_DISABLE_FEEDBACK,'true');
});
