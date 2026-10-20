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
export function conversationSecurityLabel(room){
 const encryption=room.currentState?.getStateEvents('m.room.encryption','')?.getContent?.();
 return encryption?.algorithm==='m.megolm.v1.aes-sha2'?'Chiffrement de bout en bout':'Chiffrement non confirmé';
}
export function restoreRoomFocus(container,roomId){
 if(!roomId)return;
 const row=[...container.querySelectorAll('[data-room-id]')].find(node=>node.dataset.roomId===roomId);
 row?.focus({preventScroll:true});
}
export function focusConversation(get,selected){
 get('skip-link').href=selected?'#thread-main':'#conversation-list';
 get(selected?'thread-main':'conversation-list').focus({preventScroll:true});
}
export function displayNotice(get,text,error=false){
 const inside=get('dialog').open,node=get(inside?'dialog-notice':'notice'),other=get(inside?'notice':'dialog-notice');
 other.textContent='';other.hidden=true;node.textContent=text;node.hidden=false;node.setAttribute('role',error?'alert':'status');return node;
}
export function announceMessageUpdate(container,status,roomId,lastId){
 const changed=container.dataset.announcedRoom===roomId&&container.dataset.announcedEvent!==lastId;
 container.dataset.announcedRoom=roomId;container.dataset.announcedEvent=lastId;
 if(changed)status.textContent='La conversation a été actualisée. Consultez les derniers messages.';
}
