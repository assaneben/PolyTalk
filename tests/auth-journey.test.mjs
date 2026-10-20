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
import {validateDevicePhrase,authenticateOnce,finishAccess,accessProtection} from '../web/auth-journey.js';
import {SessionScope} from '../web/session-scope.js';
test('password login needs no separate phrase unless explicitly selected',()=>{
 assert.deepEqual(accessProtection({method:'password',password:'my-account-password',custom:false}),{phrase:'my-account-password',protection:'account-password'});
 assert.deepEqual(accessProtection({method:'password',password:'my-account-password',custom:true,phrase:'my separate phrase',confirmation:'my separate phrase'}),{phrase:'my separate phrase',protection:'custom'});
 assert.throws(()=>accessProtection({method:'password',password:'my-account-password',custom:true,phrase:'my separate phrase',confirmation:'typo'}),/correspondent/);
 assert.throws(()=>accessProtection({method:'wallet',custom:false,phrase:'',confirmation:''}),/12/);
});
test('guided access catches unrecoverable local phrase mistakes before account creation',()=>{
 assert.throws(()=>validateDevicePhrase('too short','too short','other'),/12/);assert.throws(()=>validateDevicePhrase('a long private phrase','a typo','account-password'),/correspondent/);assert.throws(()=>validateDevicePhrase('same secret phrase','same secret phrase','same secret phrase'),/différente/);validateDevicePhrase('local device phrase','local device phrase','separate-account-password');
});
test('locking during local vault decryption cannot resurrect a session',async()=>{
 const scope=new SessionScope();scope.begin();let resolve,connections=0;
 const result=finishAccess({scope,prepare:()=>new Promise(done=>resolve=done),connect:async()=>{connections++;},connectedGeneration:()=>scope.generation,seal:async()=>({}),persist(){}});
 scope.begin();resolve({prefix:'old'});await assert.rejects(result,/Session/);assert.equal(connections,0);
});
test('locking during vault sealing prevents persistence and private UI publication',async()=>{
 const scope=new SessionScope();scope.begin();let resolve,saved=0,generation;
 const result=finishAccess({scope,prepare:async()=>({prefix:'old'}),connect:async session=>{generation=scope.begin();return session;},connectedGeneration:()=>generation,seal:()=>new Promise(done=>resolve=done),persist:()=>saved++});
 await new Promise(done=>setImmediate(done));scope.begin();resolve({encrypted:true});await assert.rejects(result,/Session/);assert.equal(saved,0);
});
test('retrying a created account after login failure never registers it a second time',async()=>{
 const state={registered:false};let registrations=0,logins=0;const actions={register:async()=>{registrations++;},login:async()=>{if(++logins===1)throw Error('offline');return {user_id:'@user:local'};}};
 const input={signup:true,username:'user',password:'secret'};await assert.rejects(authenticateOnce(input,state,actions),/offline/);assert.equal((await authenticateOnce(input,state,actions)).user_id,'@user:local');assert.equal(registrations,1);assert.equal(logins,2);
});
