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
export function notificationItems(rooms){
 return rooms.flatMap(room=>{
  const membership=room.getMyMembership();
  if(membership==='invite')return [{kind:'invitation',roomId:room.roomId,name:room.name||'Conversation privée',inviter:room.getDMInviter?.()||null,count:1}];
  const count=room.getUnreadNotificationCount?.('total')||0;
  return membership==='join'&&count>0?[{kind:'unread',roomId:room.roomId,name:room.name||'Conversation privée',count}]:[];
 });
}
export function showNotifications({messenger,dialog,el,button,getDialog,openRoom,notice,confirmReject=message=>globalThis.confirm(message)}){
 const generation=messenger.scope.generation,body=dialog('Notifications et invitations');let busy=false,snapshot=null;
 const check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!getDialog().open)throw Error('Cette vue est fermée. Rouvrez les notifications.');};
 const open=id=>{check();getDialog().close();openRoom(id);};
 async function respond(id,accept){
  check();if(busy)return;
  if(messenger.client.getRoom(id)?.getMyMembership()!=='invite')throw Error('Cette invitation n’est plus en attente.');
  busy=true;
  try{
   if(!accept){const approved=await confirmReject('Refuser l’invitation à « '+(messenger.client.getRoom(id)?.name||'Conversation privée')+' » ('+id+') ? Vous ne rejoindrez pas cette conversation.');check();if(!approved)return;}
   if(messenger.client.getRoom(id)?.getMyMembership()!=='invite')throw Error('Cette invitation n’est plus en attente.');
   if(accept)await messenger.client.joinRoom(id);else await messenger.client.leave(id);
   check();if(accept)open(id);else{paint();notice('Invitation refusée.');}
  }
  finally{busy=false;}
 }
 function action(title,handler,key,kind){const node=button(title,handler,kind);if(node.dataset)node.dataset.notificationKey=key;return node;}
 function paint(){
  check();const items=notificationItems(messenger.rooms()),next=JSON.stringify(items);if(next===snapshot)return;snapshot=next;const focused=globalThis.document?.activeElement?.dataset?.notificationKey;body.replaceChildren();
  body.append(el('p','Consultez les invitations reçues et les conversations non lues. Accepter une invitation vous fait rejoindre le salon ; aucune invitation n’est acceptée automatiquement.'));
  for(const [kind,title] of [['invitation','Invitations reçues'],['unread','Conversations non lues']]){
   const list=items.filter(item=>item.kind===kind);body.append(el('h3',title+' ('+list.length+')'));
   if(!list.length)body.append(el('p',kind==='invitation'?'Aucune invitation en attente.':'Aucune conversation signalée non lue.','hint'));
   for(const item of list){const row=el('section',undefined,'access-option');row.append(el('h4',item.name));
    if(kind==='invitation'){row.append(el('p',item.inviter?'Invitation de '+item.inviter:'Invitation privée reçue'),action('Consulter',()=>open(item.roomId),item.roomId+'|view'),action('Accepter',()=>respond(item.roomId,true),item.roomId+'|accept','primary'),action('Refuser',()=>respond(item.roomId,false),item.roomId+'|reject'));}
    else row.append(el('p',item.count+' notification(s) de message'),action('Ouvrir la conversation',()=>open(item.roomId),item.roomId+'|view'));
    body.append(row);
   }
  }
  if(focused){const target=[...(body.querySelectorAll?.('[data-notification-key]')||[])].find(node=>node.dataset.notificationKey===focused);if(target)target.focus({preventScroll:true});else getDialog().querySelector?.('#dialog-title')?.focus({preventScroll:true});}
 }
 const refresh=()=>{if(messenger.scope.current(generation)&&body.isConnected&&getDialog().open&&!busy)paint();else if(!body.isConnected||!getDialog().open)messenger.removeEventListener('change',refresh);};
 messenger.addEventListener('change',refresh);getDialog().addEventListener('close',()=>messenger.removeEventListener('change',refresh),{once:true});paint();
}
