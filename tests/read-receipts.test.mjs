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
test('opening a joined room clears unread counts only after a successful receipt',async()=>{
 const m=new Messenger();m.scope.begin();let resolve,counts=[];const event={getId:()=> '$latest'};
 const room={getMyMembership:()=> 'join',getLiveTimeline:()=>({getEvents:()=>[event]}),setUnreadNotificationCount:(kind,count)=>counts.push([kind,count])};
 m.client={getRoom:()=>room,sendReadReceipt:()=>new Promise(done=>resolve=done)};
 const pending=m.markRead('!room');assert.deepEqual(counts,[]);resolve();await pending;assert.deepEqual(counts,[['total',0],['highlight',0]]);
});
test('invitations never receive an automatic read receipt',async()=>{
 const m=new Messenger();m.scope.begin();m.client={getRoom:()=>({getMyMembership:()=> 'invite'}),sendReadReceipt:()=>{throw Error('must not send');}};await m.markRead('!invite');
});
test('a concurrent new message remains unread when an older receipt finishes',async()=>{
 const m=new Messenger();m.scope.begin();let resolve,counts=[];const events=[{getId:()=> '$old'}];
 const room={getMyMembership:()=> 'join',getLiveTimeline:()=>({getEvents:()=>events}),setUnreadNotificationCount:(kind,count)=>counts.push([kind,count])};
 m.client={getRoom:()=>room,sendReadReceipt:()=>new Promise(done=>resolve=done)};
 const pending=m.markRead('!room');events.push({getId:()=> '$new'});resolve();await pending;assert.deepEqual(counts,[]);
});
