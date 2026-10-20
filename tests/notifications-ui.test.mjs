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
import {notificationItems,showNotifications} from '../web/notifications-ui.js';
import {SessionScope} from '../web/session-scope.js';
const room=(id,membership,count=0)=>({roomId:id,name:'Salon '+id,getMyMembership:()=>membership,getUnreadNotificationCount:()=>count,getDMInviter:()=> '@peer:local'});
test('centre always exposes invitations and separates unread rooms without accepting anything',()=>{
 const items=notificationItems([room('!invite','invite'),room('!unread','join',3),room('!read','join'),room('!left','leave',7)]);
 assert.deepEqual(items.map(i=>[i.kind,i.roomId,i.count]),[['invitation','!invite',1],['unread','!unread',3]]);
});
test('invitation acceptance is explicit and cannot open a view after it was closed',async()=>{
 const scope=new SessionScope();scope.begin();let resolve,joins=0,opened=0;
 const nodes=[],body={isConnected:true,append(){},replaceChildren(){}},modal=new EventTarget();modal.open=true;modal.close=()=>{modal.open=false;modal.dispatchEvent(new Event('close'));};
 const el=(tag,text)=>({tag,text,append(){},setAttribute(){}});
 const messenger=new EventTarget();messenger.scope=scope;messenger.rooms=()=>[room('!invite','invite')];messenger.client={getRoom:()=>room('!invite','invite'),joinRoom:()=>{joins++;return new Promise(done=>resolve=done);}};
 showNotifications({messenger,dialog:()=>body,el,button:(text,action)=>{const b={text,action};nodes.push(b);return b;},getDialog:()=>modal,openRoom:()=>opened++,notice(){}});
 assert.equal(joins,0);const action=nodes.find(n=>n.text==='Accepter').action();assert.equal(joins,1);
 modal.close();resolve();await assert.rejects(action,/fermée/);assert.equal(opened,0);
});
