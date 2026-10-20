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
const slot='polytalk.tab-resume.v1',ttl=12*60*60*1000;
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
class BrowserKeys{
 async operation(mode,action){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('polytalk-tab-resume',1);r.onupgradeneeded=()=>r.result.createObjectStore('keys',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return await new Promise((resolve,reject)=>{const transaction=db.transaction('keys',mode),store=transaction.objectStore('keys');let value;transaction.oncomplete=()=>resolve(value);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||Error('Stockage interrompu.'));action(store,result=>value=result);});}finally{db.close();}
 }
 async put(id,key,expires){return this.operation('readwrite',store=>{const request=store.getAll();request.onsuccess=()=>{const entries=request.result.sort((a,b)=>a.expires-b.expires);for(const [index,entry] of entries.entries())if(entry.expires<=Date.now()||index<entries.length-63)store.delete(entry.id);store.put({id,key,expires});};});}
 async get(id){return this.operation('readonly',(store,done)=>{const request=store.get(id);request.onsuccess=()=>done(request.result?.expires>Date.now()?request.result.key:null);});}
 async remove(id){return this.operation('readwrite',store=>store.delete(id));}
}
export class SessionResume{
 constructor({storage,keyStore=new BrowserKeys(),origin=globalThis.location?.origin,now=Date.now}={}){this.storage=storage;this.keys=keyStore;this.origin=origin;this.now=now;this.generation=0;}
 get store(){return this.storage||globalThis.sessionStorage;}
 check(token){if(token!==this.generation)throw Error('Session expirée ou verrouillée.');}
 async clear(){this.generation++;const raw=this.store.getItem(slot);this.store.removeItem(slot);try{const record=JSON.parse(raw);if(typeof record?.id==='string')await this.keys.remove(record.id);}catch{}}
 async save({vaultId,phrase}){
  const token=this.generation,id=crypto.randomUUID(),expires=this.now()+ttl;
  if(typeof vaultId!=='string'||typeof phrase!=='string'||phrase.length<12||phrase.length>4096)throw Error('Session locale invalide.');
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);this.check(token);
  const iv=crypto.getRandomValues(new Uint8Array(12)),aad=new TextEncoder().encode(JSON.stringify({id,expires,origin:this.origin}));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,new TextEncoder().encode(JSON.stringify({vaultId,phrase})));this.check(token);
  const previous=this.store.getItem(slot);await this.keys.put(id,key,expires);
  try{this.check(token);this.store.setItem(slot,JSON.stringify({version:1,id,expires,origin:this.origin,iv:encode(iv),data:encode(new Uint8Array(data))}));}catch(error){await this.keys.remove(id);throw error;}
  try{const old=JSON.parse(previous);if(typeof old?.id==='string')await this.keys.remove(old.id);}catch{}
 }
 async load(){
  const token=this.generation;
  try{
   const raw=this.store.getItem(slot);if(!raw)return null;if(raw.length>16384)throw Error();const record=JSON.parse(raw);
   if(record?.version!==1||record.origin!==this.origin||!Number.isSafeInteger(record.expires)||record.expires<=this.now()||record.expires>this.now()+ttl||typeof record.id!=='string'||record.id.length>64||typeof record.iv!=='string'||record.iv.length!==16||typeof record.data!=='string'||record.data.length>12288)throw Error();
   const key=await this.keys.get(record.id);this.check(token);if(!key)throw Error();
   const aad=new TextEncoder().encode(JSON.stringify({id:record.id,expires:record.expires,origin:this.origin}));
   const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(record.iv),additionalData:aad},key,decode(record.data));this.check(token);
   const value=JSON.parse(new TextDecoder().decode(clear));if(typeof value.vaultId!=='string'||typeof value.phrase!=='string'||value.phrase.length<12||value.phrase.length>4096)throw Error();return value;
  }catch{if(token===this.generation)await this.clear();return null;}
 }
}
