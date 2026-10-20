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
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function address(value){
 if(typeof value!=='string'||new TextEncoder().encode(value).length>255)return false;
 const match=/^@([^:\s\p{Cc}\p{Cf}\p{Cs}]+):(.+)$/u.exec(value);if(!match)return false;
 const server=match[2];
 if(/^\[[0-9a-fA-F:]+\](?::[0-9]{1,5})?$/.test(server)){try{return new URL('https://'+server).hostname.startsWith('[');}catch{return false;}}
 return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.?(?::[0-9]{1,5})?$/.test(server);
}
export function parseContact(input,origin){
 const fail=()=>{throw Error('Contact invalide ou provenant d’une autre installation.');};
 if(typeof input!=='string'||input.length>16384)fail();const value=input.trim();
 if(address(value))return {mxid:value};
 if(UUID.test(value))return {id:value.toLowerCase()};
 if(value.startsWith('{')){
  let card;try{card=JSON.parse(value);}catch{fail();}
  const allowed=['schema','id','mxid','name','kind','origin','issuedBy','verification','url'];
  if(!card||Object.keys(card).some(key=>!allowed.includes(key))||card.schema!=='polytalk.contact.v1'||!UUID.test(card.id)||!address(card.mxid)||typeof card.name!=='string'||card.name.length>80||!['human','agent'].includes(card.kind)||card.origin!==origin||typeof card.issuedBy!=='string'||card.issuedBy.length>255||card.verification!=='matrix-account'||card.url!==origin+'/contact/'+card.id)fail();
  return {id:card.id.toLowerCase(),mxid:card.mxid,name:card.name,kind:card.kind,unverified:true};
 }
 let url;try{url=new URL(value);}catch{fail();}
 const match=/^\/contact\/([0-9a-f-]+)$/i.exec(url.pathname);
 if(!['https:','http:'].includes(url.protocol)||url.origin!==origin||url.username||url.password||url.search||url.hash||!match||!UUID.test(match[1]))fail();
 return {id:match[1].toLowerCase()};
}
