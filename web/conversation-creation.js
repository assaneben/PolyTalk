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
const eventType='io.polytalk.creation.v1';
export class ConversationCreation {
 constructor({storage,account,randomId=()=>crypto.randomUUID(),locks=globalThis.navigator?.locks}){
  this.storage=storage;this.key='polytalk.pending-creation.v1:'+JSON.stringify(account);this.randomId=randomId;this.locks=locks;
 }
 pending(){
  let value;try{value=this.storage.getItem(this.key);}catch{throw Error('Le suivi local des créations est indisponible. Aucune invitation n’a été envoyée.');}
  if(value===null)return null;
  if(!/^[0-9a-f-]{36}$/i.test(value))throw Error('Le suivi local de création est invalide. Conservez ce stockage et contactez votre administrateur.');
  return value;
 }
 async create(client,options,check){
  if(this.locks)return this.locks.request(this.key,{ifAvailable:true},lock=>{
   if(!lock)throw Error('Une création est déjà en cours dans un autre onglet.');
   return this.perform(client,options,check);
  });
  return this.perform(client,options,check);
 }
 async perform(client,options,check){
  check();if(this.pending())throw Error('Une création précédente reste à vérifier. Utilisez « Vérifier la création précédente » avant de réessayer.');
  const id=this.randomId();
  try{this.storage.setItem(this.key,id);if(this.pending()!==id)throw Error();}catch{throw Error('Impossible de conserver le suivi de création. Aucune invitation n’a été envoyée.');}
  try{
   const result=await client.createRoom({...options,initial_state:[...(options.initial_state||[]),{type:eventType,state_key:'',content:{id}}]});
   check();if(typeof result?.room_id!=='string'||!result.room_id.startsWith('!'))throw Error('Réponse de création invalide.');
   if(this.pending()===id)this.storage.removeItem(this.key);
   return result.room_id;
  }catch(error){
   // A definite Matrix client error means this request was rejected, whereas a
   // timeout, proxy failure or malformed response may hide a successful room.
   if(error?.httpStatus>=400&&error.httpStatus<500&&![408,429].includes(error.httpStatus)){
    check();if(this.pending()===id)this.storage.removeItem(this.key);throw error;
   }
   throw Error('La création n’a pas été confirmée. Ne la répétez pas : utilisez « Vérifier la création précédente » après la reconnexion.',{cause:error});
  }
 }
 recover(client,check){
  check();const id=this.pending();if(!id)throw Error('Aucune création en attente de vérification sur ce navigateur.');
  const owner=client.getUserId?.();
  const matches=client.getRooms().filter(room=>{
   const marker=room.currentState.getStateEvents(eventType,''),creation=room.currentState.getStateEvents('m.room.create',''),encryption=room.currentState.getStateEvents('m.room.encryption','');
   return Boolean(owner&&room.getMyMembership()==='join'&&marker?.getContent()?.id===id&&marker.getSender()===owner&&creation?.getSender()===owner&&encryption?.getContent()?.algorithm==='m.megolm.v1.aes-sha2');
  });
  const room=matches.length===1?matches[0]:null;
  if(!room)throw Error('Création encore indéterminée. Attendez la synchronisation puis vérifiez à nouveau. Aucune nouvelle invitation n’a été envoyée.');
  check();this.storage.removeItem(this.key);return room.roomId;
 }
}
