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
import {Wallet,getAddress} from 'ethers';
import {parseContact} from './contact.js';
import {seal,unseal} from './vault.js';
const schema='polytalk.local-identity.v1',backupSchema='polytalk.local-identity-backup.v1';
const fields=['schema','origin','serverName','username','name','kind','address','privateKey','accountPassword'];
const exact=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key));
function validateOrigin(origin){
 let url;try{url=new URL(origin);}catch{throw Error('Installation invalide.');}
 if(url.origin!==origin||url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Une installation HTTPS ou locale est requise.');
}
function validateMetadata({origin,serverName,username,name,kind}){
 validateOrigin(origin);
 if(typeof username!=='string'||!/^[a-z][a-z0-9_-]{2,31}$/.test(username)||['admin','root','support','system','polytalk'].includes(username))throw Error('Identifiant invalide ou réservé.');
 if(typeof name!=='string'||name.length>80||!['human','agent'].includes(kind)||typeof serverName!=='string'||serverName.length>255)throw Error('Informations d’identité invalides.');
 const mxid='@'+username+':'+serverName;try{if(parseContact(mxid,origin).mxid!==mxid)throw Error();}catch{throw Error('Serveur Matrix invalide.');}
}
function validate(identity){
 if(!exact(identity,fields)||identity.schema!==schema||fields.some(key=>!Object.hasOwn(identity,key)))throw Error('Format d’identité invalide.');
 validateMetadata(identity);
 if(typeof identity.accountPassword!=='string'||identity.accountPassword.length<12||identity.accountPassword.length>256||typeof identity.privateKey!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(identity.privateKey))throw Error('Secrets d’identité invalides.');
 let wallet;try{wallet=new Wallet(identity.privateKey);if(getAddress(identity.address)!==wallet.address)throw Error();}catch{throw Error('Clé et adresse d’identité incohérentes.');}
 return wallet;
}
function randomSecret(){
 const bytes=crypto.getRandomValues(new Uint8Array(24));
 try{return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_');}finally{bytes.fill(0);}
}
function validateRecovery(code){if(typeof code!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(code))throw Error('Code personnel de récupération invalide : 32 caractères requis.');}
export function validatedIdentity(identity){validate(identity);return Object.freeze(Object.fromEntries(fields.map(key=>[key,identity[key]])));}
export function createRecoveryCode(){return randomSecret();}
export function createIdentity({origin,serverName,username,name='',kind='human',password}={}){
 validateMetadata({origin,serverName,username,name,kind});
 if(password!==undefined&&(typeof password!=='string'||password.length<12||password.length>256))throw Error('Mot de passe facultatif : 12 caractères minimum, 256 maximum.');
 const wallet=Wallet.createRandom(),identity={schema,origin,serverName,username,name:name.trim(),kind,address:wallet.address,privateKey:wallet.privateKey,accountPassword:password||randomSecret()};
 return {identity,recoveryCode:randomSecret()};
}
export async function exportIdentity(identity,recoveryCode){
 validate(identity);validateRecovery(recoveryCode);
 // This is a login identity, not a Matrix message-key or device-identity backup.
 const value=Object.fromEntries(fields.map(key=>[key,identity[key]]));
 return JSON.stringify({schema:backupSchema,box:await seal(value,recoveryCode)},null,2);
}
export async function importIdentity(text,recoveryCode,origin){
 validateOrigin(origin);validateRecovery(recoveryCode);
 if(typeof text!=='string'||text.length>40000)throw Error('Fichier d’identité invalide ou trop volumineux.');
 let record;try{record=JSON.parse(text);}catch{throw Error('Fichier d’identité illisible.');}
 const box=record?.box;
 if(!exact(record,['schema','box'])||record.schema!==backupSchema||!exact(box,['version','salt','iv','data'])||box.version!==1||typeof box.salt!=='string'||box.salt.length!==24||typeof box.iv!=='string'||box.iv.length!==16||typeof box.data!=='string'||box.data.length>32768)throw Error('Format de sauvegarde d’identité invalide.');
 const identity=await unseal(box,recoveryCode);validate(identity);
 if(identity.origin!==origin)throw Error('Cette identité appartient à une autre installation PolyTalk.');
 return identity;
}
export async function signIdentityChallenge(identity,challenge,purpose,now=Date.now()){
 const wallet=validate(identity);
 if(!exact(challenge,['id','message','address','chainId','expiresAt'])||!['login','link'].includes(purpose)||typeof challenge.id!=='string'||!/^[0-9a-f-]{36}$/i.test(challenge.id)||challenge.address!==wallet.address||challenge.chainId!==1||typeof challenge.message!=='string'||challenge.message.length>4096)throw Error('Défi PolyTalk invalide.');
 const expires=Date.parse(challenge.expiresAt);
 if(!Number.isFinite(expires)||expires<=now||expires>now+300000)throw Error('Défi PolyTalk expiré ou invalide.');
 const nonce=/\nNonce: ([a-f0-9]{48})\n/.exec(challenge.message)?.[1],issued=/\nIssued At: ([^\n]+)\n/.exec(challenge.message)?.[1];
 if(!nonce||!issued||!Number.isFinite(Date.parse(issued))||Date.parse(issued)>now+30000||expires-Date.parse(issued)!==300000)throw Error('Défi PolyTalk invalide.');
 const statement=purpose==='link'?`Link this wallet to PolyTalk account @${identity.username}:${identity.serverName}.`:'Sign in to PolyTalk.';
 const expected=`${new URL(identity.origin).host} wants you to sign in with your Ethereum account:\n${wallet.address}\n\n${statement} No transaction. No access to funds.\n\nURI: ${identity.origin}/\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${issued}\nExpiration Time: ${challenge.expiresAt}\nRequest ID: ${challenge.id}`;
 if(expected!==challenge.message)throw Error('Défi PolyTalk pour une autre opération ou installation.');
 return {id:challenge.id,signature:await wallet.signMessage(expected)};
}
