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
import {ClientState,validateResume,acceptsSender} from '../web/client-state.js';

test('sending is refused until crypto and synchronization are ready and after lock',()=>{
  const state=new ClientState();
  assert.throws(()=>state.assertSend(),/chiffrement/);
  state.transition('connecting');state.transition('syncing');
  assert.throws(()=>state.assertSend(),/chiffrement/);
  state.transition('ready');assert.doesNotThrow(()=>state.assertSend());
  state.transition('offline');assert.throws(()=>state.assertSend(),/chiffrement/);
  state.transition('locked');assert.throws(()=>state.assertSend(),/chiffrement/);
});
test('resuming saved device refuses missing crypto database or changed identity',()=>{
  const saved={userId:'@alice:localhost',deviceId:'ABC',identity:'curve-key'};
  assert.throws(()=>validateResume(saved,false,'curve-key'),/introuvable/);
  assert.throws(()=>validateResume(saved,true,'other-key'),/identité/);
  assert.doesNotThrow(()=>validateResume(saved,true,'curve-key'));
});
test('policy filtering fails closed and block overrides allow before display',()=>{
  assert.equal(acceptsSender(null,'@a:localhost'),false);
  assert.equal(acceptsSender({mode:'open',rules:[]},'@a:localhost'),true);
  assert.equal(acceptsSender({mode:'allowlist',rules:[]},'@a:localhost'),false);
  assert.equal(acceptsSender({mode:'allowlist',rules:[{target:'@a:localhost',action:'allow'},{target:'@a:localhost',action:'block'}]},'@a:localhost'),false);
});
test('incoming events remain hidden while their current policy is being checked',()=>{
  const policy={mode:'open',rules:[]};
  assert.equal(acceptsSender(policy,'@a:localhost',true),false);
  assert.equal(acceptsSender(policy,'@a:localhost',false),true);
});
