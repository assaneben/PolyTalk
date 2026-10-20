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
import {showTeamTransfer} from '../web/team-transfer-ui.js';
import {SessionScope} from '../web/session-scope.js';
const agent={id:'11111111-1111-4111-8111-111111111111',mxid:'@agent:localhost',name:'Agent'};
function setup({rooms=[],api=async()=>agent,create=async()=> '!new'}={}){const nodes=[],buttons=[],downloads=[],modal=new EventTarget();modal.open=true;const el=(tag,text)=>{const n={tag,text,children:[],isConnected:true,value:'',append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},setAttribute(){}};nodes.push(n);return n;};const body=el('div');body.closest=()=>modal;const scope=new SessionScope();scope.begin();let creates=0;const m=Object.assign(new EventTarget(),{scope,session:{userId:'@me:localhost'},rooms:()=>rooms,api,createConversation:async()=>{creates++;return create();}});
 showTeamTransfer({messenger:m,origin:'http://localhost:3210',dialog:()=>body,el,field:(label,type='text')=>{const input=el('input',label);input.type=type;return {input,wrapper:input};},button:(text,action)=>{const b={text,action};buttons.push(b);return b;},download:(blob,name)=>downloads.push({blob,name}),openRoom(){}});
 const file=nodes.find(n=>n.type==='file');file.files=[{size:300,text:async()=>JSON.stringify({schema:'polytalk.team.v1',origin:'http://localhost:3210',name:'Équipe',agents:[agent]})}];return {nodes,buttons,modal,file,scope,m,downloads,creates:()=>creates};}
test('team import requires preview and explicit consent before inviting',async()=>{
 const f=setup();assert.equal(f.buttons.some(b=>b.text==='Créer le canal chiffré et inviter'),false);
 await f.buttons.find(b=>b.text==='Vérifier et prévisualiser le fichier').action();assert.equal(f.creates(),0);
 const create=f.buttons.find(b=>b.text==='Créer le canal chiffré et inviter');await assert.rejects(create.action(),/confirmez/);assert.equal(f.creates(),0);
 f.nodes.find(n=>n.type==='checkbox').checked=true;await create.action();assert.equal(f.creates(),1);
});
test('changing file or closing dialog invalidates an old import confirmation',async()=>{
 const f=setup();await f.buttons.find(b=>b.text==='Vérifier et prévisualiser le fichier').action();f.nodes.find(n=>n.type==='checkbox').checked=true;
 const create=f.buttons.find(b=>b.text==='Créer le canal chiffré et inviter');f.file.onchange();await assert.rejects(create.action(),/fichier/);assert.equal(f.creates(),0);
 f.modal.dispatchEvent(new Event('close'));assert.equal(f.file.value,'');await assert.rejects(create.action());
});

test('an import view cannot prepare a second invitation batch after creation was requested',async()=>{
 const f=setup(),load=f.buttons.find(b=>b.text==='Vérifier et prévisualiser le fichier');await load.action();f.nodes.find(n=>n.type==='checkbox').checked=true;
 await f.buttons.find(b=>b.text==='Créer le canal chiffré et inviter').action();await assert.rejects(load.action(),/déjà/);assert.equal(f.creates(),1);
});

const joined={roomId:'!team',name:'Nom du canal',getMyMembership:()=> 'join'};
test('export preserves a name typed while the registered roster is loading',async()=>{
 let complete;const f=setup({rooms:[joined],api:()=>new Promise(resolve=>complete=resolve)});
 const load=f.buttons.find(b=>b.text==='Charger les agents du canal').action(),name=f.nodes.find(n=>n.text==='Nom du modèle d’équipe');name.value='Mon équipe personnalisée';name.oninput?.();complete({agents:[agent]});await load;
 assert.equal(name.value,'Mon équipe personnalisée');
});
test('changing account during registry lookup cannot reveal an import preview',async()=>{
 let complete;const f=setup({api:()=>new Promise(resolve=>complete=resolve)}),load=f.buttons.find(b=>b.text==='Vérifier et prévisualiser le fichier').action();
 await new Promise(resolve=>setImmediate(resolve));f.scope.begin();f.m.dispatchEvent(new Event('status'));complete(agent);await assert.rejects(load);assert.equal(f.buttons.some(b=>b.text==='Créer le canal chiffré et inviter'),false);assert.equal(f.creates(),0);
});
test('an uncertain create error cannot issue another invitation batch from either button',async()=>{
 const f=setup({create:async()=>{throw Error('network failure');}}),load=f.buttons.find(b=>b.text==='Vérifier et prévisualiser le fichier');await load.action();f.nodes.find(n=>n.type==='checkbox').checked=true;
 const create=f.buttons.find(b=>b.text==='Créer le canal chiffré et inviter');await assert.rejects(create.action(),/Vérifiez/);await assert.rejects(create.action(),/déjà/);await assert.rejects(load.action(),/déjà/);assert.equal(f.creates(),1);
});
test('export downloads only selected public roster entries and a closed template format',async()=>{
 const second={...agent,id:'22222222-2222-4222-8222-222222222222',mxid:'@second:localhost',name:'Second',accessToken:'must-not-export'};
 const f=setup({rooms:[joined],api:async()=>({agents:[agent,second]})});await f.buttons.find(b=>b.text==='Charger les agents du canal').action();
 f.nodes.filter(n=>n.type==='checkbox')[0].checked=false;await f.buttons.find(b=>b.text==='Télécharger le modèle sélectionné').action();
 const text=await f.downloads[0].blob.text(),file=JSON.parse(text);assert.equal(file.name,'Nom du canal');assert.deepEqual(file.agents,[{id:second.id,mxid:second.mxid,name:second.name}]);assert.equal(text.includes('must-not-export'),false);
});
