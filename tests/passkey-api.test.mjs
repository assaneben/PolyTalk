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
import {Store} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {virtualCredential} from './helpers/virtual-webauthn.mjs';
import {Security,totp} from '../server/security.mjs';
const origin='https://chat.example.test',secret='s'.repeat(64);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('passkey HTTP enrollment, cookie-bound login and removal use signed credentials and upstream session grants',async t=>{
 const store=new Store(':memory:'),user=store.ensure('@alice:localhost'),virtual=virtualCredential(user);let base;
 const server=createApp({store,origin,serverName:'localhost',upstream:'http://matrix.internal',policySecret:secret,walletJwtSecret:'j'.repeat(64),fetchImpl:async(url,init={})=>{
  if(url.pathname.endsWith('/whoami'))return json({user_id:user.mxid});
  if(url.pathname.endsWith('/logout'))return json({});
  if(url.pathname.endsWith('/delete_devices')){const b=JSON.parse(init.body);assert.deepEqual(b.devices,[]);return b.auth.password==='valid-password-123'?json({}):json({},401);}
  if(url.pathname.endsWith('/login')){
   const input=JSON.parse(init.body);if(input.type==='m.login.password'&&input.password!=='valid-password-123')return json({},403);
   const response=await fetch(base+'/internal/auth/check',{method:'POST',headers:{'Content-Type':'application/json','X-Polytalk-Policy-Secret':secret},body:JSON.stringify({user_id:user.mxid,device_id:input.device_id})});
   if(!(await response.json()).allowed)return json({},403);
   return json({user_id:user.mxid,device_id:input.device_id,access_token:'test-session'});
  }
  return json({},404);
 }});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 let cookie='';async function request(path,data,{token='actor',expected=200,withCookie=true,method='POST'}={}){
  const res=await fetch(base+path,{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(withCookie&&cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
  if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];assert.equal(res.status,expected,path);return res.json();
 }
 const enrollment=await request('/api/passkeys/register/options',{name:'Mon téléphone',password:'valid-password-123'});
 await request('/api/passkeys/register/verify',{id:enrollment.id,credential:virtual.registration(enrollment.options.challenge)});
 assert.equal((await request('/api/passkeys/list',null,{method:'GET'})).passkeys.length,1);
 const security=new Security(store,secret),setup=security.begin(user.mxid,'fixture'),codes=security.confirm(user.mxid,'fixture',totp(Buffer.from(setup.raw,'base64')));
 const login=await request('/api/passkeys/options',{}, {token:null});
 await request('/api/passkeys/login',{id:login.id,credential:virtual.assertion(login.options.challenge)},{token:null,withCookie:false,expected:403});
 const pending=await request('/api/passkeys/login',{id:login.id,credential:virtual.assertion(login.options.challenge)},{token:null});assert.equal(pending.mfaRequired,true);assert.equal(pending.access_token,undefined);
 assert.equal((await request('/api/auth/verify',{id:pending.id,code:codes[0]},{token:null})).access_token,'test-session');
 await request('/api/passkeys/login',{id:login.id,credential:virtual.assertion(login.options.challenge)},{token:null,expected:403});
 await request('/api/passkeys/remove',{id:virtual.id,password:'valid-password-123',code:'invalid'},{expected:403});
 await request('/api/passkeys/remove',{id:virtual.id,password:'valid-password-123',code:codes[1]});
 assert.equal((await request('/api/passkeys/list',null,{method:'GET'})).passkeys.length,0);
 const events=(await request('/api/security/audit',null,{method:'GET'})).events.map(x=>x.event);assert.ok(events.includes('passkey.added'));assert.ok(events.includes('passkey.removed'));
});
