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
import {showMessageSearch} from '../web/message-search-ui.js';
import {SessionScope} from '../web/session-scope.js';
class Node extends EventTarget{constructor(tag,text){super();this.tag=tag;this.text=text;this.children=[];this.value='';this.isConnected=true;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(){}focus(){} }
function setup(){
 const scope=new SessionScope();scope.begin();const body=new Node('div'),modal=new EventTarget();modal.open=true;modal.close=()=>{modal.open=false;modal.dispatchEvent(new Event('close'));};
 const m=new EventTarget();m.scope=scope;let allowed=true;
 m.rooms=()=>[{roomId:'!a',name:'Équipe',getMyMembership:()=> 'join'}];m.messages=()=>allowed?[{getId:()=> '$a',getType:()=> 'm.room.message',getContent:()=>({msgtype:'m.text',body:'Une décision importante'}),getSender:()=> '@alice:local',getTs:()=>100}]:[];
 const nodes=[],buttons=[],opened=[];
 showMessageSearch({messenger:m,dialog:()=>body,el:(tag,text)=>{const n=new Node(tag,text);nodes.push(n);return n;},field:(label,type='text')=>{const input=new Node('input');input.type=type;nodes.push(input);return {input,wrapper:input};},button:(text,action)=>{const n={text,action};buttons.push(n);return n;},getDialog:()=>modal,openMessage:(...ids)=>opened.push(ids)});
 return {m,scope,body,modal,nodes,buttons,opened,deny:()=>allowed=false,submit:()=>nodes.find(n=>n.tag==='form').onsubmit({preventDefault(){}})};
}
test('message search displays bounded results and opens only a still-visible event',()=>{
 const f=setup(),query=f.nodes.find(n=>n.tag==='input');query.value='decision';f.submit();assert.ok(f.buttons.some(b=>b.text==='Ouvrir ce message'));
 f.buttons.find(b=>b.text==='Ouvrir ce message').action();assert.deepEqual(f.opened,[['!a','$a']]);assert.equal(query.value,'');
});
test('changed policy or locked session cannot open stale search results; close clears private text',()=>{
 const f=setup(),query=f.nodes.find(n=>n.tag==='input');query.value='decision';f.submit();const open=f.buttons.find(b=>b.text==='Ouvrir ce message');f.deny();assert.throws(()=>open.action(),/disponible/);assert.deepEqual(f.opened,[]);
 f.scope.begin();assert.throws(()=>open.action());f.modal.close();assert.equal(query.value,'');assert.equal(f.body.children.length,0);
});
test('empty query has an inline error and incoming changes invalidate displayed results',()=>{
 const f=setup();f.submit();assert.ok(f.nodes.some(n=>n.textContent?.includes('2 à 200')));
 f.nodes.find(n=>n.tag==='input').value='decision';f.submit();f.m.dispatchEvent(new Event('change'));assert.ok(f.nodes.some(n=>n.textContent?.includes('Relancez')));
});

test('opening a result focuses the exact event without interpreting its identifier as a selector',async()=>{
 const {revealSearchMessage}=await import('../web/message-search-ui.js');let focused=0,scrolled=0,highlighted='';
 const target={dataset:{eventId:'$odd"[]'},classList:{add:value=>highlighted=value},focus:()=>focused++,scrollIntoView:()=>scrolled++};
 assert.equal(revealSearchMessage({children:[{dataset:{}},target]},'$odd"[]'),true);assert.equal(focused,1);assert.equal(scrolled,1);assert.equal(highlighted,'search-match');
 assert.equal(revealSearchMessage({children:[target]},'$missing'),false);
});

test('search exposes a real submit control so Enter works with multiple fields',()=>{
 const f=setup();assert.equal(f.nodes.find(n=>n.tag==='button'&&n.text==='Rechercher')?.type,'submit');
});
