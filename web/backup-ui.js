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
import {generateProtectionPhrase} from './passphrase-generator.js';
import {saveRecoveryPhrase,readRecoveryPhrase} from './recovery-phrase.js';
import {AutomaticBackup} from './automatic-backup.js';

export async function showBackup({messenger,dialog,el,button,field,download,notice}){
 const generation=messenger.scope.generation,client=messenger.client;
 const backup=new AutomaticBackup({client,scope:messenger.scope});
 const body=dialog('Sauvegarde automatique · facultative');
 const current=()=>{messenger.scope.assert(generation);if(!body.isConnected||!document.getElementById('dialog').open)throw Error('Cette vue est fermée. Rouvrez les réglages.');};
 body.append(el('p','La sauvegarde automatique n’est pas activée par ce bouton. Choisissez explicitement de l’activer ou de restaurer une sauvegarde existante.'),el('p','Les clés sont chiffrées sur cet appareil avant leur envoi à votre serveur Matrix. Cela ne connecte ni iCloud ni Google Drive. Le code ou votre phrase de restauration facultative permettent de retrouver les clés sur un autre appareil après connexion. Ils ne remplacent pas votre identifiant et votre mot de passe.'));
 const status=await backup.status();current();
 body.append(el('p',status.exists?(status.active?'Sauvegarde active pour cet appareil. Les nouveaux secrets de messages sont sauvegardés automatiquement par le SDK.':'Une sauvegarde existe. Saisissez son code pour la rendre utilisable sur cet appareil.'):'Aucune sauvegarde de clés sur ce serveur. Vous pouvez garder uniquement vos exports manuels.'));
 const phraseControls=(view)=>{
  const phrase=field('Phrase de restauration facultative','password'),confirmation=field('Confirmer la phrase de restauration','password');
  for(const input of [phrase.input,confirmation.input]){input.autocomplete='off';input.spellcheck=false;input.maxLength=4096;}
  const hint=el('p','Choisissez une phrase longue et unique, ou générez une proposition modifiable. Elle ne sera pas envoyée en clair au serveur. Conservez aussi le code de récupération.','hint');hint.setAttribute('role','status');
  const generate=button('Proposer une phrase aléatoire',()=>{phrase.input.value=generateProtectionPhrase();phrase.input.type='text';confirmation.input.value='';generate.textContent='Générer une autre phrase';hint.textContent='Proposition modifiable : conservez votre version finale et recopiez-la dans la confirmation.';phrase.input.focus();});
  view.append(phrase.wrapper,generate,confirmation.wrapper,hint);
  document.getElementById('dialog').addEventListener('close',()=>{phrase.input.value='';confirmation.input.value='';},{once:true});
  return ()=>{const value=phrase.input.value;if(!value&&!confirmation.input.value)return null;if(value.length<12||value!==confirmation.input.value)throw Error('La phrase doit contenir au moins 12 caractères et sa confirmation doit correspondre.');return value;};
 };
 if(!status.exists)body.append(button('Préparer mon code de récupération',async()=>{
  current();const key=backup.prepare();
  const view=dialog('Conserver votre code de récupération');
  const code=field('Code personnel de récupération','text',key);code.input.readOnly=true;code.input.autocomplete='off';code.input.spellcheck=false;
  view.append(el('p','La sauvegarde n’est pas encore activée. Conservez d’abord ce code sur papier ou dans un gestionnaire de mots de passe, puis confirmez ci-dessous. Il ne sera pas affiché à nouveau dans ce parcours. Toute personne qui le possède et accède à votre sauvegarde pourrait déchiffrer les clés.'),code.wrapper);
  const chosenPhrase=phraseControls(view);
  const clear=()=>{code.input.value='';};
  document.getElementById('dialog').addEventListener('close',clear,{once:true});
  view.append(button('Enregistrer mon code dans un fichier',()=>{
   messenger.scope.assert(generation);if(!view.isConnected||!code.input.value)throw Error('Le code n’est plus affiché.');
   download(new Blob(['PolyTalk — code personnel de récupération Matrix\nCompte : '+messenger.session.userId+'\n\n'+code.input.value+'\n\nConservez ce fichier dans un emplacement privé. Ce fichier contient un secret, pas les messages.\n'],{type:'text/plain;charset=utf-8'}),'polytalk-code-recuperation.txt');
  }),button('J’ai conservé mon code · activer la sauvegarde',async()=>{
   messenger.scope.assert(generation);if(!view.isConnected||!document.getElementById('dialog').open||!code.input.value)throw Error('Rouvrez les réglages.');
   const phrase=chosenPhrase();await backup.activate(code.input.value);messenger.scope.assert(generation);
   if(phrase){const active=await backup.status();messenger.scope.assert(generation);if(!view.isConnected||!document.getElementById('dialog').open)throw Error('Rouvrez les réglages pour enregistrer votre phrase. Le code conservé permet de restaurer la sauvegarde.');await saveRecoveryPhrase({client,scope:messenger.scope,phrase,code:code.input.value,version:active.version});}clear();
   if(view.isConnected&&document.getElementById('dialog').open){document.getElementById('dialog').close();notice('Sauvegarde activée. La copie des clés se poursuit avec la synchronisation.');}
  },'primary'));
 },'primary'));
 if(status.exists){
  body.append(button('Changer le code de récupération',()=>{
   current();const next=backup.prepare(),view=dialog('Changer le code de récupération'),code=field('Nouveau code de récupération','text',next);code.input.readOnly=true;code.input.autocomplete='off';
   view.append(el('p','Conservez ce nouveau code avant de continuer. Les clés disponibles dans la sauvegarde actuelle seront d’abord restaurées ici, puis copiées vers une nouvelle sauvegarde. La copie peut prendre du temps. Les autres appareils devront recevoir le nouveau code pour utiliser cette nouvelle sauvegarde.'),el('p','L’ancienne version est conservée pour éviter de perdre un historique avant la fin de la copie. Son ancien code reste utilisable avec cette version ; ce changement ne retire pas les clés déjà obtenues par un appareil. Votre phrase de restauration devra être enregistrée à nouveau pour la nouvelle version.'),code.wrapper);
   const clear=()=>{code.input.value='';};document.getElementById('dialog').addEventListener('close',clear,{once:true});document.getElementById('dialog').addEventListener('viewchange',clear,{once:true});
   view.append(button('Enregistrer le nouveau code dans un fichier',()=>{messenger.scope.assert(generation);if(!view.isConnected||!code.input.value)throw Error('Rouvrez les réglages.');download(new Blob(['PolyTalk — nouveau code de récupération Matrix\n'+code.input.value+'\nConservez aussi l’ancien code tant que la copie des clés n’est pas terminée.\n'],{type:'text/plain;charset=utf-8'}),'polytalk-nouveau-code-recuperation.txt');}),button('J’ai conservé le nouveau code · changer',async()=>{
    messenger.scope.assert(generation);if(!view.isConnected||!document.getElementById('dialog').open||!code.input.value)throw Error('Rouvrez les réglages.');
    await backup.rotate(code.input.value,status.version);messenger.scope.assert(generation);clear();
    if(view.isConnected&&document.getElementById('dialog').open){document.getElementById('dialog').close();notice('Nouveau code activé. La copie des clés continue pendant la synchronisation. Enregistrez à nouveau votre phrase facultative.');}
   },'primary'));
  }));
  body.append(button('Supprimer uniquement la version actuelle',async()=>{
   current();if(!globalThis.confirm('Supprimer la sauvegarde actuelle du serveur ? Sans export ni autre appareil, son historique pourrait devenir irrécupérable. Les anciennes versions et les clés déjà présentes sur vos appareils ne seront pas effacées.'))return;
   current();const result=await backup.stop(status.version);current();document.getElementById('dialog').close();notice(result.stopped?'Sauvegarde actuelle supprimée. Aucune clé locale effacée.':'Version supprimée ; une autre sauvegarde existe. Rouvrez les réglages pour vérifier son état.');
  }));
  body.append(button('Arrêter la sauvegarde et supprimer toutes ses versions',async()=>{
   current();if(!globalThis.confirm('Arrêter la sauvegarde automatique et supprimer ses versions conservées sur ce serveur ? Sans export ni autre appareil, l’historique pourrait devenir irrécupérable. Cette suppression est irréversible. Les clés déjà présentes sur vos appareils ne seront pas effacées.'))return;
   current();const result=await backup.stopAll(status.version);current();document.getElementById('dialog').close();notice(result.stopped?'Sauvegarde arrêtée : toutes les versions trouvées ont été supprimées. Aucune clé locale effacée.':'Certaines versions ont été supprimées, mais une sauvegarde reste présente. Rouvrez les réglages avant de continuer.');
  }));
  const phrase=field('Votre phrase de restauration (si vous en avez enregistré une)','password');phrase.input.autocomplete='off';phrase.input.maxLength=4096;body.append(phrase.wrapper);
  document.getElementById('dialog').addEventListener('close',()=>{phrase.input.value='';},{once:true});
  body.append(button('Restaurer avec ma phrase',async()=>{current();const value=phrase.input.value;phrase.input.value='';const recovered=await readRecoveryPhrase({client,scope:messenger.scope,phrase:value,version:status.version});current();const result=await backup.restore(recovered);current();notice('Restauration terminée : '+result.imported+' clés importées sur '+result.total+'.');}));
  const code=field('Code de récupération de cette sauvegarde','password');code.input.autocomplete='off';code.input.maxLength=256;body.append(code.wrapper);
  body.append(button('Restaurer mes clés et activer sur cet appareil',async()=>{
   current();const value=code.input.value;code.input.value='';const result=await backup.restore(value);current();
   notice('Restauration terminée : '+result.imported+' clés importées sur '+result.total+'. Les messages encore disponibles pourront être déchiffrés.');
  }));
  const details=el('details');details.append(el('summary','Ajouter ou modifier ma phrase de restauration (facultatif)'));body.append(details);const chosenPhrase=phraseControls(details);
  details.append(button('Enregistrer ma phrase avec mon code de récupération',async()=>{current();const phrase=chosenPhrase();if(!phrase)throw Error('Saisissez une phrase de restauration.');const value=code.input.value;code.input.value='';await backup.restore(value);current();await saveRecoveryPhrase({client,scope:messenger.scope,phrase,code:value,version:status.version});current();document.getElementById('dialog').close();notice('Phrase de restauration enregistrée. Conservez-la en lieu sûr.');}));
 }
 body.append(el('p','Les appareils ayant déjà reçu des clés conservent leurs copies. La suppression de la version actuelle est irréversible ; les anciennes versions éventuellement conservées nécessitent leur propre code.','hint'));
}
