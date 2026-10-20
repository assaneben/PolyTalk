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
const categories=[['profile','Mon profil','Changer le nom affiché et retrouver mon adresse.'],['privacy','Qui peut me contacter','Bloquer un compte ou accepter uniquement certains contacts.'],['notifications','Notifications','Choisir si cet appareil m’avertit des nouveaux messages.'],['security','Connexion et sécurité','Validation en deux étapes, clés d’accès et autres moyens de connexion.'],['recovery','Sauvegarder mes conversations','Préparer une sauvegarde ou retrouver mes messages sur un autre appareil.'],['devices','Mes appareils','Consulter les sessions ouvertes et vérifier les appareils.']];
export async function showHumanSettings(options){
 const {messenger,config,dialog,el,field,button,notice,download,render,actions,section='home'}=options;
 const generation=messenger.scope.generation,category=categories.find(item=>item[0]===section),body=dialog(category?.[1]||'Paramètres');
 const check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!body.closest('dialog')?.open)throw Error('Ces paramètres sont fermés. Rouvrez la rubrique.');};
 const open=key=>{check();return showHumanSettings({...options,section:key});};
 const action=(title,description,handler)=>{const card=el('section',undefined,'settings-choice');card.append(button(title,()=>{check();return handler();},'secondary wide'),el('p',description));body.append(card);};
 if(section==='home'){
  body.append(el('p','Choisissez ce que vous souhaitez modifier. Les réglages de sécurité supplémentaires restent facultatifs.','dialog-intro'));
  for(const [key,title,description] of categories)action(title,description,()=>open(key));return;
 }
 body.append(button('Tous les paramètres',()=>open('home'),'link'),el('p',category?.[2]||'', 'dialog-intro'));
 if(section==='profile'){
  const address=field('Mon adresse PolyTalk','text',messenger.session.userId);address.input.readOnly=true;body.append(address.wrapper,el('p','Partagez cette adresse pour recevoir une invitation. Le nom ci-dessous sert seulement à vous afficher dans PolyTalk.'));
  const name=field('Nom affiché','text',messenger.profile.name);name.input.maxLength=80;body.append(name.wrapper,button('Enregistrer mon nom',async()=>{check();const result=await messenger.api('/me','PUT',{name:name.input.value,kind:messenger.profile.kind});check();messenger.profile=result;render();notice('Nom enregistré.');},'primary'));return;
 }
 if(section==='privacy'){
  body.append(el('p','Chargement de vos règles…'));await messenger.refreshPolicy();check();body.lastChild?.remove();
  body.append(el('p','Un compte bloqué ne peut pas vous écrire, même s’il figure aussi dans les comptes autorisés. Dans un groupe, une règle de refus peut empêcher la livraison à tout le groupe.'));
  const label=el('label','Qui peut m’envoyer un message ?'),mode=el('select');for(const [value,title]of [['open','Tout le monde, sauf les comptes bloqués'],['allowlist','Uniquement les comptes que j’autorise']]){const item=el('option',title);item.value=value;mode.append(item);}mode.value=messenger.policy.mode;label.append(mode);body.append(label,button('Enregistrer qui peut m’écrire',async()=>{check();const result=await messenger.api('/policy','PUT',{mode:mode.value});check();messenger.policy=result;render();notice('Règle de réception enregistrée.');},'primary'));
  body.append(el('h3','Comptes bloqués ou autorisés'));
  if(!messenger.policy.rules.length)body.append(el('p','Aucune exception enregistrée.'));
  for(const rule of messenger.policy.rules){const row=el('div',undefined,'rule');row.append(el('span',(rule.action==='block'?'Bloqué : ':'Autorisé : ')+rule.target),button('Retirer cette règle',async()=>{check();const result=await messenger.api('/policy/rules','POST',{target:rule.target,action:'remove'});check();messenger.policy=result;render();return open('privacy');}));body.append(row);}
  const target=field('Adresse du compte concerné');target.input.placeholder='@contact:serveur';body.append(target.wrapper);
  for(const [value,title]of [['allow','Autoriser ce compte'],['block','Bloquer ce compte']])body.append(button(title,async()=>{check();const result=await messenger.api('/policy/rules','POST',{target:target.input.value.trim(),action:value});check();messenger.policy=result;render();return open('privacy');}));return;
 }
 if(section==='notifications'){
  body.append(el('p','Les notifications indiquent qu’un message vous attend, sans montrer son contenu. Le navigateur peut demander votre permission. Ce choix s’applique à la session ouverte ; les invitations restent toujours consultables dans la messagerie.'));
  body.append(el('p',actions.getNotify()?'Notifications actuellement activées pour cette session.':'Notifications actuellement désactivées pour cette session.'),button(actions.getNotify()?'Désactiver les notifications':'Activer les notifications sur cet appareil',async()=>{check();await actions.toggleNotify(check);check();return open('notifications');},'primary'));return;
 }
 if(section==='security'){
  body.append(el('p','Sur cet onglet, votre session peut reprendre automatiquement après actualisation pendant 12 heures. « Verrouiller l’application » retire cet accès local. Une personne ayant accès à l’onglet ouvert peut utiliser votre session.'));
  body.append(el('p','Vous pouvez garder la connexion par identifiant et mot de passe. Les moyens ci-dessous sont des options ; un facteur déjà activé sera demandé lors des opérations protégées.'));
  action('Configurer la validation en deux étapes','Ajouter une application de codes temporaires et conserver vos codes de secours.',actions.security);
  action('Gérer mes clés d’accès','Utiliser l’empreinte, le visage ou une clé de sécurité USB/NFC compatible.',actions.passkeys);
  action('Déverrouiller plus facilement cet appareil','Choisir une clé d’accès pour ouvrir le coffre local, si le navigateur le permet.',actions.localUnlock);
  if(config.walletEnabled)action('Gérer mes wallets de connexion','Associer un portefeuille compatible à ce compte. Aucune transaction financière.',actions.wallets);
  if(messenger.session.localIdentity)action('Sauvegarder mon identité locale','Retrouver le fichier de connexion et son code. Ce fichier ne sauvegarde pas les conversations.',actions.identity);
  body.append(el('p','Pour retirer un autre appareil, ouvrez « Mes appareils » dans les paramètres.'));return;
 }
 if(section==='recovery'){
  action('Sauvegarder ou restaurer mes conversations','Activer une sauvegarde facultative des clés ou restaurer un historique sur cet appareil.',actions.backup);
  body.append(el('p','Conservez votre code ou votre phrase de récupération séparément de l’appareil. La restauration dépend des clés sauvegardées et des messages encore disponibles.'));
  const advanced=el('details',undefined,'advanced-options');advanced.append(el('summary','Fichier de sauvegarde manuel (avancé)'),el('p','Exporter ou importer les clés de conversations dans un fichier protégé. La phrase ci-dessous protège ce fichier ; elle ne modifie pas votre mot de passe de compte.'));
  const pass=field('Phrase pour protéger ou ouvrir ce fichier (12 caractères minimum)','password');pass.input.minLength=12;pass.input.autocomplete='off';advanced.append(pass.wrapper,button('Télécharger mes clés de conversations',async()=>{check();const armored=await messenger.exportKeys(pass.input.value);check();download(new Blob([armored],{type:'text/plain'}),'polytalk-cles-protegees.txt');pass.input.value='';notice('Fichier protégé téléchargé.');}));
  const file=field('Fichier protégé à restaurer','file');file.input.accept='.txt';advanced.append(file.wrapper,button('Restaurer les clés de ce fichier',async()=>{check();const selected=file.input.files?.[0];if(!selected)throw Error('Choisissez le fichier protégé.');if(selected.size>32*1024*1024)throw Error('Fichier trop volumineux.');const text=await selected.text();check();await messenger.importKeys(text,pass.input.value);check();pass.input.value='';render();notice('Clés restaurées. Les messages disponibles vont être déchiffrés.');}));body.append(advanced);
  const clear=()=>{pass.input.value='';file.input.value='';};const modal=body.closest('dialog');modal.addEventListener('close',clear,{once:true});modal.addEventListener('viewchange',clear,{once:true});return;
 }
 if(section==='devices'){
  action('Consulter les appareils connectés','Voir vos sessions et retirer l’accès d’un autre appareil.',actions.sessions);
  const deviceList=el('div');action('Vérifier mes appareils','Comparer les éléments de sécurité pour confirmer qu’un appareil vous appartient.',()=>{deviceList.replaceChildren();return actions.devices(deviceList);});body.append(deviceList);
  const technical=el('details',undefined,'advanced-options');technical.append(el('summary','Informations techniques de cet appareil'),el('pre','Appareil : '+messenger.session.deviceId+'\nEmpreinte : '+messenger.session.fingerprint));body.append(technical,el('p','Pour vérifier un contact, ouvrez les informations de sa conversation. Retirer une session ne détruit pas les clés déjà copiées sur cet appareil.'));
 }
}
