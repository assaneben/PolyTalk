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
import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {readFile,mkdir,copyFile,access} from 'node:fs/promises';import {resolve,join} from 'node:path';import {randomUUID} from 'node:crypto';
async function failedStartup(password){
 const fixture=JSON.parse(await readFile('.local/last-agent-fixture.json','utf8'));const directory=resolve('.local','qa-missing-crypto-'+randomUUID());await mkdir(directory);await copyFile(join(fixture.store,'inbox.sqlite3'),join(directory,'inbox.sqlite3'));
 const code=await new Promise((done,reject)=>{const child=spawn(resolve('agent/target/debug/polytalk-agent.exe'),[],{windowsHide:true,env:{...process.env,POLYTALK_ORIGIN:'http://localhost:3210',POLYTALK_AGENT_STORE:directory,POLYTALK_AGENT_PASSWORD:password},stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk.toString());child.stderr.resume();const timer=setTimeout(()=>{child.kill();reject(Error('Startup refusal timeout'));},30000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);assert.equal(output,'','No authenticated response may be emitted');done(code);});child.stdin.end(JSON.stringify({v:1,id:'refusal',method:'status',params:{}})+'\n');});
 assert.equal(code,1);await assert.rejects(access(join(directory,'matrix','matrix-sdk-crypto.sqlite3')));
}
test('a saved session without its crypto databases refuses process startup',{timeout:35000},()=>failedStartup('Integration-only local vault phrase 2026'));
test('a wrong local vault phrase refuses process startup',{timeout:35000},()=>failedStartup('An incorrect local vault phrase 2026'));
