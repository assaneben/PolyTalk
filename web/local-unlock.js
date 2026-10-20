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
import {seal,unseal} from './vault.js';
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-text.length%4)%4)),c=>c.charCodeAt(0));
async function prf(credentials,credentialId,salt,origin,signal){
 signal?.throwIfAborted();
 if(!credentials?.get||typeof credentialId!=='string'||!/^[A-Za-z0-9_-]{16,2048}$/.test(credentialId))throw Error('Clé d’accès indisponible. Utilisez la phrase du coffre.');
 const response=await credentials.get({signal,publicKey:{rpId:new URL(origin).hostname,challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:[{type:'public-key',id:decode(credentialId)}],userVerification:'required',timeout:60000,extensions:{prf:{eval:{first:salt}}}}});
 const result=response?.getClientExtensionResults()?.prf?.results?.first;
 if(response?.id!==credentialId||!result||result.byteLength!==32)throw Error('Ce navigateur ou cette clé ne prend pas en charge PRF. La phrase du coffre reste disponible.');
 return new Uint8Array(result);
}
export async function createLocalUnlock({vault,phrase,credentialId,origin,credentials=globalThis.navigator?.credentials,signal,check=()=>{}}){
 if(typeof phrase!=='string'||phrase.length>512)throw Error('Phrase du coffre invalide.');
 const session=await unseal(vault.box,phrase);
 signal?.throwIfAborted();check();
 if(session.prefix!==vault.id||session.baseUrl!==origin)throw Error('Ce coffre ne correspond pas à cet appareil et cette installation.');
 const salt=crypto.getRandomValues(new Uint8Array(32)),raw=await prf(credentials,credentialId,salt,origin,signal);
 try{signal?.throwIfAborted();check();const box=await seal({phrase,vaultId:vault.id,origin},encode(raw));signal?.throwIfAborted();check();return {version:1,vaultId:vault.id,credentialId,origin,salt:encode(salt),box};}finally{raw.fill(0);}
}
export async function openLocalUnlock({record,vaultId,origin,credentials=globalThis.navigator?.credentials}){
 if(record?.version!==1||record.vaultId!==vaultId||record.origin!==origin||typeof record.salt!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(record.salt))throw Error('Cette protection ne correspond pas à cet appareil et cette installation.');
 const raw=await prf(credentials,record.credentialId,decode(record.salt),origin);
 try{
  let value;try{value=await unseal(record.box,encode(raw));}catch{throw Error('Cette clé ne peut pas ouvrir le coffre. Utilisez votre phrase de secours.');}
  if(value.vaultId!==vaultId||value.origin!==origin||typeof value.phrase!=='string')throw Error('Protection de cet appareil invalide.');return value.phrase;
 }finally{raw.fill(0);}
}
const storageKey=id=>'polytalk.local-unlock.v1.'+id;
export function readLocalUnlock(storage,id){const value=storage.getItem(storageKey(id));if(!value)return null;if(value.length>16384)throw Error('Protection locale endommagée. Utilisez la phrase du coffre.');try{return JSON.parse(value);}catch{throw Error('Protection locale endommagée. Utilisez la phrase du coffre.');}}
export function saveLocalUnlock(storage,record){storage.setItem(storageKey(record.vaultId),JSON.stringify(record));}
export function removeLocalUnlock(storage,id){storage.removeItem(storageKey(id));}
