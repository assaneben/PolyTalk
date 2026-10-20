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
import {showNotifications} from '../web/notifications-ui.js';
import {SessionScope} from '../web/session-scope.js';
test('unchanged notification events preserve the current controls; changed membership refreshes them',()=>{
 const messenger=new EventTarget();messenger.scope=new SessionScope();messenger.scope.begin();let membership='invite',replaced=0;
 const room={roomId:'!qa',name:'Synthetic',getMyMembership:()=>membership,getUnreadNotificationCount:()=>0};messenger.rooms=()=>[room];
 const modal=new EventTarget();modal.open=true;const node=()=>({isConnected:true,dataset:{},append(){},replaceChildren(){replaced++;}}),body=node();
 showNotifications({messenger,dialog:()=>body,el:node,button:node,getDialog:()=>modal,openRoom(){},notice(){}});
 assert.equal(replaced,1);messenger.dispatchEvent(new Event('change'));assert.equal(replaced,1);
 membership='join';messenger.dispatchEvent(new Event('change'));assert.equal(replaced,2);
 modal.open=false;modal.dispatchEvent(new Event('close'));membership='invite';messenger.dispatchEvent(new Event('change'));assert.equal(replaced,2);
});
