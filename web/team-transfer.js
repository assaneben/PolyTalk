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
import {parseContact} from './contact.js';
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===allowed.length&&Object.keys(value).every(key=>allowed.includes(key));
const label=(text,max)=>typeof text==='string'&&text.trim().length>0&&text.length<=max&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(text);
export function parseTeam(text,origin){
 if(typeof text!=='string'||new TextEncoder().encode(text).length>65536)throw Error('Fichier d’équipe trop volumineux (64 Kio maximum).');
 let team;try{team=JSON.parse(text);}catch{throw Error('Fichier JSON d’équipe invalide.');}
 if(!keys(team,['schema','origin','name','agents'])||team.schema!=='polytalk.team.v1'||team.origin!==origin||!label(team.name,100)||!Array.isArray(team.agents)||team.agents.length<1||team.agents.length>32)throw Error('Équipe invalide ou provenant d’une autre installation.');
 const ids=new Set(),addresses=new Set();
 for(const agent of team.agents){
  if(!keys(agent,['id','mxid','name'])||!label(agent.name,80)||parseContact(agent.id,origin).id!==agent.id||parseContact(agent.mxid,origin).mxid!==agent.mxid||ids.has(agent.id)||addresses.has(agent.mxid))throw Error('Identité d’agent invalide ou répétée.');
  ids.add(agent.id);addresses.add(agent.mxid);Object.freeze(agent);
 }
 Object.freeze(team.agents);return Object.freeze(team);
}
export function exportTeam({origin,name,agents}){
 const safe={schema:'polytalk.team.v1',origin,name,agents:agents.map(({id,mxid,name})=>({id,mxid,name}))};return JSON.stringify(parseTeam(JSON.stringify(safe),origin),null,2);
}
export async function prepareTeam({messenger,template,check}){
 check();const agents=[];
 for(const expected of template.agents){check();const actual=await messenger.api('/coordination/agents/'+encodeURIComponent(expected.id));check();if(actual.id!==expected.id||actual.mxid!==expected.mxid)throw Error('L’identité d’un agent ne correspond plus au registre.');agents.push(Object.freeze({id:actual.id,mxid:actual.mxid,name:actual.name,status:actual.status}));}
 return Object.freeze({...template,agents:Object.freeze(agents)});
}
export async function createTeam({messenger,prepared,state,check}){
 check();if(state.started)throw Error('Création déjà demandée. Vérifiez vos conversations avant de recommencer.');
 const members=prepared.agents.map(agent=>agent.mxid).filter(mxid=>mxid!==messenger.session.userId);if(!members.length)throw Error('L’équipe doit contenir au moins un autre agent.');
 state.started=true;let room;
 try{room=await messenger.createConversation(members,prepared.name);}catch{throw Error('La création n’a pas été confirmée. Vérifiez vos conversations avant de lancer un nouvel import pour éviter un doublon.');}
 check();state.roomId=room;return room;
}
