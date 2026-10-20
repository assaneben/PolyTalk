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
import {showLiveCoordination} from './coordination-live.js';
const states={assigned:'Attribuée',running:'En cours',awaiting_approval:'En attente de validation',completed:'Terminée',failed:'Échouée',cancelled:'Annulée',expired:'Expirée'};
export async function showCoordination({messenger,roomId,dialog,el,field,button,notice,cursor=''}){
 const generation=messenger.scope.generation;
 const body=dialog('Coordination et agents');
 const current=()=>{messenger.scope.assert(generation);if(!body.isConnected||!body.closest('dialog')?.open)throw Error('Vue fermée.');};
 const permissions=await messenger.api('/coordination/permissions');current();
 body.append(el('p','Les tâches suivent un contrat explicite. Elles ne lancent pas automatiquement un agent et ne donnent aucun accès aux fichiers ou aux outils.'));
 if(roomId)body.append(button('Voir toutes mes tâches et révocations',()=>showCoordination({messenger,roomId:null,dialog,el,field,button,notice})));
 if(roomId){
  const endpoint='/coordination/channels/'+encodeURIComponent(roomId),config=await messenger.api(endpoint);current();
  body.append(el('h3','Réponses dans ce canal'),el('p','Mode actuel : '+({manual:'mentions explicites',principal:'agent principal',all:'tous les agents'}[config.mode])+'. Les destinataires sont vérifiés lors de chaque envoi.'));
  if(config.canConfigure){
   const mode=el('select');mode.setAttribute('aria-label','Mode de réponse du canal');
   for(const [value,title]of [['manual','Manuel — agents mentionnés'],['principal','Agent principal'],['all','Tous les agents']]){const option=el('option',title);option.value=value;mode.append(option);}mode.value=config.mode;
   const principal=field('UUID de l’agent principal');principal.input.value=config.principalId||'';
   body.append(mode,principal.wrapper,button('Enregistrer le mode du canal',async()=>{current();await messenger.api(endpoint,'PUT',{mode:mode.value,principalId:mode.value==='principal'?principal.input.value.trim():null,version:config.version});current();await showCoordination({messenger,roomId,dialog,el,field,button,notice});}));
  }
  const mentions=field('UUID des agents mentionnés (mode manuel, séparés par des virgules)'),message=field('Demande de collaboration chiffrée');message.input.maxLength=16000;
  let sending=false,messageId=crypto.randomUUID();
  body.append(mentions.wrapper,message.wrapper,button('Envoyer aux agents sélectionnés',async()=>{
   current();if(sending)return;sending=true;
   try{if(!message.input.value.trim())throw Error('Demande requise.');
    const selection=await messenger.api(endpoint+'/resolve','POST',{mentions:mentions.input.value.split(',').map(s=>s.trim()).filter(Boolean)});current();
    if(!selection.recipients.length)throw Error('Aucun agent destinataire disponible dans ce canal.');
    await messenger.sendText(roomId,JSON.stringify({schema:'polytalk.message.v1',id:messageId,type:'channel_request',conversation_id:roomId,sender_id:messenger.profile.id,recipient_ids:selection.recipients,channel_mode:selection.mode,channel_version:selection.version,content:{text:message.input.value}}));current();message.input.value='';messageId=crypto.randomUUID();notice('Demande chiffrée envoyée. Les moteurs connectés doivent traiter cet événement ; aucun programme n’est lancé automatiquement.');
   }finally{sending=false;}
  }));
 }
 if(messenger.profile.kind==='agent'){
  const provider=field('Application ou fournisseur déclaré'),capabilities=field('Capacités déclarées, séparées par des virgules');
  body.append(provider.wrapper,capabilities.wrapper,button('Enregistrer ma fiche agent',async()=>{current();await messenger.api('/coordination/agents/me','PUT',{provider:provider.input.value.trim(),capabilities:capabilities.input.value.split(',').map(s=>s.trim()).filter(Boolean),protocols:['web']});current();notice('Fiche déclarative enregistrée. Une connexion de moteur reste à qualifier.');}));
 }
 if(roomId&&permissions.operator){
  const roster=await messenger.api('/coordination/agents?roomId='+encodeURIComponent(roomId));current();
  body.append(el('h3','Agents enregistrés dans ce canal'));
  for(const agent of roster.agents)body.append(el('p',agent.name+' · '+agent.id+' · '+agent.status+' · capacités déclarées : '+agent.capabilities.join(', ')));
  body.append(el('h3','Attribuer une tâche dans le canal sélectionné'));
  const target=field('UUID de l’agent destinataire'),instructions=field('Consignes (envoyées chiffrées dans le canal)');
  instructions.input.maxLength=16000;let reference=null;const requestId=crypto.randomUUID();let busy=false;
  body.append(target.wrapper,instructions.wrapper,button('Envoyer les consignes et attribuer',async()=>{
   current();if(busy)return;busy=true;
   try{
    if(!reference){if(!instructions.input.value.trim())throw Error('Consignes requises.');const agent=await messenger.api('/coordination/agents/'+encodeURIComponent(target.input.value.trim()));current();
     const content={schema:'polytalk.message.v1',id:crypto.randomUUID(),type:'task_request',conversation_id:roomId,sender_id:messenger.profile.id,recipient_id:agent.id,correlation_id:requestId,content:{text:instructions.input.value}};
     const sent=await messenger.sendText(roomId,JSON.stringify(content));current();reference={eventId:sent.event_id,assigneeId:agent.id};target.input.disabled=true;instructions.input.disabled=true;
    }
    await messenger.api('/coordination/tasks','POST',{requestId,roomId,assigneeId:reference.assigneeId,instructionEventId:reference.eventId});current();notice('Tâche attribuée. Le destinataire doit accepter son exécution.');await showCoordination({messenger,roomId,dialog,el,field,button,notice});
   }finally{busy=false;}
  },'primary'));
 }else body.append(el('p',permissions.operator?'Sélectionnez un canal chiffré pour attribuer une tâche.':'La création des tâches racines est réservée aux comptes opérateurs configurés. Les agents utilisent une sous-tâche autorisée.'));
 const {tasks,next}=await messenger.api('/coordination/tasks'+(cursor?'?after='+encodeURIComponent(cursor):''));current();
 if(cursor)body.append(button('Revenir au début des tâches',()=>showCoordination({messenger,roomId,dialog,el,field,button,notice})));
 if(next)body.append(button('Page suivante des tâches',()=>showCoordination({messenger,roomId,dialog,el,field,button,notice,cursor:next})));
 const revocations=el('section');body.append(revocations);
 async function revocable(after=''){
  const page=await messenger.api('/coordination/revocable-tasks'+(after?'?after='+encodeURIComponent(after):''));current();
  for(const task of page.tasks.filter(task=>!tasks.some(visible=>visible.id===task.id))){
   const row=el('section',undefined,'coordination-task');row.append(el('strong','Contrat révocable : '+task.id),el('p','Le contenu de ce contrat n’est plus accessible. Vous pouvez encore l’annuler.'));
   row.append(button('Annuler ce contrat et ses sous-tâches',async()=>{current();if(!globalThis.confirm('Annuler ce contrat et ses sous-tâches ? Cette action ne termine pas un processus distant.'))return;current();await messenger.api('/coordination/tasks/'+task.id,'PUT',{state:'cancelled',version:task.version});current();row.remove();notice('Contrat annulé. Cette action ne termine pas un processus distant.');}));revocations.append(row);
  }
  if(page.next){const more=button('Autres contrats révocables',async()=>{current();more.remove();await revocable(page.next);});revocations.append(more);}
 }
 await revocable();current();
 const pending=await messenger.api('/coordination/approvals');current();
 if(pending.approvals.length)body.append(el('h3','Approbations de délégation'));
 for(const approval of pending.approvals){
  const row=el('section',undefined,'coordination-task'),parent=tasks.find(t=>t.id===approval.parent_id)||{room_id:approval.room_id};if(roomId&&parent.room_id!==roomId)continue;
  row.append(el('strong','Délégation : '+approval.state),el('p','Agent cible : '+approval.assignee_id),el('p','Expiration : '+approval.expires_at),el('pre','Événement des consignes : '+approval.instruction_event_id));
  const event=messenger.client.getRoom(parent.room_id)?.getLiveTimeline().getEvents().find(e=>e.getId()===approval.instruction_event_id);
  if(event){await messenger.client.decryptEventIfNeeded(event);current();const content=event.getContent();if(typeof content.body==='string')row.append(el('pre',content.body));}
  else row.append(el('p','Consignes absentes du cache : consultez le canal avant de décider.'));
  if(permissions.operator&&approval.controller_id===messenger.profile.id&&approval.state==='pending')for(const [state,title]of [['approved','Approuver cette délégation'],['rejected','Refuser']])row.append(button(title,async()=>{current();await messenger.api('/coordination/approvals/'+approval.id,'PUT',{state});current();await showCoordination({messenger,roomId,dialog,el,field,button,notice});}));
  if(approval.requester_id===messenger.profile.id&&approval.state==='approved'&&approval.contract)row.append(button('Créer la sous-tâche approuvée',async()=>{current();await messenger.api('/coordination/tasks','POST',{...JSON.parse(approval.contract),approvalId:approval.id});current();await showCoordination({messenger,roomId,dialog,el,field,button,notice});}));
  body.append(row);
 }
 body.append(el('h3','Supervision de mes tâches'),el('p','Le suivi en direct est affiché en bas de cette vue. Actualisez les cartes avant une action si leur état a changé. Une validation autorise la reprise de cette tâche uniquement, jamais une opération sensible sur un outil.'));
 for(const task of tasks){
  const card=el('section',undefined,'coordination-task');card.append(el('strong',states[task.state]||task.state),el('p',task.id),el('p','Canal : '+task.room_id));
  if(task.parent_id)card.append(el('p','Sous-tâche de '+task.parent_id+' · profondeur '+task.depth));
  if(permissions.operator&&task.controller_id===messenger.profile.id&&!task.parent_id&&!['completed','failed','cancelled','expired'].includes(task.state)){
   for(const [decision,title]of [['never','Interdire la délégation'],['ask','Exiger une approbation par délégation'],['allow','Autoriser dans les limites 2 / 8']])card.append(button(title,async()=>{current();await messenger.api('/coordination/tasks/'+task.id+'/delegation','PUT',{decision,maxDepth:2,maxTasks:8});current();notice('Politique enregistrée pour cette tâche racine.');}));
  }
  if(task.assignee_id===messenger.profile.id&&task.state==='running'&&messenger.profile.kind==='agent')card.append(button('Déléguer une sous-tâche',async()=>{
   current();const policy=await messenger.api('/coordination/tasks/'+task.id+'/delegation');current();if(policy.decision==='never')throw Error('Délégation interdite pour cette tâche.');
   const panel=dialog('Déléguer une sous-tâche'),target=field('UUID de l’agent cible'),instructions=field('Consignes chiffrées');instructions.input.maxLength=16000;panel.append(target.wrapper,instructions.wrapper,el('p','La sous-tâche reste dans ce canal. Profondeur, budget, cycles et règles de réception sont contrôlés par le serveur.'));
   let busy=false,contract=null;const requestId=crypto.randomUUID();panel.append(button(policy.decision==='ask'?'Transmettre pour approbation':'Attribuer dans les limites autorisées',async()=>{
    messenger.scope.assert(generation);if(busy)return;busy=true;try{
     if(!contract){if(!instructions.input.value.trim())throw Error('Consignes requises.');const agent=await messenger.api('/coordination/agents/'+encodeURIComponent(target.input.value.trim()));messenger.scope.assert(generation);const sent=await messenger.sendText(task.room_id,JSON.stringify({schema:'polytalk.message.v1',id:crypto.randomUUID(),type:'task_request',correlation_id:requestId,content:{text:instructions.input.value}}));messenger.scope.assert(generation);contract={requestId,parentId:task.id,roomId:task.room_id,assigneeId:agent.id,instructionEventId:sent.event_id};target.input.disabled=true;instructions.input.disabled=true;}
     await messenger.api(policy.decision==='ask'?'/coordination/approvals':'/coordination/tasks','POST',contract);messenger.scope.assert(generation);await showCoordination({messenger,roomId,dialog,el,field,button,notice});
    }finally{busy=false;}
   },'primary'));
  }));
  const options=[];if(task.assignee_id===messenger.profile.id){if(task.state==='assigned')options.push(['running','Accepter et démarrer']);if(task.state==='running')options.push(['completed','Terminer avec un résultat chiffré'],['failed','Signaler un échec'],['awaiting_approval','Demander une validation']);}
  if(task.owner_id===messenger.profile.id||task.controller_id===messenger.profile.id){if(task.state==='awaiting_approval')options.push(['assigned','Valider la reprise']);if(!['completed','failed','cancelled','expired'].includes(task.state))options.push(['cancelled','Annuler']);}
  for(const [state,label]of options)card.append(button(label,async()=>{
   current();if(state==='cancelled'&&!globalThis.confirm('Annuler cette tâche et ses sous-tâches ?'))return;current();const update={state,version:task.version};if(state==='completed'){
    const result=field('Résultat à envoyer chiffré');const panel=dialog('Résultat de la tâche');let resultEvent=null,resultBusy=false;
    panel.append(result.wrapper,button('Envoyer et terminer',async()=>{
     messenger.scope.assert(generation);if(resultBusy)return;resultBusy=true;
     try{if(!resultEvent){if(!result.input.value.trim())throw Error('Résultat requis.');const sent=await messenger.sendText(task.room_id,JSON.stringify({schema:'polytalk.message.v1',id:crypto.randomUUID(),type:'task_result',correlation_id:task.id,content:{text:result.input.value}}));messenger.scope.assert(generation);resultEvent=sent.event_id;result.input.disabled=true;}
      await messenger.api('/coordination/tasks/'+task.id,'PUT',{...update,resultEventId:resultEvent});messenger.scope.assert(generation);await showCoordination({messenger,roomId,dialog,el,field,button,notice});
     }finally{resultBusy=false;}
    }));return;
   }
   await messenger.api('/coordination/tasks/'+task.id,'PUT',update);current();await showCoordination({messenger,roomId,dialog,el,field,button,notice});
  }));body.append(card);
 }
 if(!tasks.length)body.append(el('p','Aucune tâche accessible.'));
 current();showLiveCoordination({messenger,body,el,button,refresh:()=>showCoordination({messenger,roomId,dialog,el,field,button,notice})});
 body.append(button('Actualiser',()=>showCoordination({messenger,roomId,dialog,el,field,button,notice})));
}
