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
export function filterContacts(contacts,query){const q=query.trim().toLocaleLowerCase('fr');return contacts.filter(contact=>(contact.name+' '+contact.mxid).toLocaleLowerCase('fr').includes(q));}
export async function showContactList({messenger,dialog,el,field,button,getDialog,openRoom,addContact,notice,confirmRemove=message=>globalThis.confirm(message)}){
 const generation=messenger.scope.generation,body=dialog('Mes contacts');
 const check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!getDialog().open)throw Error('Cette liste est fermée. Rouvrez vos contacts.');};
 const options={messenger,dialog,el,field,button,getDialog,openRoom,addContact,notice,confirmRemove};
 const search=field('Rechercher dans mes contacts','search'),status=el('p'),feedback=el('div'),list=el('div');status.setAttribute('role','status');
 body.append(el('p','Votre carnet est personnel à votre compte. Ajouter un contact ne l’autorise pas automatiquement à vous écrire.'),button('Ajouter un contact',addContact,'primary'),search.wrapper,status,feedback,list);let contacts=[];
 function paint(){check();list.replaceChildren();const found=filterContacts(contacts,search.input.value);status.textContent=found.length+' contact(s) affiché(s) sur '+contacts.length;
  if(!found.length)list.append(el('p',contacts.length?'Aucun contact ne correspond à votre recherche.':'Votre liste est vide. Ajoutez une adresse avec « Ajouter un contact ».'));
  for(const contact of found){const row=el('section',undefined,'access-option');row.append(el('h3',contact.name),el('pre',contact.mxid));
   row.append(button('Écrire à ce contact',()=>{
    check();const detail=dialog('Écrire à '+contact.name),current=()=>{messenger.scope.assert(generation);if(!detail.isConnected||!getDialog().open)throw Error('Cette fenêtre est fermée.');};
    detail.append(el('pre',contact.mxid));const rooms=messenger.rooms().filter(room=>room.getMyMembership()==='join'&&room.getJoinedMembers().some(member=>member.userId===contact.mxid));
    detail.append(el('p',rooms.length?'Choisissez un échange existant ou invitez ce contact dans une nouvelle conversation.':'Aucune conversation rejointe avec ce contact. Vous pouvez lui envoyer une invitation.'));
    for(const room of rooms)detail.append(button('Ouvrir : '+(room.name||'Conversation'),()=>{current();getDialog().close();openRoom(room.roomId);}));
    detail.append(button('Inviter dans une nouvelle conversation',async()=>{current();const id=await messenger.createConversation([contact.mxid]);current();getDialog().close();openRoom(id);notice('Invitation envoyée. Le contact doit l’accepter.');},'primary'),button('Retour à mes contacts',()=>showContactList(options)));
   }));
   row.append(button('Renommer',()=>{check();const edit=dialog('Renommer le contact'),name=field('Nom dans mon carnet','text',contact.name);name.input.maxLength=80;edit.append(el('pre',contact.mxid),name.wrapper,button('Enregistrer le nom',async()=>{messenger.scope.assert(generation);if(!edit.isConnected||!getDialog().open)throw Error('Cette fenêtre est fermée.');if(!name.input.value.trim())throw Error('Saisissez un nom.');await messenger.api('/address-book','POST',{action:'save',mxid:contact.mxid,name:name.input.value.trim()});messenger.scope.assert(generation);if(!edit.isConnected||!getDialog().open)return;await showContactList(options);},'primary'),button('Annuler',()=>showContactList(options)));name.input.focus();}));
   row.append(button('Retirer de mes contacts',async()=>{check();if(!await confirmRemove('Retirer « '+contact.name+' » ('+contact.mxid+') de vos contacts ? Les conversations seront conservées et ce compte ne sera pas bloqué.'))return;check();await messenger.api('/address-book','POST',{action:'remove',mxid:contact.mxid});check();contacts=contacts.filter(item=>item.mxid!==contact.mxid);paint();feedback.replaceChildren(el('p','Contact retiré. Les conversations sont conservées.'),button('Annuler le retrait',async()=>{check();await messenger.api('/address-book','POST',{action:'save',mxid:contact.mxid,name:contact.name});check();await load();feedback.replaceChildren();}));}));list.append(row);
  }
 }
 async function load(){status.textContent='Chargement de vos contacts…';const result=await messenger.api('/address-book');check();contacts=result.contacts;paint();}
 search.input.oninput=paint;
 try{await load();}catch(error){if(body.isConnected&&getDialog().open){status.textContent=error.message||'Chargement impossible.';body.append(button('Réessayer',load));}else throw error;}
}
