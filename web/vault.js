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
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
async function key(password,salt,usage){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},material,{name:'AES-GCM',length:256},false,[usage]);
}
export async function seal(value,password){
  if(typeof password!=='string'||password.length<12)throw Error('Phrase de coffre : 12 caractères minimum.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(password,salt,'encrypt'),new TextEncoder().encode(JSON.stringify(value)));
  return {version:1,salt:encode(salt),iv:encode(iv),data:encode(new Uint8Array(ciphertext))};
}
export async function unseal(box,password){
  if(box?.version!==1)throw Error('Format de coffre invalide.');
  try{
    const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(box.iv)},await key(password,decode(box.salt),'decrypt'),decode(box.data));
    return JSON.parse(new TextDecoder().decode(clear));
  }catch{throw Error('Coffre illisible : phrase incorrecte ou données endommagées.');}
}
export const vaultKey='polytalk.vault.v1';
const catalogKey='polytalk.vaults.v1';
export function readVaults(storage){
  const catalog=storage.getItem(catalogKey);
  if(catalog){
    const entries=JSON.parse(catalog);
    if(!Array.isArray(entries)||entries.some(entry=>typeof entry.id!=='string'||typeof entry.label!=='string'||entry.box?.version!==1))throw Error('Liste des coffres endommagée. Les données ont été conservées.');
    return entries;
  }
  const legacy=storage.getItem(vaultKey);
  return legacy?[{id:'legacy',label:'Coffre existant — choisir puis déverrouiller',box:JSON.parse(legacy)}]:[];
}
export function saveVault(storage,session,box,replaceId){
  const entries=readVaults(storage).filter(entry=>entry.id!==replaceId||entry.id===session.prefix);
  const entry={id:session.prefix,label:session.userId+' · appareil '+session.deviceId,box,protection:session.protection==='account-password'?'account-password':'custom'};
  const index=entries.findIndex(saved=>saved.id===session.prefix);
  if(index<0)entries.push(entry);else entries[index]=entry;
  storage.setItem(catalogKey,JSON.stringify(entries));
}

