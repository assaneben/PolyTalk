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
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {getAddress,verifyMessage} from 'ethers';
export class WalletError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new WalletError(status,message);};
const digest=value=>createHash('sha256').update(value).digest('hex');
export class WalletAuth{
 constructor(store,origin){this.store=store;this.db=store.db;this.origin=origin;this.db.exec(`CREATE TABLE IF NOT EXISTS wallet_links(address TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES profiles(id),created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS wallet_challenges(id TEXT PRIMARY KEY,address TEXT NOT NULL,chain_id INTEGER NOT NULL,purpose TEXT NOT NULL,owner_id TEXT,browser_hash TEXT NOT NULL,message TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS wallet_challenge_expiry ON wallet_challenges(expires_at);`);this.db.prepare('DELETE FROM wallet_challenges WHERE expires_at<?').run(Date.now());}
 challenge({address,chainId,purpose},browser,actor){
  let checksum;try{checksum=getAddress(address);}catch{fail(400,'Adresse Ethereum invalide.');}
  if(!Number.isSafeInteger(chainId)||chainId<1||!['login','link'].includes(purpose)||purpose==='link'&&!actor||typeof browser!=='string'||!/^[a-f0-9]{64}$/.test(browser))fail(400,'Demande wallet invalide.');
  const now=Date.now();this.db.prepare('DELETE FROM wallet_challenges WHERE expires_at<?').run(now);
  if(this.db.prepare('SELECT count(*) AS n FROM wallet_challenges').get().n>=1000)fail(429,'Trop de demandes wallet en attente.');
  this.db.prepare('DELETE FROM wallet_challenges WHERE browser_hash=?').run(digest(browser));
  const id=randomUUID(),nonce=randomBytes(24).toString('hex'),expires=now+300000;
  const message=`${new URL(this.origin).host} wants you to sign in with your Ethereum account:\n${checksum}\n\n${purpose==='link'?`Link this wallet to PolyTalk account ${actor.mxid}.`:'Sign in to PolyTalk.'} No transaction. No access to funds.\n\nURI: ${this.origin}/\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${new Date(expires).toISOString()}\nRequest ID: ${id}`;
  this.db.prepare('INSERT INTO wallet_challenges(id,address,chain_id,purpose,owner_id,browser_hash,message,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id,checksum.toLowerCase(),chainId,purpose,actor?.id||null,digest(browser),message,expires);
  return {id,message,address:checksum,chainId,expiresAt:new Date(expires).toISOString()};
 }
 consume({id,signature},browser,purpose,actor){
  if(typeof id!=='string'||id.length>64||typeof signature!=='string'||!/^0x[0-9a-fA-F]{130}$/.test(signature)||typeof browser!=='string'||!/^[a-f0-9]{64}$/.test(browser))fail(403,'Preuve wallet invalide ou expirée.');
  const challenge=this.db.prepare('SELECT * FROM wallet_challenges WHERE id=?').get(id);
  if(!challenge||challenge.purpose!==purpose||challenge.browser_hash!==digest(browser)||challenge.expires_at<=Date.now()||challenge.attempts>=5||purpose==='link'&&challenge.owner_id!==actor?.id)fail(403,'Preuve wallet invalide ou expirée.');
  if(!challenge.message.startsWith(`${new URL(this.origin).host} wants you to sign in with your Ethereum account:\n`)||!challenge.message.includes(`\nURI: ${this.origin}/\n`))fail(403,'Preuve wallet pour une autre origine.');
  this.db.prepare('UPDATE wallet_challenges SET attempts=attempts+1 WHERE id=?').run(id);
  let recovered;try{recovered=verifyMessage(challenge.message,signature).toLowerCase();}catch{fail(403,'Signature wallet invalide.');}
  if(recovered!==challenge.address)fail(403,'Signature wallet invalide.');
  // Synchronous verification and deletion: no asynchronous boundary or replay window.
  this.db.prepare('DELETE FROM wallet_challenges WHERE id=?').run(id);return challenge;
 }
 link(actor,proof){
  const old=this.db.prepare('SELECT * FROM wallet_links WHERE address=?').get(proof.address);if(old&&old.owner_id!==actor.id)fail(409,'Ce wallet est déjà associé à un autre compte.');
  if(!old&&this.list(actor).length>=5)fail(400,'Cinq wallets maximum par compte.');
  this.db.prepare('INSERT OR IGNORE INTO wallet_links VALUES(?,?,?)').run(proof.address,actor.id,new Date().toISOString());return this.list(actor);
 }
 list(actor){return this.db.prepare('SELECT address,created_at FROM wallet_links WHERE owner_id=? ORDER BY created_at').all(actor.id);}
 owner(address){const link=this.db.prepare('SELECT owner_id FROM wallet_links WHERE address=?').get(address);return link?this.store.byId(link.owner_id):null;}
 unlink(actor,address){if(typeof address!=='string'||!/^0x[a-fA-F0-9]{40}$/.test(address))fail(400,'Adresse invalide.');this.db.prepare('DELETE FROM wallet_links WHERE owner_id=? AND address=?').run(actor.id,address.toLowerCase());}
}
export function matrixWalletJwt(mxid,serverName,origin,secret){
 if(typeof secret!=='string'||secret.length<43||!mxid.endsWith(':'+serverName))throw Error('Wallet login not configured');
 const now=Math.floor(Date.now()/1000),encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:mxid.slice(1,-serverName.length-1),iss:origin,aud:origin,iat:now,nbf:now-5,exp:now+60,jti:randomUUID()});return token+'.'+createHmac('sha256',secret).update(token).digest('base64url');
}
