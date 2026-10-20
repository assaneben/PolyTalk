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
import {startRegistration,startAuthentication,browserSupportsWebAuthn} from '@simplewebauthn/browser';
export async function passkeyLogin(messenger,config){
 if(!browserSupportsWebAuthn())throw Error('Ce navigateur ne propose pas les clés d’accès. Utilisez votre mot de passe ou votre wallet.');
 const generation=messenger.scope.generation,challenge=await messenger.api('/passkeys/options','POST',{});messenger.scope.assert(generation);
 const credential=await startAuthentication({optionsJSON:challenge.options});messenger.scope.assert(generation);
 const result=await messenger.completeAuthentication(await messenger.api('/passkeys/login','POST',{id:challenge.id,credential}));messenger.scope.assert(generation);
 return {userId:result.user_id,deviceId:result.device_id,accessToken:result.access_token,baseUrl:config.matrixBase,prefix:'polytalk-'+crypto.randomUUID()};
}
export async function showPasskeys({messenger,dialog,el,field,button,notice,getDialog}){
 const generation=messenger.scope.generation,body=dialog('Mes clés d’accès · facultatives');
 const check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!getDialog().open)throw Error('Rouvrez les clés d’accès.');};
 const result=await messenger.api('/passkeys/list');check();
 body.append(el('p','Ajoutez volontairement une passkey de cet appareil ou une clé de sécurité USB/NFC. Votre empreinte, visage ou code écran reste géré par l’authentificateur. Le mot de passe reste utilisable et la récupération des messages est distincte.'));
 const password=field('Mot de passe actuel du compte','password');password.input.autocomplete='current-password';
 const code=field('Code TOTP ou de secours, si votre 2FA est activée','text');code.input.autocomplete='one-time-code';code.input.maxLength=64;
 const name=field('Nom pour retrouver cette clé','text','Mon appareil');name.input.maxLength=80;body.append(password.wrapper,code.wrapper,name.wrapper);
 getDialog().addEventListener('close',()=>{password.input.value='';code.input.value='';name.input.value='';body.replaceChildren();},{once:true});
 if(browserSupportsWebAuthn())body.append(button('Ajouter une passkey ou une clé USB/NFC',async()=>{
  check();const challenge=await messenger.api('/passkeys/register/options','POST',{password:password.input.value,code:code.input.value.trim(),name:name.input.value});check();password.input.value='';code.input.value='';
  const credential=await startRegistration({optionsJSON:challenge.options});check();await messenger.api('/passkeys/register/verify','POST',{id:challenge.id,credential});check();notice('Clé d’accès enregistrée.');await showPasskeys({messenger,dialog,el,field,button,notice,getDialog});
 },'primary'));
 else body.append(el('p','Votre navigateur ne propose pas WebAuthn. Vous pouvez consulter ou retirer les clés existantes.'));
 for(const key of result.passkeys){const row=el('section',undefined,'access-option');row.append(el('h3',key.name),el('p','Ajoutée le '+new Date(key.created_at).toLocaleDateString('fr-FR')),button('Retirer cette clé de connexion',async()=>{
  check();if(!globalThis.confirm('Retirer la clé « '+key.name+' » ('+key.id.slice(0,12)+') ? Elle ne pourra plus ouvrir de nouvelle session. Conservez un autre moyen de connexion.'))return;check();await messenger.api('/passkeys/remove','POST',{id:key.id,password:password.input.value,code:code.input.value.trim()});check();password.input.value='';code.input.value='';notice('Cette clé ne peut plus ouvrir de nouvelle session PolyTalk.');await showPasskeys({messenger,dialog,el,field,button,notice,getDialog});
 }));body.append(row);}
}
