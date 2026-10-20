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
import {createIdentity,exportIdentity,importIdentity,signIdentityChallenge} from '../web/identity-recovery.js';
const options={origin:'https://chat.example',serverName:'example',username:'camille',name:'Camille',kind:'human'};
test('local identity export is encrypted and restores the same key without exposing private credentials',async()=>{
 const {identity,recoveryCode}=createIdentity(options);assert.match(recoveryCode,/^[A-Za-z0-9_-]{32}$/);assert.match(identity.address,/^0x[0-9a-fA-F]{40}$/);assert.ok(identity.accountPassword.length>=32);
 const file=await exportIdentity(identity,recoveryCode);assert.equal(file.includes(identity.privateKey),false);assert.equal(file.includes(identity.accountPassword),false);assert.equal(file.includes(recoveryCode),false);
 assert.deepEqual(await importIdentity(file,recoveryCode,options.origin),identity);
 await assert.rejects(importIdentity(file,'x'.repeat(32),options.origin),/incorrecte|endommagées/);
 await assert.rejects(importIdentity(file,recoveryCode,'https://other.example'),/installation/);
 const changed=JSON.parse(file);changed.box.data=(changed.box.data[0]==='A'?'B':'A')+changed.box.data.slice(1);await assert.rejects(importIdentity(JSON.stringify(changed),recoveryCode,options.origin));
});
test('identity validates public metadata and accepts an optional existing account password',()=>{
 assert.throws(()=>createIdentity({...options,username:'admin'}),/identifiant/i);assert.throws(()=>createIdentity({...options,origin:'http://remote.example'}),/HTTPS/);assert.throws(()=>createIdentity({...options,password:'short'}),/12/);
 assert.equal(createIdentity({...options,password:'a chosen account password'}).identity.accountPassword,'a chosen account password');
});
test('local signing accepts only the exact expiring PolyTalk SIWE challenge and never foreign or arbitrary text',async()=>{
 const {identity}=createIdentity(options),now=Date.now(),id=crypto.randomUUID(),nonce='a'.repeat(48),issued=new Date(now).toISOString(),expires=new Date(now+300000).toISOString();
 const challenge={id,address:identity.address,chainId:1,expiresAt:expires,message:`chat.example wants you to sign in with your Ethereum account:\n${identity.address}\n\nSign in to PolyTalk. No transaction. No access to funds.\n\nURI: ${options.origin}/\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issued}\nExpiration Time: ${expires}\nRequest ID: ${id}`};
 const proof=await signIdentityChallenge(identity,challenge,'login');assert.equal(verifyMessage(challenge.message,proof.signature),identity.address);
 await assert.rejects(signIdentityChallenge(identity,{...challenge,message:'Transfer all funds'},'login'),/défi/i);
 await assert.rejects(signIdentityChallenge(identity,{...challenge,message:challenge.message.replaceAll('chat.example','foreign.example')},'login'),/défi/i);
 await assert.rejects(signIdentityChallenge(identity,challenge,'link'),/défi/i);
 await assert.rejects(signIdentityChallenge(identity,challenge,'login',now+400000),/expir/i);
});
