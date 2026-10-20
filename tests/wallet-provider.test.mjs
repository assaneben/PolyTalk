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
import {signWalletChallenge} from '../web/wallet-provider.js';
import {connectWalletConnect} from '../web/walletconnect.js';
test('an unresponsive wallet releases the guided login with an actionable error',async()=>{await assert.rejects(signWalletChallenge({request:()=>new Promise(()=>{})},async()=>{},'login',()=>{},5),/ne répond pas/);});
test('injected wallet signs only personal_sign and detects an account switch',async()=>{
 const address='0x'+'1'.repeat(40),calls=[];let switchAccount=false;
 const provider={async request({method,params}){calls.push({method,params});if(method==='eth_chainId')return '0x1';if(method==='personal_sign')return '0x'+'1'.repeat(130);return [switchAccount&&method==='eth_accounts'?'0x'+'2'.repeat(40):address];}};
 const api=async()=>({id:'challenge',message:'PolyTalk login'});assert.equal((await signWalletChallenge(provider,api,'login')).id,'challenge');assert.ok(calls.some(call=>call.method==='personal_sign'));assert.ok(!calls.some(call=>/Transaction|TypedData|eth_sign$/.test(call.method)));switchAccount=true;await assert.rejects(signWalletChallenge(provider,api,'login'),/changé/);
});
test('WalletConnect requests a signing-only session, closes it and requires a real project configuration',async()=>{
 let options,connection,closed=false,stopped=false;const account='0x'+'1'.repeat(40);
 const init=async value=>{options=value;return {connect:async value=>{connection=value;return {uri:'wc:pairing',approval:async()=>({topic:'topic',namespaces:{eip155:{accounts:['eip155:1:'+account],methods:['personal_sign']}}})};},request:async()=> 'signature',disconnect:async()=>{closed=true;},core:{heartbeat:{stop(){stopped=true;}},relayer:{transportClose:async()=>{}}}};};
 await assert.rejects(connectWalletConnect({projectId:'',origin:'https://local',init}),/Project ID/);
 const provider=await connectWalletConnect({projectId:'1'.repeat(32),origin:'https://local',onUri:async()=>{},init});assert.equal(options.telemetryEnabled,false);assert.deepEqual(connection.requiredNamespaces.eip155.methods,['personal_sign']);assert.equal(await provider.request({method:'eth_chainId'}),'0x1');await assert.rejects(provider.request({method:'eth_sendTransaction',params:[]}),/interdite/);await provider.disconnect();assert.equal(closed,true);assert.equal(stopped,true);
});
