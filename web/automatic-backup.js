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
import {encodeRecoveryKey,decodeRecoveryKey} from 'matrix-js-sdk/lib/crypto-api/recovery-key.js';
import {BackupDecryptionKey} from '@matrix-org/matrix-sdk-crypto-wasm';
function publicKey(raw){
 const key=BackupDecryptionKey.fromBase64(btoa(String.fromCharCode(...raw)));
 let publicPart;
 try{publicPart=key.megolmV1PublicKey;return publicPart.publicKeyBase64;}
 finally{publicPart?.free();key.free();}
}
export class AutomaticBackup{
 constructor({client,scope,publicKey:derivePublic=publicKey}){this.client=client;this.scope=scope;this.publicKey=derivePublic;this.busy=false;}
 async exclusive(action){
  if(this.busy)throw Error('Une opération de sauvegarde est déjà en cours.');
  this.busy=true;const token=this.scope.generation;
  const check=()=>this.scope.assert(token);
  try{check();return await action(this.client.getCrypto(),check);}finally{this.busy=false;}
 }
 async status(){return this.exclusive(async(crypto,check)=>{
  await crypto.checkKeyBackupAndEnable();check();const info=await crypto.getKeyBackupInfo();check();
  const active=await crypto.getActiveSessionBackupVersion();check();
  return {exists:Boolean(info),version:info?.version||null,active:Boolean(info&&active===info.version)};
 });}
 prepare(){this.scope.assert(this.scope.generation);const raw=globalThis.crypto.getRandomValues(new Uint8Array(32));try{return encodeRecoveryKey(raw);}finally{raw.fill(0);}}
 async activate(code){return this.exclusive(async(crypto,check)=>{
  await crypto.checkKeyBackupAndEnable();check();const existing=await crypto.getKeyBackupInfo();check();
  if(existing)throw Error('Une sauvegarde existe déjà. Restaurez-la avec son code ; aucune sauvegarde ne sera remplacée.');
  // SDK resetKeyBackup deletes all previous versions. Create a new version directly instead:
  // concurrent creation may create another version, but must never destroy anyone's keys.
  let raw;try{raw=decodeRecoveryKey(code);}catch{throw Error('Code de récupération invalide.');}
  try{
   const result=await this.client.http.authedRequest('POST','/room_keys/version',undefined,{algorithm:'m.megolm_backup.v1.curve25519-aes-sha2',auth_data:{public_key:this.publicKey(raw)}},{prefix:'/_matrix/client/v3'});check();
   if(typeof result.version!=='string')throw Error('Version de sauvegarde invalide.');
   await crypto.storeSessionBackupPrivateKey(raw,result.version);check();
   await crypto.checkKeyBackupAndEnable();check();
  }finally{raw.fill(0);}
 });}
 async restore(code){return this.exclusive(async(crypto,check)=>{
  let raw;
  try{if(typeof code!=='string'||code.length>256)throw Error();raw=decodeRecoveryKey(code.trim());}catch{throw Error('Code de récupération invalide. Vérifiez tous les groupes de caractères.');}
  try{
   await crypto.checkKeyBackupAndEnable();check();const info=await crypto.getKeyBackupInfo();check();
   if(!info?.version)throw Error('Aucune sauvegarde de clés disponible sur ce serveur.');
   if(info.algorithm!=='m.megolm_backup.v1.curve25519-aes-sha2'||this.publicKey(raw)!==info.auth_data?.public_key)throw Error('Ce code ne correspond pas à la sauvegarde actuelle de ce compte.');
   await crypto.storeSessionBackupPrivateKey(raw,info.version);check();
   await crypto.checkKeyBackupAndEnable();check();
   const result=await crypto.restoreKeyBackup();check();return result;
  }finally{raw.fill(0);}
 });}
 async rotate(code,expectedVersion){return this.exclusive(async(crypto,check)=>{
  await crypto.checkKeyBackupAndEnable();check();const info=await crypto.getKeyBackupInfo();check();
  if(!info?.version||info.version!==expectedVersion)throw Error('La sauvegarde a changé. Rouvrez les réglages avant de changer le code.');
  const active=await crypto.getActiveSessionBackupVersion();check();
  if(active!==expectedVersion)throw Error('Restaurez d’abord la sauvegarde sur cet appareil avant de changer son code.');
  // Restore all available old keys before creating a new version. Never use
  // resetKeyBackup: it deletes existing versions before a new upload completes.
  await crypto.restoreKeyBackup();check();
  await crypto.checkKeyBackupAndEnable();check();const latest=await crypto.getKeyBackupInfo();check();
  if(latest?.version!==expectedVersion)throw Error('Un autre appareil a modifié la sauvegarde. Rouvrez les réglages.');
  let raw;try{raw=decodeRecoveryKey(code);}catch{throw Error('Nouveau code de récupération invalide.');}
  try{
   const result=await this.client.http.authedRequest('POST','/room_keys/version',undefined,{algorithm:'m.megolm_backup.v1.curve25519-aes-sha2',auth_data:{public_key:this.publicKey(raw)}},{prefix:'/_matrix/client/v3'});check();
   if(typeof result?.version!=='string')throw Error('Nouvelle version de sauvegarde non confirmée. Conservez le nouveau code et rouvrez les réglages.');
   await crypto.storeSessionBackupPrivateKey(raw,result.version);check();await crypto.checkKeyBackupAndEnable();check();
   return {version:result.version,previousVersion:expectedVersion};
  }finally{raw.fill(0);}
 });}
 async stop(expectedVersion){return this.exclusive(async(crypto,check)=>{
  await crypto.checkKeyBackupAndEnable();check();const info=await crypto.getKeyBackupInfo();check();
  if(!info?.version||info.version!==expectedVersion)throw Error('La sauvegarde a changé. Rouvrez les réglages avant de la supprimer.');
  await crypto.deleteKeyBackupVersion(expectedVersion);check();
  await crypto.checkKeyBackupAndEnable();check();const remaining=await crypto.getKeyBackupInfo();check();
  return {stopped:!remaining,remainingVersion:remaining?.version||null};
 });}
 async stopAll(expectedVersion){return this.exclusive(async(crypto,check)=>{
  await crypto.checkKeyBackupAndEnable();check();let info=await crypto.getKeyBackupInfo();check();
  if(!info?.version||info.version!==expectedVersion)throw Error('La sauvegarde a changé. Rouvrez les réglages avant de l’arrêter.');
  const seen=new Set();
  for(let count=0;info&&count<32;count++){
   // Synapse versions are increasing decimal identifiers. Never delete a new
   // version created concurrently, or guess the ordering of opaque versions.
   if(count&&(!/^\d+$/.test(info.version)||!/^\d+$/.test(expectedVersion)||BigInt(info.version)>BigInt(expectedVersion)))return {stopped:false,remainingVersion:info.version,deleted:seen.size};
   if(seen.has(info.version))throw Error('Le serveur présente encore une version supprimée. Rouvrez les réglages pour vérifier son état.');
   seen.add(info.version);await crypto.deleteKeyBackupVersion(info.version);check();
   await crypto.checkKeyBackupAndEnable();check();info=await crypto.getKeyBackupInfo();check();
  }
  return {stopped:!info,remainingVersion:info?.version||null,deleted:seen.size};
 });}
}
