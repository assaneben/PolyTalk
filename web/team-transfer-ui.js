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
import {parseTeam,exportTeam,prepareTeam,createTeam} from './team-transfer.js';
export function showTeamTransfer({messenger,origin,dialog,el,field,button,download,openRoom}){
 const generation=messenger.scope.generation,body=dialog('Partager une équipe d’agents'),modal=body.closest('dialog');let closed=false,ticket=0,creationStarted=false;
 const check=()=>{messenger.scope.assert(generation);if(closed||!body.isConnected||!modal.open)throw Error('Cette fenêtre est fermée.');};
 body.append(el('p','Un modèle d’équipe contient des noms et des adresses publiques d’agents. Il ne contient ni messages, ni clés, ni tâches, ni autorisations. Son origine n’est pas une signature : vérifiez toujours les destinataires. Les modèles v1 sont réutilisables sur cette installation uniquement.'));
 body.append(el('h3','Exporter des agents d’un canal rejoint'));
 const rooms=messenger.rooms().filter(room=>room.getMyMembership()==='join'),select=el('select'),name=field('Nom du modèle d’équipe');name.input.maxLength=100;select.setAttribute('aria-label','Canal à exporter');
 for(const room of rooms){const option=el('option',room.name||'Conversation privée');option.value=room.roomId;select.append(option);}select.value=rooms[0]?.roomId||'';
 const roster=el('div');let choices=[],nameEdited=false;name.input.oninput=()=>{nameEdited=true;};select.onchange=()=>{choices=[];roster.replaceChildren();};
 body.append(select,name.wrapper,button('Charger les agents du canal',async()=>{
  check();const id=select.value;if(!id)throw Error('Rejoignez un canal contenant des agents enregistrés.');
  const result=await messenger.api('/coordination/agents?roomId='+encodeURIComponent(id));check();if(select.value!==id)throw Error('Le canal sélectionné a changé. Rechargez ses agents.');
  roster.replaceChildren();choices=[];if(!nameEdited)name.input.value=rooms.find(room=>room.roomId===id)?.name||'Équipe';
  if(!result.agents.length){roster.append(el('p','Aucun agent enregistré accessible dans ce canal.'));return;}
  for(const agent of result.agents){const selected=field(agent.name+' · '+agent.mxid,'checkbox');selected.input.checked=true;choices.push({agent,input:selected.input});roster.append(selected.wrapper);}
 }),roster,button('Télécharger le modèle sélectionné',()=>{
  check();const agents=choices.filter(choice=>choice.input.checked).map(choice=>choice.agent),text=exportTeam({origin,name:name.input.value.trim(),agents});download(new Blob([text],{type:'application/json'}),'polytalk-equipe.json');
 }));
 body.append(el('h3','Importer un modèle et inviter ses agents'));
 const file=field('Fichier JSON d’équipe','file');file.input.accept='.json';const preview=el('section');body.append(file.wrapper);
 const invalidate=()=>{ticket++;preview.replaceChildren();};file.input.onchange=invalidate;
 const load=button('Vérifier et prévisualiser le fichier',async()=>{
  check();if(creationStarted)throw Error('Création déjà demandée. Vérifiez vos conversations avant un nouvel import.');const current=++ticket;preview.replaceChildren();const selected=file.input.files?.[0];if(!selected)throw Error('Choisissez un fichier d’équipe.');if(selected.size>65536)throw Error('Fichier trop volumineux (64 Kio maximum).');
  const template=parseTeam(await selected.text(),origin);check();if(current!==ticket)throw Error('Le fichier a changé.');
  const prepared=await prepareTeam({messenger,template,check:()=>{check();if(current!==ticket)throw Error('Le fichier a changé.');}});check();
  preview.append(el('h4',prepared.name),el('p','Les identités ont été retrouvées dans le registre. Les agents hors ligne peuvent être invités mais ne travailleront pas sans moteur connecté.'));
  for(const agent of prepared.agents)preview.append(el('p',agent.name+' · '+agent.mxid+' · '+(agent.status==='online'?'en ligne':'hors ligne')));
  preview.append(el('p','Un nouveau canal privé chiffré sera créé en mode manuel. Les agents doivent accepter leur invitation. Les règles de réponse, permissions et délégations du canal d’origine ne sont pas transférées.'));
  const consent=field('Je confirme les adresses affichées et souhaite les inviter','checkbox'),state={};preview.append(consent.wrapper);
  preview.append(button('Créer le canal chiffré et inviter',async()=>{
   const valid=()=>{check();if(current!==ticket)throw Error('Le fichier a changé. Refaites la vérification.');};valid();if(!consent.input.checked)throw Error('Vérifiez les destinataires et confirmez les invitations.');
   file.input.disabled=true;
   let roomId;try{const request=createTeam({messenger,prepared,state,check:valid});creationStarted=Boolean(state.started);roomId=await request;}finally{if(!state.started)file.input.disabled=false;}valid();
   preview.replaceChildren(el('p','Canal créé. Les invitations ont été demandées ; chaque agent doit les accepter. Le dépôt ne prouve pas l’exécution d’un agent.'),button('Ouvrir le nouveau canal',()=>{valid();modal.close();openRoom(roomId);}));
  },'primary'));
 });body.append(load,preview);
 const clean=()=>{if(closed)return;closed=true;ticket++;file.input.value='';name.input.value='';choices=[];preview.replaceChildren();roster.replaceChildren();body.replaceChildren();modal.removeEventListener('close',clean);modal.removeEventListener('viewchange',clean);messenger.removeEventListener('status',changed);};
 const changed=()=>{if(!messenger.scope.current(generation))clean();};modal.addEventListener('close',clean,{once:true});modal.addEventListener('viewchange',clean,{once:true});messenger.addEventListener('status',changed);
}
