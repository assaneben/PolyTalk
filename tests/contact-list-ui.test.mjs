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
import {showContactList} from '../web/contact-list-ui.js';
import {SessionScope} from '../web/session-scope.js';
function fixture(confirmRemove){
 const buttons=[],fields=[],scope=new SessionScope();scope.begin();let contacts=[{mxid:'@friend:remote',name:'Camille'}],writes=0,body;
 const node=()=>({isConnected:true,children:[],append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(){}});
 const messenger={scope,api:async(path,method,data)=>{if(method==='POST'){writes++;contacts=data.action==='remove'?[]:[{mxid:data.mxid,name:data.name}];return {};}return {contacts};},rooms:()=>[]};
 const options={messenger,dialog:()=>{if(body)body.isConnected=false;body=node();return body;},el:(tag,text)=>Object.assign(node(),{textContent:text}),field:(title,type,value='')=>{const input={value,focus(){}};fields.push(input);return {input,wrapper:node()};},button:(title,action)=>{buttons.push({title,action});return node();},getDialog:()=>({open:true}),openRoom(){},addContact(){},notice(){},confirmRemove};
 return {options,buttons,fields,writes:()=>writes,action:title=>buttons.findLast(button=>button.title===title).action};
}
test('contact removal requires confirmation and can be undone without changing conversations',async()=>{
 const cancelled=fixture(()=>false);await showContactList(cancelled.options);await cancelled.action('Retirer de mes contacts')();assert.equal(cancelled.writes(),0);
 const accepted=fixture(()=>true);await showContactList(accepted.options);await accepted.action('Retirer de mes contacts')();assert.equal(accepted.writes(),1);await accepted.action('Annuler le retrait')();assert.equal(accepted.writes(),2);
});
test('renaming persists the new name and returns to the list; empty names are refused',async()=>{
 const f=fixture(()=>true);await showContactList(f.options);await f.action('Renommer')();const name=f.fields.at(-1);name.value='';await assert.rejects(f.action('Enregistrer le nom')(),/nom/);assert.equal(f.writes(),0);name.value='Camille bureau';await f.action('Enregistrer le nom')();assert.equal(f.writes(),1);
});
