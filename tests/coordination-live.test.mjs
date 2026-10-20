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
import {showLiveCoordination} from '../web/coordination-live.js';
import {SessionScope} from '../web/session-scope.js';
import {replaceDialogView} from '../web/private-view.js';
const item=n=>({sequence:n,task_id:'task-'+n,state:'running',version:2,type:'task.running',created_at:'2026-10-18T12:00:00.000Z'});
function setup(){const modal=new EventTarget();modal.open=true;const nodes=[],buttons=[],streams=[];let stopped=0;const el=(tag,text)=>{const node={tag,text,children:[],isConnected:true,append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},setAttribute(){}};nodes.push(node);return node;};const body=el('div');body.closest=()=>modal;const messenger=new EventTarget();messenger.scope=new SessionScope();messenger.scope.begin();messenger.session={accessToken:'private'};
 showLiveCoordination({messenger,body,el,button:(text,action)=>{const b={text,action};buttons.push(b);return b;},refresh(){},watch:options=>{streams.push(options);return {stop:()=>stopped++,done:Promise.resolve()};}});return {modal,messenger,body,nodes,buttons,streams,stopped:()=>stopped};}
test('live supervision bounds event history and ignores late callbacks after pause and close',()=>{
 const f=setup();for(let i=1;i<=30;i++)f.streams[0].onEvent(item(i));assert.equal(f.nodes.find(n=>n.tag==='ol').children.length,25);
 f.buttons.find(b=>b.text==='Mettre en pause').action();assert.equal(f.stopped(),1);f.streams[0].onEvent(item(31));assert.equal(f.nodes.find(n=>n.tag==='ol').children.length,25);
 f.modal.dispatchEvent(new Event('close'));assert.equal(f.nodes.find(n=>n.tag==='section').children.length,0);
});
test('replacement or lock closes live stream immediately and late events cannot reappear',()=>{
 const f=setup();f.modal.dispatchEvent(new Event('viewchange'));assert.equal(f.stopped(),1);f.streams[0].onEvent(item(1));assert.equal(f.nodes.find(n=>n.tag==='ol').children.length,0);
 const g=setup();g.messenger.scope.begin();g.messenger.dispatchEvent(new Event('status'));assert.equal(g.stopped(),1);
});
test('replacing a dialog announces the replacement before disconnecting its body',()=>{
 const modal=new EventTarget();modal.open=true;let announced=false,replaced=false;modal.addEventListener('viewchange',()=>{assert.equal(replaced,false);announced=true;});
 const get=id=>id==='dialog'?modal:id==='dialog-title'?{}:{replaceChildren(){replaced=true;}};
 replaceDialogView(get,()=>({}),'Next');assert.equal(announced,true);
});

test('approval and delegation activity must identify the event rather than only the task state',()=>{
 const f=setup();f.streams[0].onEvent({...item(1),type:'approval.requested'});
 assert.match(f.nodes.find(n=>n.tag==='ol').children[0].text,/Approbation demandée/);
});
