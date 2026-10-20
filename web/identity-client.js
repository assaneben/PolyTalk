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
import {validatedIdentity,signIdentityChallenge} from './identity-recovery.js';
const routes=new Set(['/config','/register','/auth/password','/auth/cancel','/wallet/challenge','/wallet/link','/wallet/login']);
export class IdentityClient{
 constructor({origin,fetchImpl=fetch,completeAuthentication,signal,check}={}){
  const url=new URL(origin);if(url.origin!==origin||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Installation HTTPS ou locale requise.');
  this.origin=origin;this.fetch=fetchImpl;this.completeAuthentication=completeAuthentication;this.signal=signal;this.check=check;
 }
 active(){if(this.signal?.aborted)throw Error('Connexion par identité annulée.');this.check?.();}
 async request(path,{method='GET',body,session,cleanup=false}={}){
  if(!routes.has(path))throw Error('Opération d’identité interdite.');if(!cleanup)this.active();
  const response=await this.fetch(this.origin+'/api'+path,{method,credentials:'same-origin',redirect:'error',...(!cleanup&&this.signal?{signal:this.signal}:{}),headers:{...(session?{Authorization:'Bearer '+session.access_token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();if(text.length>65536)throw Error('Réponse d’identité trop volumineuse.');let data;try{data=JSON.parse(text);}catch{throw Error('Réponse d’identité illisible.');}
  if(!cleanup){try{this.active();}catch(error){
   if(typeof data.access_token==='string')await this.logout(data);
   else if(data.mfaRequired&&typeof data.id==='string')await this.request('/auth/cancel',{method:'POST',body:{id:data.id},cleanup:true}).catch(()=>{});
   throw error;
  }}
  if(!response.ok){const error=Error(typeof data.error==='string'?data.error.slice(0,500):'Opération d’identité refusée.');error.status=response.status;throw error;}return data;
 }
 async configuration(identity){
  const config=await this.request('/config');
  if(identity.origin!==this.origin||config.origin!==this.origin||config.matrixBase!==this.origin||config.serverName!==identity.serverName)throw Error('Cette identité appartient à une autre installation.');
  if(config.walletEnabled!==true)throw Error('La connexion cryptographique doit être activée sur cette installation.');return config;
 }
 async authenticate(data,identity){
  if(data.mfaRequired){
   try{if(!this.completeAuthentication)throw Error('Validation en deux étapes requise. Utilisez le parcours de connexion complet.');data=await this.completeAuthentication(data);}
   catch(error){await this.request('/auth/cancel',{method:'POST',body:{id:data.id},cleanup:true}).catch(()=>{});throw error;}
  }
  if(data.user_id!=='@'+identity.username+':'+identity.serverName||typeof data.device_id!=='string'||!data.device_id||typeof data.access_token!=='string'||!data.access_token){await this.logout(data);throw Error('Session d’identité invalide.');}return data;
 }
 async logout(session){
  if(!session?.access_token)return;
  try{await this.fetch(this.origin+'/_matrix/client/v3/logout',{method:'POST',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}'});}catch{}
 }
 async enroll(value,{state,invitationCode=''}={}){
  const identity=validatedIdentity(value);if(!state||typeof state.registered!=='boolean'||typeof state.linked!=='boolean')throw Error('État d’inscription invalide.');
  const config=await this.configuration(identity);let session;
  try{
   if(!state.registered){const result=await this.request('/register',{method:'POST',body:{username:identity.username,password:identity.accountPassword,name:identity.name,kind:identity.kind,code:invitationCode}});if(result.user_id!=='@'+identity.username+':'+identity.serverName)throw Error('Compte créé avec une réponse inattendue.');state.registered=true;}
   const primary=await this.request('/auth/password',{method:'POST',body:{username:identity.username,password:identity.accountPassword}});session=await this.authenticate(primary,identity);this.active();
   const challenge=await this.request('/wallet/challenge',{method:'POST',session,body:{address:identity.address,chainId:1,purpose:'link'}}),proof=await signIdentityChallenge(identity,challenge,'link');this.active();
   const linked=await this.request('/wallet/link',{method:'POST',session,body:{...proof,password:identity.accountPassword}});
   if(!Array.isArray(linked.wallets)||!linked.wallets.some(wallet=>wallet.address.toLowerCase()===identity.address.toLowerCase()))throw Error('Association de l’identité non confirmée.');
   state.linked=true;this.active();return {session,config};
  }catch(error){await this.logout(session);throw error;}
 }
 async login(value){
  const identity=validatedIdentity(value),config=await this.configuration(identity);let session;
  try{
   const challenge=await this.request('/wallet/challenge',{method:'POST',body:{address:identity.address,chainId:1,purpose:'login'}}),proof=await signIdentityChallenge(identity,challenge,'login');this.active();
   const primary=await this.request('/wallet/login',{method:'POST',body:proof});session=await this.authenticate(primary,identity);this.active();return {session,config};
  }catch(error){await this.logout(session);throw error;}
 }
}
