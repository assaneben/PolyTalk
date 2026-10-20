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
import {createLocalUnlock,readLocalUnlock,saveLocalUnlock,removeLocalUnlock} from './local-unlock.js';
import {readVaults} from './vault.js';
export async function showLocalUnlock({messenger,dialog,el,field,button,notice,getDialog}){
 const generation=messenger.scope.generation,id=messenger.session.prefix,body=dialog('Déverrouiller cet appareil avec une clé d’accès');
 const check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!getDialog().open)throw Error('Rouvrez la protection de cet appareil.');};
 const vault=readVaults(localStorage).find(v=>v.id===id);if(!vault)throw Error('Le coffre de cet appareil doit être enregistré avant cette configuration.');
 body.append(el('p','Cette option est facultative et propre à ce navigateur. Votre clé d’accès ouvrira la phrase du coffre chiffrée localement grâce à PRF. Aucun secret de déverrouillage n’est envoyé au serveur.'),el('p','Conservez votre phrase du coffre : elle reste la solution de secours si la clé est perdue, supprimée ou incompatible. La prise en charge PRF varie selon le navigateur et l’authentificateur.'));
 if(readLocalUnlock(localStorage,id)){
  body.append(el('p','Déverrouillage par clé d’accès activé ici.'),button('Désactiver sur cet appareil',()=>{check();if(!globalThis.confirm('Désactiver le déverrouillage par clé sur cet appareil ? Votre phrase du coffre restera nécessaire pour le rouvrir.'))return;check();removeLocalUnlock(localStorage,id);notice('Déverrouillage local par clé désactivé. Votre phrase reste utilisable.');getDialog().close();}));return;
 }
 const result=await messenger.api('/passkeys/list');check();
 if(!result.passkeys.length){body.append(el('p','Ajoutez d’abord une passkey ou une clé USB/NFC dans Gérer mes passkeys.'));return;}
 const label=el('label','Clé à utiliser'),select=el('select');for(const key of result.passkeys){const option=el('option',key.name);option.value=key.id;select.append(option);}label.append(select);
 const phrase=field('Phrase actuelle du coffre de cet appareil','password');phrase.input.autocomplete='off';phrase.input.minLength=12;phrase.input.maxLength=512;
 const controller=new AbortController();getDialog().addEventListener('close',()=>{controller.abort();phrase.input.value='';body.replaceChildren();},{once:true});
 let busy=false;
 body.append(label,phrase.wrapper,button('Activer le déverrouillage local par cette clé',async()=>{
  check();if(busy)return;busy=true;
  try{const record=await createLocalUnlock({vault,phrase:phrase.input.value,credentialId:select.value,origin:location.origin,signal:controller.signal,check});check();saveLocalUnlock(localStorage,record);phrase.input.value='';notice('Déverrouillage par clé activé sur cet appareil. Conservez votre phrase de secours.');getDialog().close();}
  finally{busy=false;phrase.input.value='';}
 },'primary'));
}
