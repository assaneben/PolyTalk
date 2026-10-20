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
import {seal,unseal} from '../web/vault.js';
test('saved vault hides token and authenticates password and tampering',async()=>{
  const session={accessToken:'secret-token-123',deviceId:'DEVICE'};
  const box=await seal(session,'a long unique passphrase');
  assert.equal(JSON.stringify(box).includes('secret-token-123'),false);
  assert.deepEqual(await unseal(box,'a long unique passphrase'),session);
  await assert.rejects(unseal(box,'wrong long passphrase'));
  const corrupt={...box,data:(box.data[0]==='A'?'B':'A')+box.data.slice(1)};
  await assert.rejects(unseal(corrupt,'a long unique passphrase'));
});
test('short storage passwords cannot create saved credentials',async()=>{
  await assert.rejects(seal({accessToken:'x'},'short'),/12/);
});

import {readVaults,saveVault,vaultKey} from '../web/vault.js';
test('connecting another account preserves the previously saved encrypted vault',()=>{
  const data=new Map([[vaultKey,JSON.stringify({version:1,data:'legacy-ciphertext'})]]);
  const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  saveVault(storage,{prefix:'bob-device',userId:'@bob:localhost',deviceId:'BOB'},{version:1,data:'bob-ciphertext'});
  const entries=readVaults(storage);
  assert.equal(entries.length,2);
  assert.equal(entries[0].box.data,'legacy-ciphertext');
  assert.equal(entries[1].box.data,'bob-ciphertext');
  saveVault(storage,{prefix:'bob-device',userId:'@bob:localhost',deviceId:'BOB'},{version:1,data:'bob-updated'});
  assert.equal(readVaults(storage).length,2);
  assert.equal(readVaults(storage)[1].box.data,'bob-updated');
});
