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
import {searchMessages} from './message-search.js';
export function showMessageSearch({messenger,dialog,el,field,button,getDialog,openMessage}){
 const generation=messenger.scope.generation,body=dialog('Rechercher dans les messages');
 const check=()=>{messenger.scope.assert(generation);if(!body.isConnected||!getDialog().open)throw Error('Cette recherche est fermée.');};
 body.append(el('p','Recherche locale dans les messages déjà chargés et déchiffrés des salons rejoints. Le texte recherché reste sur cet appareil. Les messages plus anciens non chargés et les messages sans clés ne sont pas inclus.'));
 const form=el('form'),query=field('Texte à rechercher','search'),sender=field('Adresse de l’expéditeur (facultatif)'),room=el('select');
 query.input.maxLength=200;query.input.autocomplete='off';query.input.minLength=2;sender.input.maxLength=255;sender.input.autocomplete='off';
 const all=el('option','Toutes les conversations rejointes');all.value='';room.append(all);
 for(const item of messenger.rooms().filter(r=>r.getMyMembership()==='join')){const option=el('option',item.name||'Conversation privée');option.value=item.roomId;room.append(option);}
 const label=el('label','Conversation');label.append(room);form.append(query.wrapper,sender.wrapper,label);
 const status=el('p'),results=el('div');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 function filters(){return {query:query.input.value,roomId:room.value||'',sender:sender.input.value};}
 function search(){
  check();results.replaceChildren();
  try{
   const options=filters(),found=searchMessages(messenger,options);
   status.textContent=found.matches.length+' résultat(s) affiché(s), '+found.searchable+' message(s) lisible(s) examinés.'+(found.truncated?' Limite de 100 résultats atteinte : précisez la recherche.':'')+(found.scanLimited?' Limite de 20 000 événements atteinte : filtrez par conversation.':'');
   if(!found.matches.length)results.append(el('p','Aucun résultat dans les messages actuellement chargés. Essayez un autre texte ou restaurez vos clés si nécessaire.'));
   for(const match of found.matches){
    const row=el('section',undefined,'access-option');row.append(el('h3',match.roomName),el('p',match.sender+' · '+new Date(match.timestamp).toLocaleString('fr-FR')),el('p',match.snippet));
    row.append(button('Ouvrir ce message',()=>{
     check();const current=searchMessages(messenger,options).matches.find(item=>item.roomId===match.roomId&&item.eventId===match.eventId);
     if(!current)throw Error('Ce message n’est plus disponible dans les résultats autorisés. Relancez la recherche.');
     getDialog().close();openMessage(match.roomId,match.eventId);
    }));results.append(row);
   }
  }catch(error){status.textContent=error.message||'Recherche impossible.';}
 }
 form.onsubmit=event=>{event.preventDefault();search();};const submit=el('button','Rechercher','primary');submit.type='submit';form.append(submit);body.append(form,status,results);
 const invalidate=()=>{if(!messenger.scope.current(generation)||!body.isConnected||!getDialog().open){clean();return;}results.replaceChildren();status.textContent='Les messages ou les autorisations ont changé. Relancez la recherche.';};
 const clean=()=>{messenger.removeEventListener('change',invalidate);messenger.removeEventListener('status',invalidate);query.input.value='';sender.input.value='';results.replaceChildren();body.replaceChildren();};
 query.input.oninput=sender.input.oninput=room.onchange=()=>{results.replaceChildren();status.textContent='Relancez la recherche avec ces critères.';};
 messenger.addEventListener('change',invalidate);messenger.addEventListener('status',invalidate);getDialog().addEventListener('close',clean,{once:true});query.input.focus();
}
export function revealSearchMessage(container,eventId){
 const target=Array.from(container.children).find(node=>node.dataset?.eventId===eventId);if(!target)return false;
 target.classList.add('search-match');target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'center'});return true;
}
