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
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {totp} from '../server/security.mjs';
function decode32(value){let bits=0,acc=0;const out=[];for(const c of value){acc=(acc<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);bits+=5;if(bits>=8)out.push((acc>>>(bits-=8))&255);}return Buffer.from(out);}
test('optional TOTP protects actual Synapse password login, pending tokens and one-use recovery codes',{timeout:1800000},async t=>{
 const origin='http://localhost:3210',env=parseEnv(await readFile('.env','utf8')),username='totpqa'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('base64url');let cookie='';const tokens=[];
 async function request(path,{base=origin,token,method='GET',data,expected=200,useCookie=true}={}){
  let r;for(let attempt=0;attempt<25;attempt++){
   r=await fetch(base+path,{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(cookie&&useCookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
   if(r.status!==429||expected===429||attempt===24)break;await r.arrayBuffer();await new Promise(done=>setTimeout(done,30000));
  }
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];const result=await r.json();assert.equal(r.status,expected,'HTTP '+path);return result;
 }
 t.after(async()=>{for(const token of tokens)await request('/_matrix/client/v3/logout',{token,method:'POST',data:{}}).catch(()=>{});});
 await request('/api/register',{method:'POST',data:{username,password,name:username,kind:'human',code:env.SIGNUP_CODE},expected:201});
 const first=await request('/api/auth/password',{method:'POST',data:{username,password}});tokens.push(first.access_token);assert.ok(first.access_token);
 assert.equal((await request('/api/security/status',{token:first.access_token})).totpEnabled,false);
 const enrollment=await request('/api/security/totp/begin',{token:first.access_token,method:'POST',data:{password}});
 await request('/api/security/totp/confirm',{token:first.access_token,method:'POST',data:{password:'incorrect-password-123',code:totp(decode32(enrollment.secret))},expected:401});
 const {backupCodes}=await request('/api/security/totp/confirm',{token:first.access_token,method:'POST',data:{password,code:totp(decode32(enrollment.secret))}});assert.equal(backupCodes.length,10);
 const primary={type:'m.login.password',identifier:{type:'m.id.user',user:username},password};
 await request('/_matrix/client/v3/login',{base:'http://127.0.0.1:8008',method:'POST',data:primary,expected:403});
 await request('/_matrix/client/v3/login',{method:'POST',data:primary,expected:403});
 const challenge=await request('/api/auth/password',{method:'POST',data:{username,password}});assert.equal(challenge.mfaRequired,true);assert.equal(challenge.access_token,undefined);
 await request('/api/auth/verify',{method:'POST',data:{id:challenge.id,code:backupCodes[0]},useCookie:false,expected:403});
 const session=await request('/api/auth/verify',{method:'POST',data:{id:challenge.id,code:backupCodes[0]}});tokens.push(session.access_token);assert.equal(session.user_id,first.user_id);
 await request('/api/auth/verify',{method:'POST',data:{id:challenge.id,code:backupCodes[1]},expected:403});
 const next=await request('/api/auth/password',{method:'POST',data:{username,password}});
 await request('/api/auth/verify',{method:'POST',data:{id:next.id,code:backupCodes[0]},expected:403});
 const second=await request('/api/auth/verify',{method:'POST',data:{id:next.id,code:backupCodes[1]}});tokens.push(second.access_token);
 assert.equal((await request('/api/security/status',{token:second.access_token})).backupCodesRemaining,8);
 await request('/api/security/totp/disable',{token:second.access_token,method:'POST',data:{password,code:backupCodes[2]}});
 assert.equal((await request('/api/security/status',{token:second.access_token})).totpEnabled,false);
 const restored=await request('/_matrix/client/v3/login',{base:'http://127.0.0.1:8008',method:'POST',data:primary});tokens.push(restored.access_token);assert.equal(restored.user_id,first.user_id);
});
