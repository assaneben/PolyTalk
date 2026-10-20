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
import {accessOptions} from '../web/access-options.js';

test('access guidance recommends local unlock only when a saved vault exists',()=>{
 const fresh=accessOptions({hasVault:false,walletEnabled:false});
 assert.equal(fresh.find(x=>x.recommended).id,'signup');
 assert.equal(fresh.some(x=>x.id==='unlock'),false);
 const returning=accessOptions({hasVault:true,walletEnabled:true});
 assert.equal(returning.find(x=>x.recommended).id,'unlock');
 assert.equal(returning.filter(x=>x.recommended).length,1);
 assert.equal(returning.find(x=>x.id==='wallet').action,'wallet');
});

test('planned methods never become actionable from browser capability alone',()=>{
 for(const walletEnabled of [true,false]){
  const options=accessOptions({hasVault:false,walletEnabled,passkeySupported:true});
  for(const id of ['identity','cloud']){
   const option=options.find(x=>x.id===id);
   assert.equal(option.action,null);assert.equal(option.status,'planned');
  }
  assert.equal(options.find(x=>x.id==='wallet').action,walletEnabled?'wallet':null);
  assert.equal(options.find(x=>x.id==='passkey').action,null);
 }
});
test('passkey login requires both actual server integration and browser support',()=>{
 assert.equal(accessOptions({passkeysEnabled:true,passkeySupported:true}).find(x=>x.id==='passkey').action,'passkey');
 assert.equal(accessOptions({passkeysEnabled:true,passkeySupported:false}).find(x=>x.id==='passkey').action,null);
});
