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
import {randomBytes,createHash} from 'node:crypto';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
const fail=()=>{const error=Error('Clé d’accès refusée ou demande expirée. Recommencez.');error.status=403;throw error;};
const hash=value=>createHash('sha256').update(value).digest('hex');
export class Passkeys{
 constructor(store,origin,{now=Date.now,audit=()=>{}}={}){
  this.store=store;this.db=store.db;this.origin=origin;this.rpID=new URL(origin).hostname;this.now=now;this.pending=new Map();this.audit=audit;
  this.db.exec(`CREATE TABLE IF NOT EXISTS auth_passkeys(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES profiles(id),public_key BLOB NOT NULL,counter INTEGER NOT NULL,name TEXT NOT NULL,transports TEXT NOT NULL,created_at TEXT NOT NULL);`);
 }
 list(user){return this.db.prepare('SELECT id,name,created_at FROM auth_passkeys WHERE owner_id=? ORDER BY created_at').all(user.id);}
 remember(challenge,binding,purpose,user=null,name=''){
  for(const [id,p]of this.pending)if(p.exp<=this.now())this.pending.delete(id);
  if(this.pending.size>=500)fail();const id=randomBytes(32).toString('hex');this.pending.set(id,{challenge,binding:hash(binding),purpose,user,name,exp:this.now()+120000});return id;
 }
 take(id,binding,purpose){const p=this.pending.get(id);if(!p||p.exp<=this.now()||p.binding!==hash(binding)||p.purpose!==purpose)fail();this.pending.delete(id);return p;}
 async registration(user,binding,name){
  if(typeof name!=='string'||!name.trim()||name.length>80||this.list(user).length>=10)fail();
  const options=await generateRegistrationOptions({rpName:'PolyTalk',rpID:this.rpID,userID:new TextEncoder().encode(user.id),userName:user.mxid,userDisplayName:user.name,attestationType:'none',supportedAlgorithmIDs:[-7,-257],authenticatorSelection:{residentKey:'required',userVerification:'required'},excludeCredentials:this.list(user).map(key=>({id:key.id})),timeout:120000});
  return {id:this.remember(options.challenge,binding,'registration',user,name.trim()),options};
 }
 async register(id,binding,response){
  const p=this.take(id,binding,'registration');let result;
  try{result=await verifyRegistrationResponse({response,expectedChallenge:p.challenge,expectedOrigin:this.origin,expectedRPID:this.rpID,requireUserVerification:true});}catch{fail();}
  if(!result.verified||!result.registrationInfo||this.list(p.user).length>=10)fail();
  const credential=result.registrationInfo.credential;
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO auth_passkeys VALUES(?,?,?,?,?,?,?)').run(credential.id,p.user.id,Buffer.from(credential.publicKey),credential.counter,p.name,JSON.stringify(credential.transports||[]),new Date(this.now()).toISOString());this.audit(p.user.mxid,'passkey.added');this.db.exec('COMMIT');}catch{this.db.exec('ROLLBACK');fail();}
  return this.list(p.user);
 }
 async authentication(binding){const options=await generateAuthenticationOptions({rpID:this.rpID,userVerification:'required',timeout:120000});return {id:this.remember(options.challenge,binding,'authentication'),options};}
 async authenticate(id,binding,response){
  const p=this.take(id,binding,'authentication'),key=typeof response?.id==='string'?this.db.prepare('SELECT * FROM auth_passkeys WHERE id=?').get(response.id):null;if(!key)fail();
  const user=this.store.byId(key.owner_id);if(!user||response.response?.userHandle!==Buffer.from(user.id).toString('base64url'))fail();let result;
  try{result=await verifyAuthenticationResponse({response,expectedChallenge:p.challenge,expectedOrigin:this.origin,expectedRPID:this.rpID,requireUserVerification:true,credential:{id:key.id,publicKey:new Uint8Array(key.public_key),counter:key.counter,transports:JSON.parse(key.transports)}});}catch{fail();}
  if(!result.verified||this.db.prepare('UPDATE auth_passkeys SET counter=? WHERE id=? AND counter=?').run(result.authenticationInfo.newCounter,key.id,key.counter).changes!==1)fail();return user;
 }
 remove(user,id){if(typeof id!=='string'||id.length>2048)fail();this.db.exec('BEGIN IMMEDIATE');try{const result=this.db.prepare('DELETE FROM auth_passkeys WHERE id=? AND owner_id=?').run(id,user.id);if(result.changes)this.audit(user.mxid,'passkey.removed');this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return this.list(user);}
}
