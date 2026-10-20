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
import QRCode from 'qrcode';
import {closeDialog} from './private-view.js';
export function secondFactorUi({messenger,dialog,el,field,getDialog}){
 return pending=>new Promise((resolve,reject)=>{
  const generation=messenger.scope.generation,body=dialog('Validation en deux étapes'),modal=getDialog();let busy=false,settled=false;
  const code=field('Code de l’application TOTP ou code de secours','text');code.input.autocomplete='one-time-code';code.input.maxLength=64;code.input.spellcheck=false;
  const error=el('p','','error');error.setAttribute('role','alert');const submit=el('button','Vérifier','primary');submit.type='button';
  const cancel=()=>{code.input.value='';if(settled)return;settled=true;messenger.api('/auth/cancel','POST',{id:pending.id}).catch(()=>{});reject(Error('Validation annulée. Reconnectez-vous pour réessayer.'));};
  modal.addEventListener('close',cancel,{once:true});
  submit.onclick=async()=>{
   if(busy||settled)return;busy=true;submit.disabled=true;error.textContent='';
   try{messenger.scope.assert(generation);const result=await messenger.api('/auth/verify','POST',{id:pending.id,code:code.input.value.trim()});
    if(settled||!messenger.scope.current(generation)||!body.isConnected||!modal.open){if(typeof result.access_token==='string')await fetch('/_matrix/client/v3/logout',{method:'POST',headers:{Authorization:'Bearer '+result.access_token,'Content-Type':'application/json'},body:'{}'}).catch(()=>{});throw Error('Validation interrompue.');}
    settled=true;code.input.value='';modal.removeEventListener('close',cancel);await closeDialog(modal);resolve(result);}
   catch(e){if(!settled)error.textContent=e.message;}
   finally{busy=false;submit.disabled=false;}
  };
  body.append(el('p','Votre première preuve de connexion a été vérifiée. Saisissez le code à 6 chiffres de votre application, ou l’un de vos dix codes de secours. La demande expire après deux minutes.'),code.wrapper,error,submit);code.input.focus();
 });
}
export async function showSecurity({messenger,dialog,el,field,button,download,notice,getDialog}){
 let enrollment=null;const sensitive=[];
 const generation=messenger.scope.generation,body=dialog('Sécurité et méthodes de connexion');
 const check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!getDialog().open)throw Error('Rouvrez les paramètres de sécurité.');};
 const status=await messenger.api('/security/status');check();
 body.append(el('p','La validation en deux étapes est facultative. Elle protège les nouvelles connexions ; les sessions déjà ouvertes restent utilisables.'),el('h3',status.totpEnabled?'Application TOTP · activée':'Application TOTP · désactivée'));
 const password=field('Confirmez le mot de passe du compte','password');password.input.autocomplete='current-password';body.append(password.wrapper);
 sensitive.push(password.input);getDialog().addEventListener('close',()=>{for(const input of sensitive)input.value='';enrollment=null;body.replaceChildren();},{once:true});
 const history=el('div');body.append(button('Consulter mon historique de sécurité',async()=>{
  check();const result=await messenger.api('/security/audit');check();history.replaceChildren();
  const labels={'totp.enabled':'2FA activée','totp.disabled':'2FA désactivée','backup_codes.renewed':'Codes de secours renouvelés','passkey.added':'Clé d’accès ajoutée','passkey.removed':'Clé d’accès retirée','session.revoked':'Autre session révoquée'};
  if(!result.events.length)history.append(el('p','Aucun changement de sécurité enregistré.'));
  for(const item of result.events)history.append(el('p',new Date(item.at).toLocaleString('fr-FR')+' · '+(labels[item.event]||'Changement de sécurité')));
 }),history);
 const codesView=codes=>{
  check();password.input.value='';const view=dialog('Conserver vos dix codes de secours'),display=el('pre',codes.join('\n'));
  view.append(el('p','Chaque code ne fonctionne qu’une fois. Conservez-les hors de cet appareil, sur papier ou dans un gestionnaire de mots de passe. Ils ne déchiffrent pas vos messages.'),display,
   button('Enregistrer les codes dans un fichier personnel',()=>{messenger.scope.assert(generation);if(!view.isConnected||!getDialog().open)throw Error('Cette vue est fermée.');download(new Blob(['PolyTalk — codes de secours 2FA\n\n'+display.textContent+'\n'],{type:'text/plain;charset=utf-8'}),'polytalk-codes-secours.txt');}));
  getDialog().addEventListener('close',()=>display.textContent='',{once:true});
 };
 if(!status.totpEnabled){
  body.append(el('p','Compatible Google Authenticator, Microsoft Authenticator, Aegis et autres applications TOTP. Aucun compte Google ni connexion Internet de l’application TOTP n’est nécessaire.'));
  const setup=el('div');const code=field('Premier code à 6 chiffres','text');code.input.inputMode='numeric';code.input.autocomplete='one-time-code';code.input.maxLength=6;
  sensitive.push(code.input);
  body.append(button('Configurer une application TOTP',async()=>{
   check();const result=await messenger.api('/security/totp/begin','POST',{password:password.input.value});check();enrollment=result;
   const canvas=el('canvas');await QRCode.toCanvas(canvas,result.uri,{width:240,margin:4});check();canvas.setAttribute('role','img');canvas.setAttribute('aria-label','QR secret de configuration TOTP, à scanner uniquement avec votre application');
   setup.replaceChildren();setup.append(el('p','Scannez ce QR dans votre application. Vous pouvez aussi saisir cette clé manuellement :'),canvas,el('pre',result.secret),code.wrapper,
    button('Activer la 2FA',async()=>{check();if(!enrollment)throw Error('Configurez votre application.');const result=await messenger.api('/security/totp/confirm','POST',{password:password.input.value,code:code.input.value.trim()});check();code.input.value='';setup.replaceChildren();enrollment=null;codesView(result.backupCodes);},'primary'));
  }),setup);
 }else{
  const code=field('Code TOTP ou code de secours','text');code.input.autocomplete='one-time-code';code.input.maxLength=64;body.append(el('p',status.backupCodesRemaining+' codes de secours encore disponibles.'),code.wrapper,
   button('Renouveler mes dix codes de secours',async()=>{check();if(!globalThis.confirm('Renouveler les codes de secours ? Les dix anciens codes deviendront inutilisables.'))return;check();const result=await messenger.api('/security/backup-codes','POST',{password:password.input.value,code:code.input.value.trim()});check();code.input.value='';codesView(result.backupCodes);}),
   button('Désactiver la validation en deux étapes',async()=>{check();if(!globalThis.confirm('Désactiver la validation en deux étapes ? Votre compte ne demandera plus ce second facteur à la connexion.'))return;check();await messenger.api('/security/totp/disable','POST',{password:password.input.value,code:code.input.value.trim()});check();password.input.value='';code.input.value='';notice('2FA désactivée à votre demande.');await showSecurity({messenger,dialog,el,field,button,download,notice,getDialog});}));
  sensitive.push(code.input);
 }
}
