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
import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
test('CLI subprocess uses the real native Matrix session without exposing credentials',{timeout:90000},async()=>{
 const fixture=JSON.parse(await readFile('.local/last-agent-fixture.json','utf8'));
 const local=relative(resolve('.local'),resolve(fixture.store));assert.ok(local&&!local.startsWith('..')&&!isAbsolute(local));
 const env=Object.fromEntries(['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
 Object.assign(env,{POLYTALK_ORIGIN:'http://localhost:3210',POLYTALK_AGENT_STORE:resolve(fixture.store),POLYTALK_AGENT_PASSWORD:'Integration-only local vault phrase 2026',POLYTALK_AGENT_BINARY:process.env.POLYTALK_AGENT_BINARY||resolve('agent/target/debug/polytalk-agent.exe')});
 const output=await new Promise((done,reject)=>{const child=execFile(process.execPath,['agent/adapters/cli.mjs','call','connection_status'],{env,windowsHide:true,timeout:85000},(error,stdout)=>error?reject(Error('CLI_NATIVE_TEST_FAILED')):done(stdout));child.stdin.end('{}');});
 assert.equal(output.includes(env.POLYTALK_AGENT_PASSWORD),false);const result=JSON.parse(output);assert.notEqual(result.isError,true);const status=JSON.parse(result.content[0].text);assert.equal(status.authenticated,true);assert.equal(status.user_id,fixture.userId);assert.equal(status.device_id,fixture.deviceId);
});
