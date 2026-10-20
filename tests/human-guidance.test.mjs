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
import {showHumanHelp,humanHome} from '../web/human-guidance.js';
import {SessionScope} from '../web/session-scope.js';
test('human help and home expose working everyday actions, without forcing agent workflows',()=>{
 const buttons=[],calls=[],scope=new SessionScope();scope.begin();const el=(tag,text)=>({tag,text,isConnected:true,children:[],append(...items){this.children.push(...items);},closest:()=>({open:true})});
 const button=(text,action)=>{const b={text,action};buttons.push(b);return b;},actions={conversation:()=>calls.push('conversation'),contacts:()=>calls.push('contacts'),invitations:()=>calls.push('invitations'),share:()=>calls.push('share'),settings:()=>calls.push('settings')};
 humanHome({el,button,actions});buttons.find(b=>b.text==='Écrire un nouveau message').action();assert.deepEqual(calls,['conversation']);
 showHumanHelp({messenger:{scope},dialog:()=>el('div'),el,button,actions});buttons.find(b=>b.text==='Partager mon adresse').action();assert.equal(calls.at(-1),'share');
 scope.begin();assert.throws(()=>buttons.find(b=>b.text==='Partager mon adresse').action());
});
