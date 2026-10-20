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
import {verifyMessage} from 'ethers';
import {createIdentity} from '../web/identity-recovery.js';
import {IdentityClient} from '../web/identity-client.js';
const origin='https://chat.example';
function fixture(){
 const {identity}=createIdentity({origin,serverName:'example',username:'camille'}),calls=[];let purpose,failLink=false,registrations=0;
 const user='@camille:example',session={user_id:user,device_id:'DEVICE',access_token:'matrix-token'};
 const fetchImpl=async(url,init={})=>{const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;calls.push({path,body,headers:init.headers});let data={};
  if(path==='/api/config')data={origin,serverName:'example',matrixBase:origin,walletEnabled:true};
  else if(path==='/api/register'){registrations++;data={user_id:user};}
  else if(path==='/api/auth/password')data=session;
  else if(path==='/api/wallet/challenge'){purpose=body.purpose;const now=Date.now(),id=crypto.randomUUID(),expiresAt=new Date(now+300000).toISOString();data={id,address:identity.address,chainId:1,expiresAt,message:`chat.example wants you to sign in with your Ethereum account:\n${identity.address}\n\n${purpose==='link'?`Link this wallet to PolyTalk account ${user}.`:'Sign in to PolyTalk.'} No transaction. No access to funds.\n\nURI: ${origin}/\nVersion: 1\nChain ID: 1\nNonce: ${'a'.repeat(48)}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${expiresAt}\nRequest ID: ${id}`};fixture.lastChallenge=data;}
  else if(path==='/api/wallet/link'||path==='/api/wallet/login'){assert.equal(verifyMessage(fixture.lastChallenge.message,body.signature),identity.address);if(path.endsWith('link')&&failLink)return new Response(JSON.stringify({error:'Link unavailable'}),{status:503});data=path.endsWith('link')?{wallets:[{address:identity.address.toLowerCase()}]}:session;}
  return new Response(JSON.stringify(data));
 };return {identity,calls,session,client:new IdentityClient({origin,fetchImpl}),setFail:v=>failLink=v,registrations:()=>registrations};
}
test('local identity enrolls through existing authenticated APIs and never transmits its private key',async()=>{
 const f=fixture(),state={registered:false,linked:false};const result=await f.client.enroll(f.identity,{state});assert.equal(result.session.access_token,'matrix-token');assert.equal(state.linked,true);assert.equal(f.registrations(),1);
 assert.equal(JSON.stringify(f.calls).includes(f.identity.privateKey),false);const link=f.calls.find(c=>c.path==='/api/wallet/link');assert.equal(link.headers.Authorization,'Bearer matrix-token');
 const login=await f.client.login(f.identity);assert.equal(login.session.user_id,'@camille:example');assert.equal(f.calls.filter(c=>c.path==='/api/auth/password').length,1);
});
test('failed association revokes the temporary session and retries do not recreate the account',async()=>{
 const f=fixture(),state={registered:false,linked:false};f.setFail(true);await assert.rejects(f.client.enroll(f.identity,{state}),/Link unavailable/);assert.equal(state.registered,true);assert.equal(state.linked,false);assert.ok(f.calls.some(c=>c.path==='/_matrix/client/v3/logout'));
 f.setFail(false);await f.client.enroll(f.identity,{state});assert.equal(f.registrations(),1);
});
test('cancellation during a primary login revokes a late session instead of leaking it',async()=>{
 const f=fixture(),controller=new AbortController(),calls=[];
 const client=new IdentityClient({origin,signal:controller.signal,fetchImpl:async(url,init)=>{
  calls.push(new URL(url).pathname);if(url.endsWith('/api/config'))return new Response(JSON.stringify({origin,serverName:'example',matrixBase:origin,walletEnabled:true}));
  if(url.endsWith('/api/auth/password')){controller.abort();return new Response(JSON.stringify(f.session));}return new Response('{}');
 }});
 await assert.rejects(client.enroll(f.identity,{state:{registered:true,linked:false}}),/annulée/);assert.ok(calls.includes('/_matrix/client/v3/logout'));
});
