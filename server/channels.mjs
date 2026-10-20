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
import {CoordinationError} from './coordination.mjs';
const fail=(status,message)=>{throw new CoordinationError(status,message);};
const shape=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
export class Channels{
 constructor(store){this.store=store;this.db=store.db;this.db.exec(`CREATE TABLE IF NOT EXISTS coordination_channels(room_id TEXT PRIMARY KEY,mode TEXT NOT NULL,principal_id TEXT REFERENCES profiles(id),version INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS coordination_channel_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,room_id TEXT NOT NULL,actor_id TEXT,mode TEXT NOT NULL,principal_id TEXT,version INTEGER NOT NULL,created_at TEXT NOT NULL);`);}
 get(roomId){const row=this.db.prepare('SELECT * FROM coordination_channels WHERE room_id=?').get(roomId);return row?{roomId:row.room_id,mode:row.mode,principalId:row.principal_id,version:row.version}:{roomId,mode:'manual',principalId:null,version:0};}
 configure(roomId,input,roster,actorId=null){
  if(!shape(input,['mode','principalId','version'])||!['manual','principal','all'].includes(input.mode)||!Number.isSafeInteger(input.version)||input.version<0)fail(400,'Configuration de canal invalide.');
  if(input.mode==='principal'?!roster.some(agent=>agent.id===input.principalId):input.principalId!==null)fail(400,'Agent principal enregistré et présent requis.');
  this.db.exec('BEGIN IMMEDIATE');try{
   const previous=this.get(roomId);if(previous.version!==input.version)fail(409,'Version du canal modifiée.');
   this.db.prepare('INSERT INTO coordination_channels VALUES(?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET mode=excluded.mode,principal_id=excluded.principal_id,version=excluded.version').run(roomId,input.mode,input.principalId,input.version+1);
   this.db.prepare('INSERT INTO coordination_channel_events(room_id,actor_id,mode,principal_id,version,created_at) VALUES(?,?,?,?,?,?)').run(roomId,actorId,input.mode,input.principalId,input.version+1,new Date().toISOString());
   this.db.exec('COMMIT');return this.get(roomId);
  }catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 resolve(actor,roomId,roster,input){
  if(!shape(input,['mentions'])||!Array.isArray(input.mentions)||input.mentions.length>32||new Set(input.mentions).size!==input.mentions.length||input.mentions.some(id=>typeof id!=='string'||id.length!==36))fail(400,'Sélection de destinataires invalide.');
  const config=this.get(roomId),available=roster.filter(a=>a.id!==actor.id&&this.store.allowed(actor.mxid,a.mxid)&&this.store.allowed(a.mxid,actor.mxid));
  let recipients;
  if(config.mode==='manual'){
   if(!input.mentions.length)fail(400,'Mention explicite d’un agent requise.');
   if(input.mentions.some(id=>!available.some(a=>a.id===id)))fail(403,'Agent mentionné indisponible ou interdit.');
   recipients=input.mentions;
  }else if(config.mode==='principal'){
   if(!available.some(a=>a.id===config.principalId))fail(409,'Agent principal indisponible.');recipients=[config.principalId];
  }else recipients=available.map(a=>a.id);
  if(recipients.length>32)fail(409,'Plus de 32 agents : choisissez le mode manuel ou principal.');
  return {roomId,mode:config.mode,version:config.version,recipients};
 }
}
