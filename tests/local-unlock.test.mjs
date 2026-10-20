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
import {seal} from '../web/vault.js';
import {createLocalUnlock,openLocalUnlock} from '../web/local-unlock.js';
const origin='https://chat.example.test',phrase='phrase privée du coffre local',credentialId=Buffer.alloc(32,1).toString('base64url');
const credential=(key=new Uint8Array(32).fill(7))=>({get:async({publicKey})=>{assert.equal(publicKey.userVerification,'required');assert.equal(publicKey.rpId,'chat.example.test');return {id:credentialId,getClientExtensionResults:()=>({prf:{results:{first:key.slice().buffer}}})};}});
test('local PRF unlock wraps a validated vault phrase without changing the vault or storing clear secrets',async()=>{
 const vault={id:'device-prefix',box:await seal({prefix:'device-prefix',baseUrl:origin,userId:'@alice:localhost'},phrase)},before=JSON.stringify(vault);
 const record=await createLocalUnlock({vault,phrase,credentialId,origin,credentials:credential()});assert.equal(JSON.stringify(record).includes(phrase),false);assert.equal(JSON.stringify(vault),before);
 assert.equal(await openLocalUnlock({record,vaultId:vault.id,origin,credentials:credential()}),phrase);
 await assert.rejects(openLocalUnlock({record,vaultId:'another-account',origin,credentials:credential()}),/appareil/);
 await assert.rejects(openLocalUnlock({record,vaultId:vault.id,origin:'https://other.example',credentials:credential()}),/appareil/);
 await assert.rejects(openLocalUnlock({record,vaultId:vault.id,origin,credentials:credential(new Uint8Array(32).fill(8))}),/clé/);
});
test('unsupported PRF and incorrect vault phrases never enable a cleartext fallback',async()=>{
 const vault={id:'device-prefix',box:await seal({prefix:'device-prefix',baseUrl:origin},phrase)};
 await assert.rejects(createLocalUnlock({vault,phrase:'incorrect local phrase',credentialId,origin,credentials:credential()}),/Coffre/);
 await assert.rejects(createLocalUnlock({vault,phrase,credentialId,origin,credentials:{get:async()=>({id:credentialId,getClientExtensionResults:()=>({})})}}),/PRF/);
});
test('closing setup during vault validation prevents a late authenticator prompt',async()=>{
 const vault={id:'device-prefix',box:await seal({prefix:'device-prefix',baseUrl:origin},phrase)},controller=new AbortController();let prompts=0;
 const result=createLocalUnlock({vault,phrase,credentialId,origin,signal:controller.signal,credentials:{get:async options=>{prompts++;return credential().get(options);}}});
 controller.abort();await assert.rejects(result,/abort/i);assert.equal(prompts,0);
});
