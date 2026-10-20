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
import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionScope} from '../web/session-scope.js';
import {clearPrivateView,replaceDialogView,closeDialog} from '../web/private-view.js';
test('a response from a previous account cannot commit after lock or account change',async()=>{
 const scope=new SessionScope(),first=scope.begin();let resolve;const pending=new Promise(done=>resolve=done);let policy='new-account';
 const refresh=(async()=>{const result=await pending;scope.assert(first);policy=result;})();
 scope.begin();resolve('old-account');await assert.rejects(refresh,/Session/);assert.equal(policy,'new-account');
});
test('locking removes decrypted content, drafts and dialog inputs rather than only hiding them',()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'secret',value:'draft',hidden:false,replaceChildren(){this.textContent='';},reset(){this.value='';},close(){this.open=false;},classList:{remove(){}}});return nodes.get(id);};
 clearPrivateView(get);
 for(const id of ['messages','rooms','account','dialog-content','dialog-title','notice'])assert.equal(get(id).textContent,'');
 for(const id of ['message','file','search'])assert.equal(get(id).value,'');
 assert.equal(get('composer').hidden,true);assert.equal(get('details').hidden,true);
});


test('replacing a dialog detaches its previous private view before a delayed operation resumes',()=>{
 const container={children:[],replaceChildren(next){for(const child of this.children)child.isConnected=false;this.children=next?[next]:[];if(next)next.isConnected=true;}},modal={open:false,showModal(){this.open=true;}},title={};
 const get=id=>({'dialog-content':container,dialog:modal,'dialog-title':title}[id]);
 const first=replaceDialogView(get,()=>({}),'First');const second=replaceDialogView(get,()=>({}),'Second');
 assert.notEqual(first,second);assert.equal(first.isConnected,false);assert.equal(second.isConnected,true);assert.equal(title.textContent,'Second');
});

test('wallet modal replacement waits for the queued close event before opening the next step',async()=>{
 class Modal extends EventTarget{open=true;close(){this.open=false;setImmediate(()=>this.dispatchEvent(new Event('close')));}}
 const modal=new Modal();await closeDialog(modal);let aborted=false;modal.open=true;modal.addEventListener('close',()=>aborted=true,{once:true});await new Promise(done=>setImmediate(done));assert.equal(aborted,false);
});
