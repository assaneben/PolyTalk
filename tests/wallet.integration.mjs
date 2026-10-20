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
import {Wallet} from 'ethers';
test('real Ethereum signature links an existing account and opens a real Matrix session',{timeout:60000},async()=>{
 const origin='http://localhost:3210',env=parseEnv(await readFile('.env','utf8')),suffix=randomBytes(5).toString('hex'),username='walletqa'+suffix,password=randomBytes(24).toString('base64url');let cookie='';const tokens=[];
 async function request(path,{method='GET',body,token,expected=200}={}){
  const response=await fetch(origin+path,{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];const value=await response.json();assert.equal(response.status,expected,'Unexpected service status for '+path);return value;
 }
 try{
  assert.equal((await request('/api/config')).walletEnabled,true,'Run setup and restart Synapse/PolyTalk before this qualification');
  await request('/api/register',{method:'POST',body:{username,password,name:'Wallet qualification',kind:'human',code:env.SIGNUP_CODE},expected:201});
  const initial=await request('/_matrix/client/v3/login',{method:'POST',body:{type:'m.login.password',identifier:{type:'m.id.user',user:username},password}});tokens.push(initial.access_token);
  const wallet=Wallet.createRandom();const link=await request('/api/wallet/challenge',{method:'POST',token:initial.access_token,body:{address:wallet.address,chainId:1,purpose:'link'}});
  await request('/api/wallet/link',{method:'POST',token:initial.access_token,body:{id:link.id,signature:await wallet.signMessage(link.message),password}});
  const challenge=await request('/api/wallet/challenge',{method:'POST',body:{address:wallet.address,chainId:1,purpose:'login'}}),proof={id:challenge.id,signature:await wallet.signMessage(challenge.message)};
  const authenticated=await request('/api/wallet/login',{method:'POST',body:proof});tokens.push(authenticated.access_token);assert.equal(authenticated.user_id,initial.user_id);assert.notEqual(authenticated.device_id,initial.device_id);
  const who=await request('/_matrix/client/v3/account/whoami',{token:authenticated.access_token});assert.equal(who.user_id,initial.user_id);
  await request('/api/wallet/login',{method:'POST',body:proof,expected:403});
  await request('/api/wallet/unlink',{method:'POST',token:authenticated.access_token,body:{address:wallet.address,password}});
  assert.equal((await request('/api/wallet/list',{token:authenticated.access_token})).wallets.length,0);
 }finally{for(const token of tokens)await request('/_matrix/client/v3/logout',{method:'POST',token,body:{}}).catch(()=>{});}
});
