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
import {randomBytes,createHmac,createHash,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {validMxid} from './matrix-id.mjs';
const fail=(message='Code incorrect, expiré ou déjà utilisé.')=>{const error=Error(message);error.status=403;throw error;};
const digest=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
function base32(bytes){let bits=0,value=0,result='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){result+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value>>>(bits-=5))&31];}}if(bits)result+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[(value<<(5-bits))&31];return result;}
export function totp(secret,now=Date.now()){
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(now/30000)));
 // HMAC-SHA1 is mandated by the interoperable RFC6238 authenticator profile.
 const mac=createHmac('sha1',secret).update(counter).digest(),offset=mac[19]&15;
 return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}
export class Security{
 constructor(store,secret,{now=Date.now}={}){
  this.db=store.db;this.now=now;this.pending=new Map();this.grants=new Map();
  this.key=createHmac('sha256',secret).update('polytalk-totp-encryption-v1').digest();
  this.db.exec(`CREATE TABLE IF NOT EXISTS auth_totp(mxid TEXT PRIMARY KEY,secret TEXT NOT NULL,last_step INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS auth_backup_codes(mxid TEXT NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(mxid,hash));
   CREATE TABLE IF NOT EXISTS auth_security_audit(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,event TEXT NOT NULL,at INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS auth_security_audit_actor ON auth_security_audit(actor,at);`);
 }
 actor(mxid){return createHmac('sha256',this.key).update('audit:'+mxid).digest('hex');}
 audit(mxid,event){
  if(!validMxid(mxid)||!['totp.enabled','totp.disabled','backup_codes.renewed','passkey.added','passkey.removed','session.revoked'].includes(event))throw Error('Événement d’audit invalide.');
  this.db.prepare('DELETE FROM auth_security_audit WHERE at<?').run(this.now()-90*86400000);
  this.db.prepare('INSERT INTO auth_security_audit(actor,event,at) VALUES(?,?,?)').run(this.actor(mxid),event,this.now());
 }
 history(mxid){return this.db.prepare('SELECT event,at FROM auth_security_audit WHERE actor=? ORDER BY id DESC LIMIT 100').all(this.actor(mxid));}
 enabled(mxid){return Boolean(this.db.prepare('SELECT 1 FROM auth_totp WHERE mxid=?').get(mxid));}
 status(mxid){return {totpEnabled:this.enabled(mxid),backupCodesRemaining:Number(this.db.prepare('SELECT COUNT(*) AS n FROM auth_backup_codes WHERE mxid=?').get(mxid).n)};}
 seal(mxid,raw){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(mxid));const data=Buffer.concat([cipher.update(raw),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
 open(mxid,encrypted){const data=Buffer.from(encrypted,'base64'),cipher=createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));cipher.setAAD(Buffer.from(mxid));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]);}
 prune(map){for(const [id,entry]of map)if(entry.exp<=this.now())map.delete(id);if(map.size>=500)fail('Trop d’opérations en cours. Réessayez plus tard.');}
 begin(mxid,session){
  if(!validMxid(mxid)||this.enabled(mxid))fail('La 2FA est déjà activée ou le compte est invalide.');this.prune(this.pending);
  const raw=randomBytes(20),secret=base32(raw);this.pending.set(mxid,{encrypted:this.seal(mxid,raw),session:digest(session),exp:this.now()+300000,attempts:0});
  return {secret,raw:raw.toString('base64'),uri:`otpauth://totp/${encodeURIComponent('PolyTalk:'+mxid)}?secret=${secret}&issuer=PolyTalk&algorithm=SHA1&digits=6&period=30`};
 }
 match(raw,code,last=-1){if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;const step=Math.floor(this.now()/30000);for(const delta of [0,-1,1])if(step+delta>last&&same(totp(raw,(step+delta)*30000),code))return step+delta;return null;}
 newCodes(mxid){const codes=Array.from({length:10},()=>randomBytes(16).toString('hex').match(/.{1,8}/g).join('-'));this.db.prepare('DELETE FROM auth_backup_codes WHERE mxid=?').run(mxid);const add=this.db.prepare('INSERT INTO auth_backup_codes VALUES(?,?)');for(const code of codes)add.run(mxid,digest(code));return codes;}
 confirm(mxid,session,code){
  const p=this.pending.get(mxid);if(!p||p.exp<=this.now()||p.session!==digest(session)||++p.attempts>5)fail();
  const raw=this.open(mxid,p.encrypted);let step;try{step=this.match(raw,code);}finally{raw.fill(0);}if(step===null||this.enabled(mxid))fail();
  this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('INSERT INTO auth_totp VALUES(?,?,?)').run(mxid,p.encrypted,step);const codes=this.newCodes(mxid);this.audit(mxid,'totp.enabled');this.db.exec('COMMIT');this.pending.delete(mxid);return codes;}catch(error){this.db.exec('ROLLBACK');throw error;}
 }
 verify(mxid,code){
  const row=this.db.prepare('SELECT * FROM auth_totp WHERE mxid=?').get(mxid);if(!row)fail();
  if(typeof code==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{8}){3}$/i.test(code)){
   const result=this.db.prepare('DELETE FROM auth_backup_codes WHERE mxid=? AND hash=?').run(mxid,digest(code.toLowerCase()));if(result.changes===1)return;fail();
  }
  const raw=this.open(mxid,row.secret);let step;try{step=this.match(raw,code,row.last_step);}finally{raw.fill(0);}if(step===null)fail();
  if(this.db.prepare('UPDATE auth_totp SET last_step=? WHERE mxid=? AND last_step=?').run(step,mxid,row.last_step).changes!==1)fail();
 }
 disable(mxid,code){this.verify(mxid,code);this.db.exec('BEGIN IMMEDIATE');try{this.db.prepare('DELETE FROM auth_totp WHERE mxid=?').run(mxid);this.db.prepare('DELETE FROM auth_backup_codes WHERE mxid=?').run(mxid);this.audit(mxid,'totp.disabled');this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 rotateCodes(mxid,code){this.verify(mxid,code);this.db.exec('BEGIN IMMEDIATE');try{const result=this.newCodes(mxid);this.audit(mxid,'backup_codes.renewed');this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 grant(mxid){if(!validMxid(mxid))fail();this.prune(this.grants);const id='pt_'+randomBytes(32).toString('hex');this.grants.set(id,{mxid,exp:this.now()+30000});return id;}
 allowLogin(mxid,device){
  const grant=this.grants.get(device);
  if(grant?.mxid===mxid){this.grants.delete(device);return grant.exp>this.now();}
  return !this.enabled(mxid);
 }
}
