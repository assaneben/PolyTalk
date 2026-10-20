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
import {watchCoordination} from './coordination-stream.js';
const states={assigned:'Attribuée',running:'En cours',awaiting_approval:'En attente de validation',completed:'Terminée',failed:'Échouée',cancelled:'Annulée',expired:'Expirée'};
const kinds={'approval.requested':'Approbation demandée','approval.approved':'Approbation accordée','approval.rejected':'Approbation refusée','delegation.allow':'Délégation autorisée','delegation.ask':'Délégation soumise à approbation','delegation.never':'Délégation interdite'};
const statuses={connecting:'Connexion au suivi…',connected:'Suivi en direct connecté',retrying:'Connexion interrompue : nouvelle tentative automatique…',authentication:'Session refusée : reconnectez-vous pour reprendre le suivi.',failed:'Suivi indisponible après plusieurs tentatives. Vous pouvez le relancer.'};
export function showLiveCoordination({messenger,body,el,button,refresh,watch=watchCoordination}){
 const generation=messenger.scope.generation,modal=body.closest('dialog'),panel=el('section',undefined,'coordination-task');let stream=null,runId=0,disposed=false,events=[];
 const active=()=>!disposed&&messenger.scope.current(generation)&&body.isConnected&&modal?.open;
 const status=el('p'),list=el('ol');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 panel.append(el('h3','Activité des tâches en direct'),status,el('p','Les 25 derniers événements reçus sont affichés ici, sans lancer d’agent. Les formulaires et leurs versions restent inchangés : actualisez les tâches avant une action si leur état a changé.'),list);
 function pause(){runId++;stream?.stop();stream=null;if(active())status.textContent='Suivi en pause. Les derniers événements restent affichés.';}
 function paint(){list.replaceChildren();for(const event of events){const row=el('li',(kinds[event.type]||'État de tâche modifié')+' · '+states[event.state]+' · '+event.task_id+' · version '+event.version+' · '+new Date(event.created_at).toLocaleTimeString('fr-FR'));list.append(row);}}
 function start(){
  if(!active())return;pause();const id=++runId;
  stream=watch({scope:messenger.scope,token:messenger.session.accessToken,check:()=>{if(!active()||id!==runId)throw Error('Suivi fermé.');},onStatus:value=>{if(active()&&id===runId)status.textContent=statuses[value]||'Suivi indisponible.';},onEvent:event=>{if(!active()||id!==runId)return;events=[...events.filter(old=>old.sequence!==event.sequence),event].sort((a,b)=>b.sequence-a.sequence).slice(0,25);paint();}});
  stream.done.catch(()=>{if(active()&&id===runId)status.textContent=statuses.failed;});
 }
 function dispose(){if(disposed)return;pause();disposed=true;events=[];list.replaceChildren();panel.replaceChildren();modal.removeEventListener('close',dispose);modal.removeEventListener('viewchange',dispose);messenger.removeEventListener('status',changed);}
 const changed=()=>{if(!active())dispose();};
 panel.append(button('Mettre en pause',pause),button('Relancer le suivi',start),button('Actualiser les tâches',()=>{if(active()){dispose();return refresh();}}));body.append(panel);
 modal.addEventListener('close',dispose,{once:true});modal.addEventListener('viewchange',dispose,{once:true});messenger.addEventListener('status',changed);start();return dispose;
}
