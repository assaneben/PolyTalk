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
const fold=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
export function searchMessages(messenger,{query,roomId='',sender='',limit=100}={}){
 if(typeof query!=='string'||query.trim().length<2||query.length>200)throw Error('Saisissez une recherche de 2 à 200 caractères.');
 if(typeof roomId!=='string'||typeof sender!=='string'||sender.length>255||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Filtres de recherche invalides.');
 const needle=fold(query.trim()),author=fold(sender.trim()),matches=[];let scanned=0,searchable=0,scanLimited=false;
 const seen=new Set();
 outer:for(const room of messenger.rooms()){
  if(room.getMyMembership()!=='join'||roomId&&room.roomId!==roomId)continue;
  for(const event of messenger.messages(room.roomId)){
   if(scanned>=20000){scanLimited=true;break outer;}scanned++;
   if(event.getType()!=='m.room.message'||event.isDecryptionFailure?.()||event.isRedacted?.())continue;
   const content=event.getContent(),id=event.getId();
   if(!id||content['m.relates_to']?.rel_type==='m.replace'||!['m.text','m.notice','m.emote','m.file','m.image','m.audio','m.video'].includes(content.msgtype)||typeof content.body!=='string')continue;
   const key=room.roomId+'\n'+id;if(seen.has(key))continue;seen.add(key);searchable++;
   const body=content.body,index=fold(body).indexOf(needle),from=event.getSender()||'';
   if(index<0||author&&!fold(from).includes(author))continue;
   const start=Math.max(0,index-80),end=Math.min(body.length,index+needle.length+160);
   matches.push({roomId:room.roomId,roomName:room.name||'Conversation privée',eventId:id,sender:from,timestamp:Number.isFinite(event.getTs())?event.getTs():0,snippet:(start?'…':'')+body.slice(start,end)+(end<body.length?'…':'')});
  }
 }
 matches.sort((a,b)=>b.timestamp-a.timestamp||a.eventId.localeCompare(b.eventId));
 return {matches:matches.slice(0,limit),scanned,searchable,truncated:matches.length>limit,scanLimited};
}
