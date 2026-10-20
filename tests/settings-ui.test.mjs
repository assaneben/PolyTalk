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
import {showHumanSettings} from '../web/settings-ui.js';
import {SessionScope} from '../web/session-scope.js';
function fixture(){let view;const nodes=[],buttons=[],calls=[],scope=new SessionScope();scope.begin();const modal=Object.assign(new EventTarget(),{open:true});const el=(tag,text)=>{const node={tag,text,children:[],isConnected:true,append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},setAttribute(){},closest:()=>modal};nodes.push(node);return node;};
 const messenger={scope,session:{userId:'@me:local',deviceId:'device',fingerprint:'fingerprint'},profile:{name:'Camille',kind:'human'},policy:{mode:'open',rules:[]},refreshPolicy:async()=>{},api:async(path,method,data)=>{calls.push({path,method,data});return path==='/me'?{name:data.name,kind:'human'}:{mode:data.mode||'open',rules:[]};}};
 const options={messenger,config:{},dialog:title=>{if(view)view.isConnected=false;view=el('div',title);return view;},el,field:(label,type='text',value='')=>{const input=el('input',label);input.type=type;input.value=value;return {input,wrapper:input};},button:(text,action)=>{const b={text,action};buttons.push(b);return b;},notice(){},download(){},render(){},actions:{getNotify:()=>false,backup(){calls.push('backup');},security(){calls.push('security');},devices(){calls.push('devices');}}};return {options,nodes,buttons,calls,scope,messenger,get view(){return view;}};}
test('human settings starts with six explained categories and no cryptographic input',async()=>{
 const f=fixture();await showHumanSettings(f.options);for(const label of ['Mon profil','Qui peut me contacter','Notifications','Connexion et sécurité','Sauvegarder mes conversations','Mes appareils'])assert.ok(f.buttons.some(b=>b.text===label),label);
 assert.equal(f.nodes.some(n=>n.type==='password'||n.type==='file'),false);assert.ok(f.nodes.some(n=>n.text?.includes('Choisissez')));
});
test('privacy is saved explicitly and category back navigation is available',async()=>{
 const f=fixture();await showHumanSettings({...f.options,section:'privacy'});assert.equal(f.calls.length,0);
 f.nodes.find(n=>n.tag==='select').value='allowlist';await f.buttons.find(b=>b.text==='Enregistrer qui peut m’écrire').action();assert.equal(f.calls[0].data.mode,'allowlist');assert.ok(f.buttons.some(b=>b.text==='Tous les paramètres'));
});
test('a closed category or switched account cannot submit stale settings',async()=>{
 const f=fixture();await showHumanSettings({...f.options,section:'profile'});const save=f.buttons.find(b=>b.text==='Enregistrer mon nom');f.scope.begin();await assert.rejects(save.action());assert.equal(f.calls.length,0);
});

test('recovery and notifications expose their working primary actions without opening advanced controls',async()=>{
 const f=fixture();await showHumanSettings({...f.options,section:'recovery'});await f.buttons.find(b=>b.text==='Sauvegarder ou restaurer mes conversations').action();assert.ok(f.calls.includes('backup'));assert.equal(f.nodes.find(n=>n.tag==='details').open,undefined);
 let toggles=0;f.options.actions.toggleNotify=async()=>toggles++;await showHumanSettings({...f.options,section:'notifications'});await f.buttons.find(b=>b.text==='Activer les notifications sur cet appareil').action();assert.equal(toggles,1);
});
test('device verification uses a dedicated list and replaces it on repeated requests',async()=>{
 const f=fixture(),parents=[];f.options.actions.devices=parent=>{parents.push(parent);parent.append({text:'Device'});};await showHumanSettings({...f.options,section:'devices'});
 const verify=f.buttons.find(b=>b.text==='Vérifier mes appareils');await verify.action();await verify.action();assert.notEqual(parents[0],f.view);assert.equal(parents[0],parents[1]);assert.equal(parents[0].children.length,1);
});
