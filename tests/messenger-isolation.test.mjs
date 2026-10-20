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
import {Messenger} from '../web/matrix-client.js';
for(const operation of ['sendText','createConversation','verifyDevice'])test('late '+operation+' result cannot commit after an account switch',async()=>{
 const messenger=new Messenger();messenger.scope.begin();messenger.state.transition('ready');let resolve;const pending=new Promise(done=>resolve=done);
 messenger.client={getCrypto:()=>({requestDeviceVerification:()=>pending}),isRoomEncrypted:()=>true,getRoom:()=>({getMyMembership:()=> 'join'}),sendTextMessage:()=>pending,createRoom:()=>pending};
 const result=operation==='sendText'?messenger.sendText('!old','message'):operation==='createConversation'?messenger.createConversation(['@peer:local']):messenger.verifyDevice('@peer:local','DEVICE');
 messenger.scope.begin();resolve({room_id:'!old',event_id:'$old'});await assert.rejects(result,/Session/);
});
