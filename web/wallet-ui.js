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
import {closeDialog} from './private-view.js';
import QRCode from 'qrcode';
import {signWalletChallenge} from './wallet-provider.js';
import {connectWalletConnect} from './walletconnect.js';
export function walletUi({messenger,config,getProviders,dialog,el,field,button,notice,getDialog}){
 async function acquire(check){
  const choice=await new Promise((resolve,reject)=>{
   const body=dialog('Choisir votre wallet'),modal=getDialog();
   const cancel=()=>{modal.removeEventListener('close',cancel);reject(Error('Connexion wallet annulée.'));};modal.addEventListener('close',cancel,{once:true});
   const select=async value=>{try{check();modal.removeEventListener('close',cancel);await closeDialog(modal);check();resolve(value);}catch(error){reject(error);}};
   body.append(el('p','Connectez le compte Ethereum à utiliser. Avec Ledger, choisissez le compte matériel dans MetaMask. PolyTalk ne demande aucune transaction.'));
   for(const entry of getProviders())body.append(button(entry.name,()=>select({provider:entry.provider,release:async()=>{}}),'primary'));
   if(config().walletConnectProjectId)body.append(button('WalletConnect · scanner un QR code',()=>select({walletConnect:true}),'primary'));
   else body.append(el('p','WalletConnect : l’administrateur doit renseigner le Project ID PolyTalk pour activer le QR code.'));
   if(!getProviders().length)body.append(el('p','Aucun wallet détecté dans ce navigateur. Ouvrez PolyTalk dans le navigateur de MetaMask sur mobile, ou utilisez une extension compatible sur ordinateur.'));
  });
  if(!choice.walletConnect)return choice;
  const controller=new AbortController(),body=dialog('Connexion WalletConnect'),modal=getDialog(),cancel=()=>controller.abort();modal.addEventListener('close',cancel,{once:true});
  body.append(el('p','Préparation du QR code…'));
  try{
   const provider=await connectWalletConnect({projectId:config().walletConnectProjectId,origin:config().origin,signal:controller.signal,onUri:async uri=>{
    check();body.replaceChildren();body.append(el('p','Scannez ce QR avec votre wallet. Gardez-le privé et confirmez uniquement la connexion à PolyTalk.'));const canvas=el('canvas');await QRCode.toCanvas(canvas,uri,{width:256,margin:4});check();canvas.setAttribute('role','img');canvas.setAttribute('aria-label','QR de connexion WalletConnect temporaire');body.append(canvas,button('Copier le lien de connexion',async()=>{check();await navigator.clipboard.writeText(uri);notice('Lien temporaire copié.');}));
   }});check();modal.removeEventListener('close',cancel);await closeDialog(modal);return {provider,release:()=>provider.disconnect()};
  }catch(error){modal.removeEventListener('close',cancel);if(modal.open)modal.close();throw error;}
 }
 async function proof(purpose){
  const generation=messenger.scope.generation,check=()=>messenger.scope.assert(generation),connection=await acquire(check);
  const api=(...args)=>{check();return messenger.api(...args);};
  try{return {proof:await signWalletChallenge(connection.provider,api,purpose,check),api,check};}finally{await connection.release();}
 }
 async function login(){const signed=await proof('login');signed.check();const result=await messenger.completeAuthentication(await signed.api('/wallet/login','POST',signed.proof));signed.check();return {userId:result.user_id,deviceId:result.device_id,accessToken:result.access_token,baseUrl:config().matrixBase,prefix:'polytalk-'+crypto.randomUUID()};}
 async function settings(){
  const generation=messenger.scope.generation,check=()=>messenger.scope.assert(generation),result=await messenger.api('/wallet/list');check();const body=dialog('Mes wallets de connexion');
  body.append(el('p','Un wallet associé peut ouvrir une nouvelle session de votre compte. Il ne déchiffre pas à lui seul vos anciennes conversations. Pour ajouter ou retirer un wallet, confirmez le mot de passe du compte.'));
  const password=field('Mot de passe du compte (pas la phrase locale)','password');password.input.autocomplete='current-password';body.append(password.wrapper);let busy=false;
  body.append(button('Associer MetaMask, Ledger ou WalletConnect',async()=>{check();if(busy)return;if(!password.input.value)throw Error('Mot de passe du compte requis.');busy=true;let secret=password.input.value;try{const signed=await proof('link');signed.check();await signed.api('/wallet/link','POST',{...signed.proof,password:secret});signed.check();notice('Wallet associé à votre compte.');await settings();}finally{secret='';password.input.value='';busy=false;}},'primary'));
  for(const wallet of result.wallets){const row=el('section',undefined,'coordination-task');row.append(el('pre',wallet.address),button('Retirer ce wallet',async()=>{check();if(busy)return;busy=true;try{await messenger.api('/wallet/unlink','POST',{address:wallet.address,password:password.input.value});check();await settings();}finally{password.input.value='';busy=false;}}));body.append(row);}
 }
 return {login,settings};
}
