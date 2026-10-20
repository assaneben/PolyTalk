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
import {Readable} from 'node:stream';
import {runCli,readArguments} from '../agent/adapters/cli.mjs';
const input=value=>Readable.from([JSON.stringify(value)]);
test('CLI discovers the real MCP registry without starting a native session',async()=>{
 const result=await runCli(['--json','tools'],{bridgeFactory(){throw Error('must not start');}});
 assert.ok(result.tools.some(tool=>tool.name==='send_message'));assert.ok(result.tools.some(tool=>tool.name==='wait_for_message'));
});
test('CLI routes a tool through MCP validation and always closes the native bridge',async()=>{
 const calls=[];let closed=0;const options={input:input({room_id:'!qa',text:'synthetic'}),bridgeFactory:()=>({call:async(...args)=>{calls.push(args);return {event_id:'$qa'};},close:async()=>closed++})};
 const result=await runCli(['call','send_message'],options);assert.notEqual(result.isError,true);assert.deepEqual(calls,[['send',{room_id:'!qa',text:'synthetic'}]]);assert.equal(closed,1);
 let started=0;await runCli(['call','send_message'],{input:input({room_id:'bad',text:'synthetic'}),bridgeFactory:()=>{started++;}}).catch(()=>{});assert.equal(started,0);
});
test('CLI bounds JSON input and never puts login credentials in its response',async()=>{
 await assert.rejects(readArguments(Readable.from(['x'.repeat(65537)])),/INPUT_TOO_LARGE/);
 await assert.rejects(readArguments(Readable.from(['{'])),/INVALID_JSON/);
 await assert.rejects(readArguments(input([])),/OBJECT_REQUIRED/);
 let closed=0;const result=await runCli(['login'],{input:input({username:'synthetic',password:'synthetic-secret'}),bridgeFactory:()=>({call:async()=>({access_token:'must-not-leak'}),close:async()=>closed++})});assert.deepEqual(result,{authenticated:true});assert.equal(closed,1);
 await assert.rejects(runCli(['login','password-on-command-line']),/INVALID_COMMAND/);
});
