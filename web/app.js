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
import {showContactList} from './contact-list-ui.js';
import {conversationSecurityLabel,restoreRoomFocus,focusConversation,displayNotice,announceMessageUpdate} from './ui-accessibility.js';
import {sendPreparedMessage,canSendMessage} from './prepared-message.js';
import {humanHome,showHumanHelp} from './human-guidance.js';
import {showHumanSettings} from './settings-ui.js';
import {showTeamTransfer} from './team-transfer-ui.js';
import {SearchMessageFocus} from './message-focus.js';
import {showMessageSearch} from './message-search-ui.js';
import {SessionResume} from './session-resume.js';
import {notificationItems,showNotifications} from './notifications-ui.js';
import {runButtonAction,returnHome} from './ui-actions.js';
import {walletUi} from './wallet-ui.js';
import {discoverWallets} from './wallet-provider.js';
import {accessProtection,authenticateOnce,finishAccess} from './auth-journey.js';
import {accessOptions} from './access-options.js';
import {showBackup} from './backup-ui.js';
import {showSecurity,secondFactorUi} from './security-ui.js';
import {passkeyLogin,showPasskeys} from './passkey-ui.js';
import {showLocalUnlock} from './local-unlock-ui.js';
import {showSessions} from './sessions-ui.js';
import {openLocalUnlock,readLocalUnlock} from './local-unlock.js';
import {missingPlatformFeatures} from './platform.js';
import {showCoordination} from './coordination.js';
import QRCode from 'qrcode';
import {parseContact} from './contact.js';
import {readContactFile} from './contact-qr.js';
import {clearPrivateView,replaceDialogView,closeDialog} from './private-view.js';
import {Messenger} from './matrix-client.js';
import {seal,unseal,readVaults,saveVault} from './vault.js';
import {VerificationProgress} from './verification-state.js';
const $=id=>document.getElementById(id);
const messenger=new Messenger(),tabResume=new SessionResume();let authInteractions=0;
for(const event of ['pointerdown','keydown','input'])$('auth').addEventListener(event,()=>authInteractions++);
const searchFocus=new SearchMessageFocus();
let pendingAttachment=null;
let presenceTimer=null;const drafts=new Map(),composerState={busy:false};
let authStage='credentials',authBusy=false,registrationState={registered:false},authMethod='password';
let signup=false,unlock=false,chosenVault=null,selected=null,config={},notify=false,toastTimer,renderTimer;
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const button=(text,action,cls='secondary')=>{const node=el('button',text,cls);node.type='button';const generation=messenger.scope.generation;node.addEventListener('click',()=>runButtonAction(node,()=>{messenger.scope.assert(generation);if(!node.isConnected)return;return action();},error=>notice(messageError(error),{error:true})));return node;};
function notice(text,{error=false}={}){clearTimeout(toastTimer);const node=displayNotice($,text,error);if(!error)toastTimer=setTimeout(()=>node.hidden=true,6500);}
function messageError(error){if(error?.errcode==='M_FORBIDDEN')return 'Envoi refusé : un membre peut vous avoir bloqué ou ne pas vous avoir autorisé. Dans un groupe, ce refus concerne tout le salon.';return error?.message||'Opération impossible. Vérifiez votre connexion.';}
async function run(action){try{return await action();}catch(error){notice(messageError(error),{error:true});}}
function field(label,type='text',value=''){const wrapper=el('label',label),input=el('input');input.type=type;input.value=value;wrapper.append(input);return {wrapper,input};}
function dialog(title){return replaceDialogView($,el,title);}
$('dialog-close').onclick=()=>$('dialog').close();
const wallets=walletUi({messenger,config:()=>config,getProviders:discoverWallets(window),dialog,el,field,button,notice,getDialog:()=>$('dialog')});
messenger.requestSecondFactor=secondFactorUi({messenger,dialog,el,field,getDialog:()=>$('dialog')});
function authMode(){
  let vaults=[];
  try{vaults=readVaults(localStorage);}catch(error){$('auth-error').textContent=messageError(error);return;}
  if(unlock&&!vaults.length)unlock=false;
  const credentials=!unlock&&authStage==='credentials',form=$('auth-form');
  const picker=$('profile-select');picker.replaceChildren();
  for(const vault of vaults){const option=el('option',vault.label);option.value=vault.id;picker.append(option);}
  if(!vaults.some(vault=>vault.id===chosenVault))chosenVault=vaults.at(-1)?.id;
  const accountProtected=unlock&&vaults.find(v=>v.id===chosenVault)?.protection==='account-password';
  picker.value=chosenVault||'';$('profile-field').hidden=!unlock;
  $('auth-tabs').hidden=!credentials;$('credentials').hidden=!credentials;$('signup-fields').hidden=!credentials||!signup;
  $('restore-login-field').hidden=!credentials||signup;$('simple-login-hint').hidden=!credentials;
  $('vault-fields').hidden=credentials;$('vault-confirm-field').hidden=unlock;$('auth-back').hidden=unlock||credentials;
  $('other-account').hidden=!vaults.length||!unlock&&authStage==='vault';
  $('other-account').textContent=unlock?'Utiliser un autre compte ou un nouvel appareil':'Retrouver un compte enregistré ici';
  form.elements.username.required=credentials;form.elements.password.required=credentials;form.elements.name.required=false;
  form.elements.vault.required=!credentials;form.elements.vaultConfirm.required=!credentials&&!unlock;form.elements.code.required=credentials&&signup&&Boolean(config.signupRequiresCode);
  $('code-field').hidden=!config.signupRequiresCode;$('invitation-help').hidden=!config.signupRequiresCode;
  form.elements.password.autocomplete=signup?'new-password':'current-password';
  form.elements.password.minLength=credentials?12:0;form.elements.vault.minLength=credentials?0:12;form.elements.vaultConfirm.minLength=!credentials&&!unlock?12:0;
  if(signup&&credentials){form.elements.username.pattern='[a-z][a-z0-9_-]{2,31}';form.elements.username.maxLength=32;}else{form.elements.username.removeAttribute('pattern');form.elements.username.maxLength=255;}
  $('username-hint').textContent=signup?'3 à 32 caractères : lettres minuscules, chiffres, tirets ou underscores.':'Votre identifiant local ou votre adresse Matrix complète.';
  if(signup&&form.elements.username.value&&config.serverName)$('username-hint').textContent+=' Votre adresse : @'+form.elements.username.value+':'+config.serverName;
  $('auth-step').hidden=unlock;$('auth-step').textContent=credentials?'Votre compte':'Étape 2 sur 2 · Protéger cet appareil';
  $('auth-title').textContent=unlock?'Heureux de vous retrouver':credentials?(signup?'Créer votre compte':'Se connecter'):'Protéger cet appareil';
  $('auth-intro').textContent=unlock?'Déverrouillez votre coffre local pour retrouver votre session et vos clés.':credentials?(signup?'Un pseudo suffit : aucun e-mail ni numéro de téléphone demandé. Choisissez votre identifiant et votre mot de passe.':'Retrouvez votre compte sur cette installation.'):'Choisissez une phrase personnelle. Elle protège vos clés ici et n’est jamais envoyée au serveur.';
  $('auth-submit').textContent=unlock?'Déverrouiller':credentials?(signup?'Créer mon compte':'Se connecter'):signup?'Créer mon compte et ouvrir PolyTalk':'Me connecter et ouvrir PolyTalk';
  document.querySelector('label[for="vault-password"]').textContent=accountProtected?'Mot de passe utilisé pour protéger cet appareil':'Phrase de protection de cet appareil';
  $('vault-hint').textContent=accountProtected?'Saisissez le mot de passe utilisé lors de la connexion sur cet appareil. Après une modification du mot de passe du compte, utilisez ici l’ancien pour retrouver les clés locales.':unlock?'Cette phrase est propre à cet appareil. Aucun nouveau jeu de clés ne sera créé.':'12 caractères minimum, différents du mot de passe du compte. Conservez cette phrase dans un endroit sûr : elle ne peut pas être réinitialisée. Sur cet appareil, elle suffira ensuite à déverrouiller votre session.';
  $('login-tab').classList.toggle('active',!signup);$('signup-tab').classList.toggle('active',signup);$('login-tab').setAttribute('aria-pressed',String(!signup));$('signup-tab').setAttribute('aria-pressed',String(signup));$('auth-error').textContent='';
  $('wallet-login').hidden=!credentials||signup||!config.walletEnabled;
  $('passkey-login').hidden=!credentials||signup||!config.passkeysEnabled;
  $('identity-create').hidden=!credentials||!config.walletEnabled;$('identity-restore').hidden=!credentials||signup||!config.walletEnabled;
  let localKey=false;try{localKey=unlock&&Boolean(window.PublicKeyCredential)&&Boolean(readLocalUnlock(localStorage,chosenVault));}catch{}
  $('local-key-unlock').hidden=!localKey;
  if(!credentials&&!unlock&&authMethod==='wallet'){$('auth-intro').textContent='Choisissez la phrase locale qui protégera vos clés, puis signez dans votre wallet associé. Aucune transaction.';$('auth-submit').textContent='Choisir mon wallet et me connecter';}
  if(!credentials&&!unlock&&authMethod==='passkey'){$('auth-intro').textContent='Choisissez la phrase du coffre de cet appareil, puis utilisez une clé d’accès déjà associée à votre compte.';$('auth-submit').textContent='Utiliser ma clé d’accès';}
  for(const toggle of document.querySelectorAll('[data-password]')){$(toggle.dataset.password).type='password';toggle.textContent='Afficher';toggle.setAttribute('aria-pressed','false');}
}
$('profile-select').onchange=()=>{chosenVault=$('profile-select').value;$('auth-form').elements.vault.value='';authMode();};
$('local-key-unlock').onclick=()=>run(async()=>{
 if(authBusy||!unlock)return;const id=chosenVault,generation=messenger.scope.generation;let phrase;
 authBusy=true;$('local-key-unlock').disabled=true;
 try{phrase=await openLocalUnlock({record:readLocalUnlock(localStorage,id),vaultId:id,origin:location.origin});messenger.scope.assert(generation);if(!unlock||chosenVault!==id)throw Error('Le compte sélectionné a changé.');}
 finally{authBusy=false;$('local-key-unlock').disabled=false;}
 $('auth-form').elements.vault.value=phrase;$('auth-form').requestSubmit();
});
let identityManager;
async function identityAccess(action){
 if(authBusy)return;const generation=messenger.scope.generation;
 if(!identityManager){const {identityUi}=await import('./identity-ui.js');messenger.scope.assert(generation);identityManager=identityUi({messenger,config:()=>config,dialog,el,field,button,download,notice,getDialog:()=>$('dialog'),onReady:async({result,identity,recoveryCode})=>{
  if(authBusy)throw Error('Une connexion est déjà en cours.');authBusy=true;
  try{
   const session={userId:result.session.user_id,deviceId:result.session.device_id,accessToken:result.session.access_token,baseUrl:result.config.matrixBase,prefix:'polytalk-'+crypto.randomUUID(),protection:'custom',localIdentity:identity};
   const access=await finishAccess({scope:messenger.scope,prepare:async()=>session,connect:value=>messenger.connect(value,recoveryCode),connectedGeneration:()=>messenger.connectionGeneration,seal:value=>seal(value,recoveryCode),persist:(value,box)=>saveVault(localStorage,value,box)});
   messenger.scope.assert(access.generation);chosenVault=access.session.prefix;try{await tabResume.save({vaultId:chosenVault,phrase:recoveryCode});}catch{notice('La reprise automatique n’est pas disponible sur ce navigateur. Conservez votre code.');}messenger.scope.assert(access.generation);await enterWorkspace(access.session,access.generation);
  }catch(error){messenger.lock();authMode();throw error;}finally{authBusy=false;}
 }});}
 messenger.scope.assert(generation);return identityManager[action]();
}
$('identity-create').onclick=()=>run(()=>identityAccess('create'));
$('identity-restore').onclick=()=>run(()=>identityAccess('restore'));
function showAccessOptions(){
 if(authBusy)return;
 const body=dialog('Choisir comment accéder à PolyTalk');
 body.append(el('p','Choisissez selon votre situation. Les options à intégrer ne sont pas encore activables.'));
 for(const option of accessOptions({hasVault:readVaults(localStorage).length>0,walletEnabled:Boolean(config.walletEnabled),identityEnabled:Boolean(config.walletEnabled),passkeysEnabled:Boolean(config.passkeysEnabled),passkeySupported:Boolean(window.PublicKeyCredential)})){
  const card=el('section',undefined,'access-option');
  card.append(el('h3',option.title+(option.recommended?' · conseillé':'')),el('p',option.description));
  if(option.action)card.append(button(option.recommended?'Continuer avec ce choix':'Choisir',()=>{
   if(authBusy)return;
   if(option.action==='identity')return closeDialog($('dialog')).then(()=>identityAccess('create'));
   $('dialog').close();
   if(option.action==='unlock'){unlock=true;signup=false;authStage='credentials';authMethod='password';registrationState={registered:false};authMode();$('auth-form').elements.vault.focus();}
   else if(option.action==='wallet'){unlock=false;$('wallet-login').click();}
   else if(option.action==='passkey'){unlock=false;$('passkey-login').click();}
   else{unlock=false;changeAuthMode(option.action==='signup');}
  },option.recommended?'primary':'secondary'));
  else card.append(el('p',option.status==='planned'?'Prévu · non disponible actuellement':'Non activé sur ce serveur','hint'));
  body.append(card);
 }
 body.append(el('p','Le verrouillage du téléphone ou du PC ne remplace pas actuellement la phrase du coffre. N’enregistrez jamais une clé privée en clair dans un bloc-notes partagé.','hint'));
}
$('access-options').onclick=()=>run(showAccessOptions);
function changeAuthMode(create){if(authBusy)return;signup=create;authStage='credentials';authMethod='password';registrationState={registered:false};authMode();$('auth-form').elements.username.focus();}
$('login-tab').onclick=()=>changeAuthMode(false);$('signup-tab').onclick=()=>changeAuthMode(true);
$('wallet-login').onclick=()=>{if(authBusy)return;signup=false;registrationState={registered:false};authMethod='wallet';authStage='vault';authMode();$('auth-form').elements.vault.focus();};
$('passkey-login').onclick=()=>{if(authBusy)return;signup=false;registrationState={registered:false};authMethod='passkey';authStage='vault';authMode();$('auth-form').elements.vault.focus();};
$('auth-back').onclick=()=>{if(authBusy)return;authStage='credentials';authMethod='password';authMode();$('auth-form').elements.username.focus();};
$('other-account').onclick=()=>{if(authBusy)return;unlock=!unlock;signup=false;authStage='credentials';authMethod='password';registrationState={registered:false};authMode();(unlock?$('auth-form').elements.vault:$('auth-form').elements.username).focus();};
$('auth-username').addEventListener('input',()=>{registrationState={registered:false};if(signup)$('username-hint').textContent='Votre adresse : @'+$('auth-username').value+':'+(config.serverName||'votre-installation');});
for(const toggle of document.querySelectorAll('[data-password]'))toggle.onclick=()=>{const input=$(toggle.dataset.password),visible=input.type==='password';input.type=visible?'text':'password';toggle.textContent=visible?'Masquer':'Afficher';toggle.setAttribute('aria-pressed',String(visible));};
$('invitation-help-button').onclick=()=>{
 const body=dialog('Obtenir votre code d’invitation');
 body.append(el('p','Cette installation PolyTalk réserve les nouvelles inscriptions aux personnes et agents invités.'),el('h3','Qui peut vous le fournir ?'),el('p','La personne qui vous invite ou l’administrateur de cette installation PolyTalk. Demandez le code correspondant au serveur '+(config.serverName||'indiqué sur cette page')+'.'),el('h3','Vous avez déjà un compte ?'),el('p','Choisissez « Se connecter ». Le code d’invitation n’est demandé que pour créer un compte.'));
 const admin=el('details');admin.append(el('summary','Vous administrez cette installation ?'),el('p','Le code est défini par le paramètre SIGNUP_CODE dans le fichier privé .env du serveur. Transmettez-le uniquement aux personnes que vous souhaitez inviter.'));body.append(admin);
};
$('auth-help').onclick=()=>{const body=dialog('Vous accompagner pour vous connecter');body.append(el('h3',unlock?'Déverrouiller cet appareil':'Votre compte PolyTalk'),el('p',unlock?(readVaults(localStorage).find(v=>v.id===chosenVault)?.protection==='account-password'?'Cet appareil est protégé par le mot de passe utilisé lors de sa connexion. Après un changement du mot de passe du compte, l’ancien reste nécessaire pour ouvrir les clés locales.':'Votre ancien coffre est protégé par sa phrase locale. Conservez ses données et vérifiez vos sauvegardes si vous l’avez perdue.'):'Utilisez votre identifiant PolyTalk, pas une adresse e-mail, sauf si votre installation l’a explicitement prévu. Le nom du serveur figure sous le formulaire.'),el('h3','Mot de passe du compte oublié ?'),el('p','Contactez l’administrateur de cette installation pour la procédure de récupération disponible. Réinitialiser ce mot de passe ne restaure pas automatiquement les anciennes clés de chiffrement.'),el('h3','Première visite ?'),el('p','Créez votre compte avec un identifiant et un mot de passe. Une phrase distincte pour cet appareil est facultative. Le code d’invitation, lorsqu’il est demandé, vient de votre organisation. Vous pourrez associer un wallet dans vos réglages.'));};
$('auth-form').onsubmit=async event=>{
  event.preventDefault();if(authBusy)return;const form=event.currentTarget;if(!form.reportValidity())return;
  if(!unlock&&authStage==='credentials')authMethod='password';
  const data=new FormData(form);let passphrase=data.get('vault'),protection='custom';$('auth-error').textContent='';
  try{if(!unlock){const choice=accessProtection({method:authMethod,password:data.get('password'),custom:false,phrase:passphrase,confirmation:data.get('vaultConfirm')});passphrase=choice.phrase;protection=choice.protection;}}catch(error){$('auth-error').textContent=messageError(error);form.elements.vaultConfirm.focus();return;}
  authBusy=true;const controls=[...form.querySelectorAll('input,select,button'),$('login-tab'),$('signup-tab')];for(const control of controls)control.disabled=true;form.setAttribute('aria-busy','true');$('auth-submit').textContent=unlock?'Ouverture de votre coffre…':'Connexion et protection de cet appareil…';
  form.elements.vault.value='';form.elements.vaultConfirm.value='';form.elements.password.value='';
  try{
    const missing=missingPlatformFeatures(globalThis);if(missing.length)throw Error('Navigateur incompatible : '+missing.join(', ')+'. Utilisez un navigateur récent avec une connexion sécurisée.');
    const access=await finishAccess({scope:messenger.scope,prepare:async()=>{
      if(unlock){const saved=readVaults(localStorage).find(vault=>vault.id===chosenVault);if(!saved)throw Error('Sélectionnez un compte enregistré.');return unseal(saved.box,passphrase);}
      if(authMethod==='wallet')return wallets.login();
      if(authMethod==='passkey')return passkeyLogin(messenger,config);
      return authenticateOnce({signup,username:data.get('username'),password:data.get('password'),name:data.get('name'),kind:data.get('kind'),code:data.get('code')},registrationState,{register:b=>messenger.api('/register','POST',b),login:(name,password)=>messenger.login(name,password)});
    },connect:session=>{if(!unlock)session.protection=protection;return messenger.connect(session,passphrase);},connectedGeneration:session=>messenger.session===session?messenger.connectionGeneration:null,seal:session=>seal(session,passphrase),persist:(session,box)=>saveVault(localStorage,session,box,unlock?chosenVault:undefined)});
    messenger.scope.assert(access.generation);chosenVault=access.session.prefix;
    try{await tabResume.save({vaultId:chosenVault,phrase:passphrase});}catch(error){if(messenger.scope.current(access.generation))notice('Session ouverte. La reprise après actualisation n’est pas disponible sur ce navigateur.');}messenger.scope.assert(access.generation);
    await enterWorkspace(access.session,access.generation,{restoreHistory:data.has('restoreHistory')});
  }catch(error){clearInterval(presenceTimer);presenceTimer=null;messenger.lock();if(!unlock){authStage='credentials';if(registrationState.registered)signup=false;}authMode();$('auth-error').textContent=(registrationState.registered?'Votre compte est créé. Vous pouvez vous connecter. ':'')+messageError(error);}
  finally{authBusy=false;for(const control of controls)control.disabled=false;form.removeAttribute('aria-busy');if(!$('auth').hidden){const error=$('auth-error').textContent;authMode();$('auth-error').textContent=error;(unlock?form.elements.vault:form.elements.password).focus();}}
};

async function enterWorkspace(session,generation,{restoreHistory=false}={}){
 messenger.scope.assert(generation);
    $('account').textContent=messenger.profile.name+' · '+(messenger.profile.kind==='agent'?'Agent IA':'Humain')+'\n'+session.userId;
    clearInterval(presenceTimer);if(messenger.profile.kind==='agent'){const generation=messenger.scope.generation;const heartbeat=()=>{try{messenger.scope.assert(generation);}catch{return;}messenger.api('/coordination/agents/me/heartbeat','POST',{}).catch(()=>{});};heartbeat();presenceTimer=setInterval(heartbeat,45000);}
    $('auth').hidden=true;$('workspace').hidden=false;$('skip-link').href='#conversation-list';$('auth-form').reset();render();if(restoreHistory)await run(()=>showBackup({messenger,dialog,el,button,field,download,notice}));if(/^\/contact\//.test(location.pathname))contacts();
}
function lock({preserveResume=false}={}){if(!preserveResume)tabResume.clear().catch(()=>{});clearInterval(presenceTimer);presenceTimer=null;messenger.lock();clearTimeout(renderTimer);clearTimeout(toastTimer);clearPrivateView($);notify=false;pendingAttachment=null;paintAttachment();selected=null;searchFocus.clear();drafts.clear();$('workspace').hidden=true;$('auth').hidden=false;$('skip-link').href='#main';$('dialog').close();unlock=readVaults(localStorage).length>0;authMode();$('auth-form').elements.vault.focus();}
$('lock').onclick=lock;
const statuses={locked:'Coffre verrouillé',connecting:'Initialisation du chiffrement…',syncing:'Synchronisation…',ready:'Connecté · chiffrement actif',offline:'Hors ligne · envoi suspendu'};
messenger.addEventListener('status',event=>{$('connection').textContent=statuses[event.detail];updateComposerControls();});
messenger.addEventListener('session-expired',()=>{lock();$('auth-error').textContent='Votre session a expiré. Connectez-vous à nouveau.';});
messenger.addEventListener('change',()=>{clearTimeout(renderTimer);renderTimer=setTimeout(render,100);});
messenger.addEventListener('incoming',({detail})=>{
  if(notify&&document.hidden&&Notification.permission==='granted'){
    new Notification('Polytalk — Nouveau message',{body:'Un message chiffré vous attend.',tag:'polytalk-'+detail.room.roomId});
    messenger.api('/receipts','POST',{eventId:detail.event.getId(),roomId:detail.room.roomId,state:'notified'}).catch(()=>{});
  }
});
messenger.addEventListener('verification',event=>verification(event.detail));
function roomLabel(room){return room.name&&room.name!==room.roomId?room.name:'Conversation privée';}
function selectRoom(id,eventId){if(eventId)searchFocus.select(id,eventId);else searchFocus.clear();if(selected)drafts.set(selected,$('message').value);selected=id;pendingAttachment=null;paintAttachment();$('message').value=drafts.get(id)||'';$('file').value='';$('workspace').classList.add('open-thread');render();focusConversation($,true);run(()=>messenger.markRead(id));}
function home(){if(messenger.session){if(selected)drafts.set(selected,$('message').value);returnHome({close:()=>$('dialog').close(),clearFilter:()=>{$('search').value='';},clearSelection:()=>{selected=null;pendingAttachment=null;paintAttachment();searchFocus.clear();$('message').value='';},showList:()=>$('workspace').classList.remove('open-thread'),render});focusConversation($,false);if(location.pathname!=='/')history.replaceState(null,'','/');}else{if(authBusy)return;$('dialog').close();signup=false;authStage='credentials';authMethod='password';authMode();}}
for(const logo of document.querySelectorAll('[data-home]'))logo.onclick=event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();home();};
function humanActions(){return {conversation:newConversation,contacts,invitations:notifications,share:shareIdentity,settings};}
$('workspace-help').onclick=()=>run(()=>showHumanHelp({messenger,dialog,el,button,actions:humanActions()}));
function notifications(){return showNotifications({messenger,dialog,el,button,getDialog:()=>$('dialog'),openRoom:selectRoom,notice});}
$('message-search').onclick=()=>run(()=>showMessageSearch({messenger,dialog,el,field,button,getDialog:()=>$('dialog'),openMessage:(roomId,eventId)=>selectRoom(roomId,eventId)}));
$('notifications').onclick=()=>run(notifications);$('notification-shortcut').onclick=()=>run(notifications);
function render(){
  if(!messenger.client)return;
  const items=notificationItems(messenger.rooms()),invitations=items.filter(i=>i.kind==='invitation').length,total=items.reduce((sum,item)=>sum+item.count,0);
  for(const id of ['notification-count','notification-shortcut-count']){$(id).textContent=String(total);$(id).hidden=total===0;}
  for(const id of ['notifications','notification-shortcut'])$(id).setAttribute('aria-label','Notifications et invitations : '+invitations+' invitation(s), '+total+' notification(s) au total');
  const focusedRoom=document.activeElement?.closest?.('[data-room-id]')?.dataset.roomId;
  const rooms=messenger.rooms(),query=$('search').value.toLocaleLowerCase('fr');$('rooms').replaceChildren();$('room-count').textContent=String(rooms.length);
  for(const room of rooms.filter(room=>roomLabel(room).toLocaleLowerCase('fr').includes(query))){
    const node=button('',()=>selectRoom(room.roomId),'room-row'+(room.roomId===selected?' active':''));
    node.dataset.roomId=room.roomId;node.setAttribute('aria-current',room.roomId===selected?'true':'false');
    node.append(el('span',roomLabel(room).slice(0,1).toUpperCase(),'avatar'));
    const info=el('div',undefined,'room-info');info.append(el('strong',roomLabel(room)),el('p',room.getMyMembership()==='invite'?'Invitation à accepter':(room.getJoinedMemberCount()>2?'Groupe privé · ':'Conversation privée · ')+conversationSecurityLabel(room)));node.append(info);const unread=room.getUnreadNotificationCount?.('total')||0;if(unread>0){const badge=el('span',String(unread),'notification-badge');badge.setAttribute('aria-label',unread+' message(s) non lu(s)');node.append(badge);}node.querySelector('.avatar')?.setAttribute('aria-hidden','true');$('rooms').append(node);
  }
  if(!rooms.length)$('rooms').append(el('p','Pas encore de conversation. Consultez les invitations ou invitez un contact.','hint'));else if(query&&!$('rooms').children.length)$('rooms').append(el('p','Aucune conversation ne correspond à votre recherche.','hint'));
  restoreRoomFocus($('rooms'),focusedRoom);
  const room=messenger.client.getRoom(selected);if(!room){const welcome=humanHome({el,button,actions:humanActions()});$('messages').replaceChildren(welcome);$('room-name').textContent='Votre espace de conversation';$('room-description').textContent='Sélectionnez une conversation.';for(const id of ['composer','invitation','details'])$(id).hidden=true;return;}
  $('details').hidden=false;$('room-name').textContent=roomLabel(room);$('room-description').textContent=room.getMyMembership()==='invite'?'Invitation privée':`${room.getJoinedMemberCount()} participant${room.getJoinedMemberCount()>1?'s':''} · ${conversationSecurityLabel(room)}`;
  const events=messenger.messages(selected),container=$('messages'),nearBottom=container.scrollHeight-container.scrollTop-container.clientHeight<100,searchPosition=searchFocus.capture(container,selected);
  announceMessageUpdate(container,$('message-announcement'),selected,events.at(-1)?.getId()||'');
  container.replaceChildren();
  if(!events.length)container.append(el('div','Le début de votre conversation. Vos messages sont chiffrés de bout en bout.','empty hint'));
  for(const event of events){
    if(event.getType()==='m.room.encrypted'&&!event.isDecryptionFailure())messenger.client.decryptEventIfNeeded(event).catch(()=>{});
    const content=event.getContent(),mine=event.getSender()===messenger.session.userId;
    const wrap=el('article',undefined,'bubble-wrap'+(mine?' mine':''));wrap.dataset.eventId=event.getId()||'';wrap.append(el('p',event.getSender(),'sender'));
    const bubble=el('div',undefined,'bubble');
    if(event.getType()==='m.room.encrypted'&&!event.isDecryptionFailure())bubble.textContent='Déchiffrement en cours…';
    else if(event.isDecryptionFailure())bubble.textContent='Message indéchiffrable. Les clés sont absentes ou pas encore reçues. Importez un export protégé ou vérifiez vos appareils.';
    else if(content.msgtype==='m.file'){
      bubble.append(el('p',content.body||'Fichier chiffré'));
      bubble.append(button('↓ Télécharger et déchiffrer',async()=>download(await messenger.download(content),content.body||'piece-jointe')));
    }else if(content.msgtype==='m.key.verification.request')bubble.textContent='Demande de vérification d’appareil.';
    else bubble.textContent=typeof content.body==='string'?content.body:'Message non pris en charge.';
    wrap.append(bubble,el('p',new Date(event.getTs()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})+(event.status?' · '+(event.status==='not_sent'?'Échec de l’envoi':event.status==='sent'?'Déposé sur le serveur':'Envoi en cours'):' · Déposé sur le serveur'),'message-meta'));
    container.append(wrap);
  }
  if(!searchFocus.apply(container,selected,searchPosition)&&nearBottom)container.scrollTop=container.scrollHeight;
  $('invitation').hidden=room.getMyMembership()!=='invite';$('composer').hidden=room.getMyMembership()!=='join';updateComposerControls();
}
$('search').oninput=render;$('back').onclick=()=>{$('workspace').classList.remove('open-thread');focusConversation($,false);restoreRoomFocus($('rooms'),selected);};$('chats').onclick=home;
function newConversation(){
  const generation=messenger.scope.generation,body=dialog('Nouvelle conversation'),check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!$('dialog').open)throw Error('Cette fenêtre est fermée.');};body.append(el('p','Collez l’adresse PolyTalk que votre contact vous a partagée. Votre conversation sera privée et chiffrée.'));
  const members=field('Adresse de votre contact');members.input.placeholder='@camille:'+config.serverName;
  const name=field('Nom du groupe (facultatif)');name.input.maxLength=100;body.append(members.wrapper,name.wrapper);
  body.append(el('p','Pour un groupe, séparez plusieurs adresses par des virgules. Chaque personne devra accepter son invitation.','hint'));
  body.append(button('Créer la conversation et inviter',async()=>{check();const id=await messenger.createConversation(members.input.value.split(',').map(value=>value.trim()).filter(Boolean),name.input.value.trim());check();$('dialog').close();selectRoom(id);notice('Conversation créée. Les destinataires doivent accepter l’invitation.');},'primary'));
  members.input.focus();
  body.append(button('Vérifier la création précédente',()=>{check();const id=messenger.recoverConversation();$('dialog').close();selectRoom(id);notice('Conversation retrouvée. Aucune nouvelle invitation envoyée.');}));
}
$('new-chat').onclick=newConversation;$('first-chat').onclick=newConversation;
function updateComposerControls(){$('composer').querySelector('button[type=submit]').disabled=!canSendMessage({ready:messenger.state.status==='ready',busy:composerState.busy,text:$('message').value,attachment:pendingAttachment});}
$('message').oninput=updateComposerControls;
function paintAttachment(){updateComposerControls();const box=$('attachment-preview');box.replaceChildren();box.hidden=!pendingAttachment;if(!pendingAttachment)return;box.append(el('span','Prêt à envoyer : '+pendingAttachment.name+' · '+Math.ceil(pendingAttachment.size/1024)+' Ko'),button('Retirer le fichier',()=>{if(composerState.busy)throw Error('L’envoi est en cours.');pendingAttachment=null;$('file').value='';paintAttachment();}));}
$('composer').onsubmit=event=>{event.preventDefault();const roomId=selected,generation=messenger.scope.generation,input=$('message'),submit=$('composer').querySelector('button[type=submit]');if(composerState.busy)return;
 run(async()=>{submit.disabled=true;$('file').disabled=true;
 try{await sendPreparedMessage({input,state:composerState,getAttachment:()=>pendingAttachment,clearAttachment:expected=>{if(pendingAttachment===expected){pendingAttachment=null;$('file').value='';paintAttachment();}},isCurrent:()=>selected===roomId&&messenger.scope.current(generation),sendFile:file=>messenger.sendFile(roomId,file),sendText:async value=>{await messenger.sendText(roomId,value);if(drafts.get(roomId)===value)drafts.delete(roomId);}});if(messenger.scope.current(generation)){render();if(selected===roomId)$('messages').scrollTop=$('messages').scrollHeight;}}
 finally{updateComposerControls();$('file').disabled=false;}});
};
$('message').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();$('composer').requestSubmit();}};
$('file').onchange=()=>run(()=>{const file=$('file').files[0];if(!file)return;if(file.size>10*1024*1024){$('file').value='';throw Error('Fichier trop volumineux : 10 Mio maximum.');}pendingAttachment=file;paintAttachment();});
$('join').onclick=()=>runButtonAction($('join'),async()=>{const id=selected;await messenger.client.joinRoom(id);render();},error=>notice(messageError(error),{error:true}));$('reject').onclick=()=>runButtonAction($('reject'),async()=>{const id=selected,generation=messenger.scope.generation;if(!window.confirm('Refuser l’invitation à « '+(messenger.client.getRoom(id)?.name||'Conversation privée')+' » ('+id+') ? Vous ne rejoindrez pas cette conversation.'))return;messenger.scope.assert(generation);if(messenger.client.getRoom(id)?.getMyMembership()!=='invite')throw Error('Cette invitation n’est plus en attente.');await messenger.client.leave(id);messenger.scope.assert(generation);if(selected===id)home();else render();},error=>notice(messageError(error),{error:true}));
function download(blob,name){const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=name.replace(/[\\/\x00-\x1f]/g,'_');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function showDevices(parent,userId){
  const generation=messenger.scope.generation;const all=await messenger.client.getCrypto().getUserDeviceInfo([userId],true),devices=all.get(userId);messenger.scope.assert(generation);if(!parent.isConnected||!$('dialog').open)return;
  parent.append(el('h3','Appareils de '+userId));
  if(!devices?.size){parent.append(el('p','Aucun appareil trouvé.'));return;}
  for(const [id,device]of devices){
    const row=el('div',undefined,'rule');row.append(el('span',(device.displayName||'Appareil')+' · '+id));
    if(id!==messenger.session.deviceId||userId!==messenger.session.userId)row.append(button('Vérifier',async()=>verification(await messenger.verifyDevice(userId,id))));
    else row.append(el('span','Cet appareil'));
    parent.append(row);
  }
}
$('details').onclick=()=>run(async()=>{
  const roomId=selected,generation=messenger.scope.generation,room=messenger.client.getRoom(roomId);if(!room)throw Error('Sélectionnez une conversation.');const body=dialog('Détails de la conversation'),check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!$('dialog').open)throw Error('Cette fenêtre est fermée.');};body.append(el('p',roomLabel(room)),el('pre',room.roomId));
  body.append(el('p','Le type humain ou agent est déclaré par son opérateur. Un agent peut transmettre les contenus à ses modèles. Vérifiez les appareils par un canal indépendant.'));
  await room.loadMembersIfNeeded();check();
  for(const member of room.getJoinedMembers()){
    const row=el('div',undefined,'rule');row.append(el('span',member.userId),button('Appareils',()=>showDevices(body,member.userId)));body.append(row);
  }
  const target=field('Inviter une adresse Matrix');body.append(target.wrapper,button('Inviter',async()=>{check();await messenger.client.invite(roomId,target.input.value.trim());check();notice('Invitation envoyée.');}));
  body.append(button('Charger des messages précédents',async()=>{check();await messenger.client.scrollback(room,50);check();render();$('dialog').close();}));
});
function verification(request){
  const body=dialog('Vérifier un appareil');body.append(el('p','Comparez les symboles avec votre correspondant par un autre canal, en personne ou par téléphone.'),el('pre',request.otherUserId+(request.otherDeviceId?' · '+request.otherDeviceId:'')));
  const status=el('p','Demande de vérification en attente.'),controls=el('div');body.append(status,controls);
  const progress=new VerificationProgress(phase=>{
    const labels={waiting:'Confirmation envoyée. En attente de l’autre appareil.',verified:'Vérification terminée : appareil vérifié.',cancelled:'Vérification annulée ou expirée.'};
    status.textContent=labels[phase];controls.replaceChildren();
  });
  let verifierStarted=false;
  function attach(verifier){
    if(verifierStarted)return;verifierStarted=true;
    const show=callbacks=>{
      status.textContent='Les symboles sont-ils identiques sur les deux appareils ?';controls.replaceChildren();
      const sas=el('p',callbacks.sas.emoji?.map(([emoji,name])=>emoji+' '+name).join(' · ')||callbacks.sas.decimal?.join(' — '));sas.className='sas';controls.append(sas,button('Ils correspondent',()=>progress.confirm(()=>callbacks.confirm()),'primary'),button('Ils sont différents',()=>{callbacks.mismatch();}));
    };
    verifier.on('show_sas',show);const pending=verifier.getShowSasCallbacks();if(pending)show(pending);
    verifier.verify().then(()=>progress.complete()).catch(()=>progress.cancel());
  }
  const update=()=>{
    if(request.phase===5){progress.cancel();return;}
    if(request.phase===6){progress.complete();return;}
    if(request.verifier){attach(request.verifier);return;}
    if(request.phase===3&&!verifierStarted){controls.replaceChildren(button('Comparer les symboles',async()=>attach(await request.startVerification('m.sas.v1')),'primary'));}
  };
  if(!request.initiatedByMe&&request.phase===2)controls.append(button('Accepter la vérification',async()=>{await request.accept();update();},'primary'));
  body.append(button('Annuler la vérification',async()=>{await request.cancel();$('dialog').close();}));request.on('change',update);update();
}
$('teams').onclick=()=>run(()=>showTeamTransfer({messenger,origin:config.origin,dialog,el,field,button,download,openRoom:selectRoom}));
$('coordination').onclick=()=>run(()=>showCoordination({messenger,roomId:messenger.client?.getRoom(selected)?.getMyMembership()==='join'?selected:null,dialog,el,field,button,notice}));
$('settings').onclick=()=>run(settings);
$('contacts').onclick=()=>run(contacts);
function savedContacts(){return showContactList({messenger,dialog,el,field,button,getDialog:()=>$('dialog'),openRoom:selectRoom,addContact:contacts,notice});}
$('contact-list').onclick=()=>run(savedContacts);
$('share-id').onclick=()=>run(shareIdentity);
function settings(){return showHumanSettings({messenger,config,dialog,el,field,button,notice,download,render:()=>{$('account').textContent=messenger.profile.name+' · '+messenger.session.userId;render();},actions:{
 security:()=>showSecurity({messenger,dialog,el,field,button,download,notice,getDialog:()=>$('dialog')}),
 passkeys:()=>showPasskeys({messenger,dialog,el,field,button,notice,getDialog:()=>$('dialog')}),
 sessions:()=>showSessions({messenger,dialog,el,field,button,notice,getDialog:()=>$('dialog')}),
 localUnlock:()=>showLocalUnlock({messenger,dialog,el,field,button,notice,getDialog:()=>$('dialog')}),
 backup:()=>showBackup({messenger,dialog,el,button,field,download,notice}),wallets:wallets.settings,identity:()=>identityAccess('settings'),devices:parent=>showDevices(parent,messenger.session.userId),
 getNotify:()=>notify,toggleNotify:async check=>{if(!('Notification'in window))throw Error('Ce navigateur ne propose pas de notifications. Les invitations restent disponibles dans la messagerie.');if(notify){notify=false;return;}const permission=await Notification.requestPermission();check();notify=permission==='granted';if(!notify)notice('Notifications refusées. Vous pouvez les autoriser dans les réglages du navigateur.');}
}});}
window.addEventListener('focus',()=>{if(messenger.session)messenger.refreshPolicy().then(render).catch(()=>{render();notice('Politique indisponible : réception masquée par précaution.');});});
window.addEventListener('pagehide',()=>{lock({preserveResume:true});authInteractions=0;});
async function resumeTab(){if(authInteractions>0)return;const interactions=authInteractions,generation=messenger.scope.generation;let saved;try{saved=await tabResume.load();}catch{return;}if(!saved||authBusy||messenger.session||authInteractions!==interactions||!messenger.scope.current(generation))return;if(!readVaults(localStorage).some(v=>v.id===saved.vaultId)){await tabResume.clear();return;}unlock=true;chosenVault=saved.vaultId;authMode();$('auth-form').elements.vault.value=saved.phrase;$('auth-form').requestSubmit();}
window.addEventListener('pageshow',event=>{if(event.persisted)resumeTab().catch(()=>{});});
try{unlock=readVaults(localStorage).length>0;}catch(error){$('auth-error').textContent=messageError(error);}
authMode();
messenger.api('/config').then(value=>{config=value;authMode();$('code-field').hidden=!value.signupRequiresCode;$('installation').textContent=value.serverName+' · Installation '+(value.edition==='intranet'?'intranet':'Internet');resumeTab().catch(()=>{});}).catch(()=>{$('installation').textContent='Installation indisponible';});


async function copyPublic(value){
 try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(value);notice('Copié.');}
 catch{const body=dialog('Copier votre identifiant'),input=field('Sélectionnez puis copiez ce texte','text',value);input.input.readOnly=true;body.append(input.wrapper);input.input.select();}
}
async function shareIdentity(){
 const token=messenger.scope.generation,body=dialog('Mon adresse et QR code'),check=()=>{messenger.scope.assert(token);if(!body.isConnected||!$('dialog').open)throw Error('Cette fenêtre est fermée.');};body.append(el('p','Chargement de votre adresse…'));const card=await messenger.api('/contacts/'+messenger.profile.id);check();body.replaceChildren();
 body.append(el('p','Envoyez cette adresse ou ce QR code à la personne qui souhaite vous écrire. Elle pourra vous inviter dans une conversation. Vos règles de réception restent applicables.'),el('h3','Mon adresse à partager'),el('pre',card.mxid));
 const canvas=el('canvas');await QRCode.toCanvas(canvas,card.url,{width:256,margin:4,errorCorrectionLevel:'M'});check();canvas.setAttribute('aria-label','QR code de votre lien public');canvas.setAttribute('role','img');body.append(canvas,el('pre',card.url));
 body.append(button('Copier mon adresse',()=>copyPublic(card.mxid),'primary'),button('Copier mon lien',()=>copyPublic(card.url)));const advanced=el('details',undefined,'advanced-options');advanced.append(el('summary','Carte de contact et formats avancés'),el('p','Identifiant technique : '+card.id),button('Télécharger la carte de contact JSON',()=>download(new Blob([JSON.stringify(card,null,2)],{type:'application/json'}),'polytalk-contact.json')));
 body.append(button('Enregistrer mon QR code en image',()=>new Promise((resolve,reject)=>canvas.toBlob(blob=>{if(!messenger.scope.current(token)){resolve();return;}if(!blob){reject(Error('Export PNG indisponible.'));return;}download(blob,'polytalk-contact.png');resolve();},'image/png'))));
 advanced.append(button('Télécharger le QR SVG',async()=>{const svg=await QRCode.toString(card.url,{type:'svg',margin:4});check();download(new Blob([svg],{type:'image/svg+xml'}),'polytalk-contact.svg');}));
 body.append(advanced);
 if(navigator.share)body.append(button('Partager…',async()=>{try{await navigator.share({title:'Mon identité PolyTalk',text:card.mxid,url:card.url});}catch(error){if(error.name!=='AbortError')await copyPublic(card.url);}}));
 body.append(el('p','La carte contient des informations publiques. Elle ne constitue pas une signature personnelle. Vérifiez les appareils par un autre canal.'));
}
function contacts(){
 const token=messenger.scope.generation,body=dialog('Trouver un contact'),input=field('Adresse ou lien de votre contact');input.input.placeholder='@contact:'+config.serverName;body.append(el('p','Demandez à votre contact de partager son adresse ou son QR code depuis « Mon adresse et QR code ». Collez son adresse ou son lien ici, puis vérifiez le destinataire.'),input.wrapper);
 const preview=el('div');let revision=0;
 input.input.oninput=()=>{revision++;preview.replaceChildren();};
 async function inspect(value){
  const request=++revision,snapshot=input.input.value;
  messenger.scope.assert(token);if(!body.isConnected||!$('dialog').open)throw Error('Cette fenêtre est fermée.');const ref=parseContact(value,location.origin);let contact;
  if(ref.id){contact=await messenger.api('/contacts/'+ref.id);if(ref.mxid&&ref.mxid!==contact.mxid)throw Error('La carte ne correspond pas au registre de cette installation.');}
  else{const result=await messenger.api('/contacts?q='+encodeURIComponent(ref.mxid));contact=result.contacts.find(item=>item.mxid===ref.mxid)||{mxid:ref.mxid,name:'Adresse Matrix non enregistrée ici'};}
  messenger.scope.assert(token);if(request!==revision||snapshot!==input.input.value||!body.isConnected||!$('dialog').open)return;preview.replaceChildren();preview.append(el('h3','Aperçu du destinataire'),el('p',contact.name),el('pre',contact.mxid),el('p','Aucune autorisation n’a été modifiée. Une conversation nécessite une invitation acceptée.'));
  if(contact.mxid===messenger.session.userId){preview.append(el('p','Il s’agit de votre propre compte.'));return;}
  preview.append(button('Enregistrer dans mes contacts',async()=>{messenger.scope.assert(token);if(request!==revision||snapshot!==input.input.value||!body.isConnected||!$('dialog').open)throw Error('L’adresse a changé. Affichez un nouvel aperçu.');await messenger.api('/address-book','POST',{action:'save',mxid:contact.mxid,name:contact.name==='Adresse Matrix non enregistrée ici'?contact.mxid.split(':')[0].slice(1,81):contact.name});messenger.scope.assert(token);if(!body.isConnected||!$('dialog').open)return;await savedContacts();notice('Contact enregistré. Vos règles de réception restent inchangées.');}));
  preview.append(button('Créer une conversation et inviter',async()=>{messenger.scope.assert(token);if(request!==revision||snapshot!==input.input.value||!body.isConnected||!$('dialog').open)throw Error('L’adresse a changé. Affichez un nouvel aperçu avant de continuer.');const id=await messenger.createConversation([contact.mxid]);messenger.scope.assert(token);$('dialog').close();selectRoom(id);},'primary'));
 }
 body.append(button('Afficher l’aperçu',()=>inspect(input.input.value)));
 const file=field('Fichier de contact ou image du QR code','file');file.input.accept='.json,.txt,image/png,image/jpeg,image/webp';const advanced=el('details',undefined,'advanced-options');advanced.append(el('summary','Ajouter depuis un QR code ou un fichier'),el('p','Vous pouvez aussi saisir un identifiant technique UUID dans le champ ci-dessus.'),file.wrapper,button('Lire ce fichier',async()=>{const value=await readContactFile(file.input.files[0]);messenger.scope.assert(token);await inspect(value);}));body.append(advanced,preview,button('Créer une conversation de groupe',newConversation));
 input.input.focus();
 const path=/^\/contact\/([0-9a-f-]{36})$/i.exec(location.pathname);if(path){input.input.value=location.origin+path[0];}
}

let installPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
$('install-app').onclick=()=>run(async()=>{
 if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();return;}
 const body=dialog('Installer PolyTalk');body.append(el('p','Sur iPhone ou iPad : ouvrez le menu Partager puis Sur l’écran d’accueil. Sur ordinateur ou Android : utilisez Installer l’application dans le menu du navigateur, si proposé.'),el('p','L’installation exige HTTPS hors développement local. Elle ne donne aucun droit supplémentaire aux agents. Le serveur reste nécessaire pour échanger des messages.'));
});
