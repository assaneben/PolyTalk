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
import {initAsync} from '@matrix-org/matrix-sdk-crypto-wasm';
import {protectRoomKeys,restoreRoomKeys} from '../web/key-transfer.js';
test('official interoperable room-key export roundtrips and rejects wrong password',async()=>{
  await initAsync();
  const keys='[]';const armored=await protectRoomKeys(keys,'a strong independent backup phrase');
  assert.match(armored,/BEGIN MEGOLM SESSION DATA/);
  assert.equal(await restoreRoomKeys(armored,'a strong independent backup phrase'),'[]');
  await assert.rejects(restoreRoomKeys(armored,'a different backup phrase'));
});
test('room-key export requires a strong passphrase before emitting any data',async()=>{
  await assert.rejects(protectRoomKeys('[]','short'),/12/);
});
