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
import {createIdentity,exportIdentity,importIdentity,createRecoveryCode} from './identity-recovery.js';
import {IdentityClient} from './identity-client.js';
export function identityUi({messenger,config,dialog,el,field,button,download,notice,getDialog,onReady}){
 function context(title){
  const generation=messenger.scope.generation,body=dialog(title),controller=new AbortController();let handoff=false;
  const check=()=>{messenger.scope.assert(generation);if(controller.signal.aborted||!handoff&&(!body.isConnected||!getDialog().open))throw Error('Ce parcours est fermé. Rouvrez la connexion par identité.');};
  const cancel=()=>controller.abort();getDialog().addEventListener('close',cancel,{once:true});
  const client=new IdentityClient({origin:config().origin,signal:controller.signal,check,completeAuthentication:async data=>{check();handoff=true;getDialog().removeEventListener('close',cancel);const result=await messenger.completeAuthentication(data);try{check();return result;}catch(error){await client.logout(result);throw error;}}});
  const clean=()=>{getDialog().removeEventListener('close',cancel);controller.abort();};
  return {body,check,client,clean};
 }
 async function deliver(ctx,result,identity,recoveryCode){
  ctx.check();ctx.clean();getDialog().close();
  try{await onReady({result,identity,recoveryCode});}catch(error){await ctx.client.logout(result.session);throw error;}
 }
 async function preserve(identity,code,{enroll=false,invitationCode=''}={}){
  const ctx=context(enroll?'Conservez votre identité avant inscription':'Sauvegarder mon identité'),{body,check}=ctx;
  body.append(el('p','Cette identité de connexion est créée sur cet appareil. Son fichier chiffré et son code permettent de retrouver le compte, mais ne sauvegardent pas les clés de vos conversations. Aucun portefeuille externe ni transaction n’est nécessaire.'));
  const secret=field('Code personnel de récupération — conservez-le maintenant','text',code);secret.input.readOnly=true;secret.input.autocomplete='off';body.append(secret.wrapper);
  body.append(el('pre','Compte : @'+identity.username+':'+identity.serverName+'\nClé publique : '+identity.address));
  getDialog().addEventListener('close',()=>{secret.input.value='';body.replaceChildren();},{once:true});
  let file;try{file=await exportIdentity(identity,code);check();}catch(error){ctx.clean();throw error;}
  body.append(button('Télécharger le fichier d’identité chiffré',()=>{check();download(new Blob([file],{type:'application/json'}),'polytalk-identite-chiffree.json');}));
  body.append(button('Enregistrer le code séparément (.txt)',()=>{check();download(new Blob(['PolyTalk — code secret de récupération de l’identité\nCompte : @'+identity.username+':'+identity.serverName+'\n\n'+secret.input.value+'\n\nGardez ce code séparé du fichier chiffré. Il ne restaure pas les clés des conversations.\n'],{type:'text/plain;charset=utf-8'}),'polytalk-code-identite.txt');}));
  const saved=field('J’ai conservé le fichier chiffré et son code séparément','checkbox');body.append(saved.wrapper);
  const state={registered:false,linked:false};
  body.append(button(enroll?'Créer mon compte avec cette identité':'J’ai conservé ma sauvegarde',async()=>{
   check();if(!saved.input.checked)throw Error('Conservez le fichier et son code, puis cochez la confirmation avant de continuer.');
   if(!enroll){ctx.clean();getDialog().close();notice('Sauvegarde d’identité préparée. Conservez son code séparément.');return;}
   let result;try{result=await ctx.client.enroll(identity,{state,invitationCode});}
   catch(error){if(state.registered)error.message+=' Votre compte est créé. Gardez votre fichier ; utilisez la réparation d’association en cas d’interruption.';throw error;}
   await deliver(ctx,result,identity,code);
  },'primary'));
 }
 function create(){
  if(!config().walletEnabled)throw Error('La connexion cryptographique doit être configurée sur cette installation.');
  const ctx=context('Créer une identité locale'),{body,check}=ctx;
  body.append(el('p','Aucun e-mail, téléphone ou wallet externe requis. Choisissez un identifiant ou laissez PolyTalk en générer un. Un mot de passe de compte reste facultatif ; le fichier et son code doivent être conservés avant inscription.'));
  const username=field('Identifiant souhaité (facultatif)'),name=field('Nom affiché ou pseudo (facultatif)'),password=field('Mot de passe de compte (facultatif)','password'),confirmation=field('Confirmation si vous choisissez un mot de passe','password'),invitation=field('Code d’invitation de cette installation','password');
  username.input.maxLength=32;username.input.autocapitalize='none';name.input.maxLength=80;password.input.autocomplete='new-password';confirmation.input.autocomplete='new-password';password.input.maxLength=confirmation.input.maxLength=256;
  body.append(username.wrapper,name.wrapper,password.wrapper,confirmation.wrapper);if(config().signupRequiresCode)body.append(invitation.wrapper);
  body.append(button('Préparer mon identité et sa sauvegarde',async()=>{
   check();if(password.input.value!==confirmation.input.value)throw Error('Les mots de passe ne correspondent pas.');if(config().signupRequiresCode&&!invitation.input.value)throw Error('Saisissez le code reçu de votre administrateur.');
   const code=invitation.input.value,{identity,recoveryCode}=createIdentity({origin:config().origin,serverName:config().serverName,username:username.input.value.trim()||'user_'+crypto.randomUUID().replaceAll('-','').slice(0,12),name:name.input.value,password:password.input.value||undefined});
   check();password.input.value='';confirmation.input.value='';invitation.input.value='';ctx.clean();await preserve(identity,recoveryCode,{enroll:true,invitationCode:code});
  },'primary'));
  getDialog().addEventListener('close',()=>{password.input.value='';confirmation.input.value='';invitation.input.value='';},{once:true});username.input.focus();
 }
 function restore(){
  const ctx=context('Restaurer mon identité de connexion'),{body,check}=ctx;
  body.append(el('p','Choisissez le fichier d’identité chiffré et son code de 32 caractères. Cela reconnecte votre compte ; restaurez séparément la sauvegarde des conversations si nécessaire.'));
  const file=field('Fichier d’identité PolyTalk chiffré','file'),code=field('Code personnel de récupération de l’identité','password');file.input.accept='.json';code.input.autocomplete='off';code.input.maxLength=32;body.append(file.wrapper,code.wrapper);
  async function open(repair){
   check();const selected=file.input.files[0],recoveryCode=code.input.value.trim();if(!selected)throw Error('Choisissez votre fichier d’identité chiffré.');if(selected.size>40000)throw Error('Fichier d’identité trop volumineux.');
   const identity=await importIdentity(await selected.text(),recoveryCode,config().origin);check();
   const result=repair?await ctx.client.enroll(identity,{state:{registered:true,linked:false}}):await ctx.client.login(identity);check();code.input.value='';await deliver(ctx,result,identity,recoveryCode);
  }
  body.append(button('Restaurer et me connecter',()=>open(false),'primary'));
  const advanced=el('details');advanced.append(el('summary','Inscription interrompue avant l’association ?'),el('p','La réparation réutilise le mot de passe interne chiffré de votre sauvegarde et exige le second facteur s’il est actif. Elle ne crée pas un autre compte.'),button('Réparer mon association et me connecter',()=>open(true)));body.append(advanced);
  getDialog().addEventListener('close',()=>{code.input.value='';file.input.value='';},{once:true});
 }
 function settings(){
  const identity=messenger.session?.localIdentity;if(!identity)throw Error('Ce compte n’a pas été ouvert avec une identité locale.');
  const ctx=context('Mon identité de connexion'),{body,check}=ctx;body.append(el('pre',identity.address),el('p','Le code du fichier d’identité et la sauvegarde de conversations ont des rôles différents. Réexporter une identité ne révoque pas les anciens fichiers ni leurs codes.'));
  body.append(button('Préparer une nouvelle copie chiffrée',()=>{check();ctx.clean();return preserve(identity,createRecoveryCode());}));
  const advanced=el('details');advanced.append(el('summary','Mot de passe technique du compte'),el('p','Si aucun mot de passe n’a été choisi à la création, PolyTalk en a généré un pour le compte Matrix. Il est chiffré dans votre identité. Les réglages de sécurité actuels le demandent pour confirmer certaines actions. Ne le partagez jamais.'));
  const technical=field('Mot de passe du compte','password');technical.input.readOnly=true;technical.input.autocomplete='off';
  advanced.append(technical.wrapper,button('Afficher le mot de passe du compte',()=>{check();technical.input.value=identity.accountPassword;technical.input.type='text';}));body.append(advanced);
  getDialog().addEventListener('close',()=>{technical.input.value='';},{once:true});
 }
 return {create,restore,settings};
}
