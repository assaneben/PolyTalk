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
export function clearPrivateView(get){
 for(const id of ['messages','rooms','account','dialog-content','dialog-title','notice','dialog-notice','message-announcement'])get(id).replaceChildren();
 for(const id of ['message','file','search'])get(id).value='';
 get('auth-form').reset();get('dialog').close();get('notice').hidden=true;
 for(const id of ['composer','invitation','details'])get(id).hidden=true;
 get('room-name').textContent='Votre espace de conversation';
 get('room-description').textContent='Sélectionnez une conversation.';
 get('room-count').textContent='0';get('workspace').classList.remove('open-thread');
}

export function replaceDialogView(get,create,title){
 get('dialog').dispatchEvent?.(new Event('viewchange'));
 const feedback=get('dialog-notice');if(feedback){feedback.textContent='';feedback.hidden=true;}
 get('dialog-title').textContent=title;const view=create('div');get('dialog-content').replaceChildren(view);if(!get('dialog').open)get('dialog').showModal();get('dialog-title').setAttribute?.('tabindex','-1');get('dialog-title').focus?.({preventScroll:true});return view;
}
export function closeDialog(modal){if(!modal.open)return Promise.resolve();return new Promise(resolve=>{modal.addEventListener('close',resolve,{once:true});modal.close();});}
