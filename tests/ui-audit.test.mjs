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
import {conversationSecurityLabel,restoreRoomFocus,focusConversation,displayNotice,announceMessageUpdate} from '../web/ui-accessibility.js';
import {replaceDialogView} from '../web/private-view.js';
test('UI never claims encryption without the actual supported room encryption state',()=>{
 assert.equal(conversationSecurityLabel({}),'Chiffrement non confirmé');
 const room=algorithm=>({currentState:{getStateEvents:()=>({getContent:()=>({algorithm})})}});
 assert.equal(conversationSecurityLabel(room('unknown')),'Chiffrement non confirmé');
 assert.equal(conversationSecurityLabel(room('m.megolm.v1.aes-sha2')),'Chiffrement de bout en bout');
});
test('feedback is placed in the open modal top layer, not behind it',()=>{
 const nodes={dialog:{open:true},notice:{},'dialog-notice':{setAttribute(key,value){this[key]=value;}}};
 assert.equal(displayNotice(id=>nodes[id],'Action refusée',true),nodes['dialog-notice']);assert.equal(nodes['dialog-notice'].role,'alert');assert.equal(nodes.notice.hidden,true);
});
test('message announcements do not reread the entire history or repeat unchanged syncs',()=>{
 const container={dataset:{}},status={textContent:''};announceMessageUpdate(container,status,'!qa','$first');assert.equal(status.textContent,'');
 announceMessageUpdate(container,status,'!qa','$second');assert.match(status.textContent,/actualisée/);status.textContent='';announceMessageUpdate(container,status,'!qa','$second');assert.equal(status.textContent,'');
});
test('mobile navigation directs focus and skip link to the visible pane',()=>{
 const focused=[],nodes={'skip-link':{},'thread-main':{focus:()=>focused.push('thread')},'conversation-list':{focus:()=>focused.push('list')}};
 focusConversation(id=>nodes[id],true);assert.equal(nodes['skip-link'].href,'#thread-main');
 focusConversation(id=>nodes[id],false);assert.equal(nodes['skip-link'].href,'#conversation-list');assert.deepEqual(focused,['thread','list']);
});
test('room refresh restores keyboard focus by stable room identity, never by list position',()=>{
 let focused='';const nodes=['!other','!selected'].map(id=>({dataset:{roomId:id},focus:()=>focused=id}));
 restoreRoomFocus({querySelectorAll:()=>nodes},'!selected');assert.equal(focused,'!selected');
 restoreRoomFocus({querySelectorAll:()=>nodes},'!gone');assert.equal(focused,'!selected');
});
test('dialog replacement announces the new heading through focus',()=>{
 let focus=0;const nodes={dialog:{open:true,dispatchEvent(){}},'dialog-title':{setAttribute(key,value){assert.equal(key,'tabindex');assert.equal(value,'-1');},focus(){focus++;}},'dialog-content':{replaceChildren(){}}};
 replaceDialogView(id=>nodes[id],()=>({}),'Paramètres');assert.equal(focus,1);assert.equal(nodes['dialog-title'].textContent,'Paramètres');
});
