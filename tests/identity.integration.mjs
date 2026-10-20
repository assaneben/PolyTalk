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
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {createIdentity,exportIdentity,importIdentity} from '../web/identity-recovery.js';
import {IdentityClient} from '../web/identity-client.js';
test('real local identity creates an account and recovers its signed login on another Matrix device',{timeout:120000},async t=>{
 const origin='http://localhost:3210',env=parseEnv(await readFile('.env','utf8')),config=await(await fetch(origin+'/api/config')).json(),cookies=new Map();
 const fetchImpl=async(url,init={})=>{
  assert.equal(new URL(url).origin,origin);const response=await fetch(url,{...init,headers:{...init.headers,Origin:origin,...(cookies.size?{Cookie:[...cookies].map(([key,value])=>key+'='+value).join('; ')}:{})}});
  for(const cookie of response.headers.getSetCookie()){const first=cookie.split(';',1)[0],index=first.indexOf('=');cookies.set(first.slice(0,index),first.slice(index+1));}return response;
 };
 const client=new IdentityClient({origin,fetchImpl}),tokens=[];t.after(async()=>{for(const session of tokens)await client.logout(session);});
 const {identity,recoveryCode}=createIdentity({origin,serverName:config.serverName,username:'identityqa'+randomBytes(5).toString('hex'),name:'QA local identity'});
 const file=await exportIdentity(identity,recoveryCode),state={registered:false,linked:false};
 const first=await client.enroll(identity,{state,invitationCode:env.SIGNUP_CODE||''});tokens.push(first.session);assert.equal(state.linked,true);
 const restored=await importIdentity(file,recoveryCode,origin),second=await client.login(restored);tokens.push(second.session);
 assert.equal(second.session.user_id,first.session.user_id);assert.notEqual(second.session.device_id,first.session.device_id);
 assert.equal(file.includes(identity.privateKey),false);
});
