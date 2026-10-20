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
import {Wallet} from 'ethers';
import {Store} from '../server/store.mjs';
import {WalletAuth,matrixWalletJwt} from '../server/wallet.mjs';
test('wallet proof binds origin, purpose, browser and account, and cannot be replayed',async()=>{
 const store=new Store(':memory:');try{const service=new WalletAuth(store,'https://polytalk.example'),user=store.ensure('@alice:local','Alice'),wallet=Wallet.createRandom(),browser='a'.repeat(64);
 const challenge=service.challenge({address:wallet.address,chainId:1,purpose:'link'},browser,user);assert.match(challenge.message,/polytalk\.example wants/);assert.match(challenge.message,/URI: https:\/\/polytalk\.example\//);assert.match(challenge.message,/Nonce: [a-f0-9]{48}/);
 const signature=await wallet.signMessage(challenge.message);assert.throws(()=>service.consume({id:challenge.id,signature},'b'.repeat(64),'link',user),/Preuve/);assert.throws(()=>service.consume({id:challenge.id,signature},browser,'login'),/Preuve/);
 const otherOrigin=new WalletAuth(store,'https://other.example');assert.throws(()=>otherOrigin.consume({id:challenge.id,signature},browser,'link',user),/Preuve/);
 const proof=service.consume({id:challenge.id,signature},browser,'link',user);service.link(user,proof);assert.equal(service.owner(wallet.address.toLowerCase()).mxid,user.mxid);assert.throws(()=>service.consume({id:challenge.id,signature},browser,'link',user),/Preuve/);
 const other=store.ensure('@bob:local','Bob');assert.throws(()=>service.link(other,proof),/déjà associé/);
 }finally{store.close();}
});
test('wallet rejects tampered messages, expired challenges and forged JWT destinations',async()=>{
 const store=new Store(':memory:');try{const service=new WalletAuth(store,'https://polytalk.example'),wallet=Wallet.createRandom(),browser='a'.repeat(64);let challenge=service.challenge({address:wallet.address,chainId:1,purpose:'login'},browser);
 const changed=await wallet.signMessage(challenge.message.replace('polytalk.example','attacker.example'));assert.throws(()=>service.consume({id:challenge.id,signature:changed},browser,'login'),/Signature/);
 const signature=await wallet.signMessage(challenge.message);store.db.prepare('UPDATE wallet_challenges SET expires_at=0').run();assert.throws(()=>service.consume({id:challenge.id,signature},browser,'login'),/Preuve/);
 assert.throws(()=>matrixWalletJwt('@alice:other','local','https://polytalk.example','s'.repeat(43)));
 const payload=JSON.parse(Buffer.from(matrixWalletJwt('@alice:local','local','https://polytalk.example','s'.repeat(43)).split('.')[1],'base64url'));assert.equal(payload.sub,'alice');assert.equal(payload.aud,'https://polytalk.example');assert.equal(payload.exp-payload.iat,60);
 }finally{store.close();}
});
