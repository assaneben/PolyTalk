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
export async function showSessions({messenger,dialog,el,field,button,notice,getDialog}){
 const generation=messenger.scope.generation,body=dialog('Appareils et sessions connectés');
 const check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!getDialog().open)throw Error('Rouvrez la gestion des sessions.');};
 const inventory=await messenger.api('/security/devices');check();
 body.append(el('p','Consultez les appareils de votre compte et révoquez une autre session si vous ne la reconnaissez plus. Votre session actuelle reste ouverte.'),el('p','La révocation bloque les prochains accès au serveur. Elle ne peut pas effacer les messages et clés déjà conservés sur un autre appareil.'));
 const password=field('Confirmez le mot de passe du compte','password');password.input.autocomplete='current-password';password.input.maxLength=256;body.append(password.wrapper);
 const code=field('Code TOTP ou code de secours','text');code.input.autocomplete='one-time-code';code.input.maxLength=64;if(inventory.totpEnabled)body.append(code.wrapper);
 getDialog().addEventListener('close',()=>{password.input.value='';code.input.value='';body.replaceChildren();},{once:true});let busy=false;
 for(const device of inventory.devices){
  const current=device.deviceId===inventory.currentDeviceId,row=el('section',undefined,'access-option');
  row.append(el('h3',device.name+(current?' · cet appareil':'')),el('pre',device.deviceId),el('p',device.lastSeen===null?'Dernière activité non disponible':'Dernière activité connue : '+new Date(device.lastSeen).toLocaleString('fr-FR')));
  if(!current)row.append(button('Révoquer cette session',async()=>{
   check();if(busy)return;if(password.input.value.length<12)throw Error('Saisissez le mot de passe de votre compte.');if(!globalThis.confirm('Révoquer la session « '+device.name+' » ('+device.deviceId+') ? Ses prochains accès au serveur seront refusés. Ses copies locales ne seront pas effacées.'))return;check();busy=true;
   try{await messenger.api('/security/devices/revoke','POST',{deviceId:device.deviceId,password:password.input.value,code:code.input.value.trim()});check();password.input.value='';code.input.value='';notice('L’autre session a été révoquée.');await showSessions({messenger,dialog,el,field,button,notice,getDialog});}
   finally{busy=false;password.input.value='';code.input.value='';}
  }));
  body.append(row);
 }
 if(!inventory.devices.length)body.append(el('p','Aucun appareil disponible. Réessayez après synchronisation.'));
}
