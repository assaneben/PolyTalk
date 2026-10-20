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
import {runButtonAction,returnHome} from '../web/ui-actions.js';
test('an action cannot execute twice while its previous request is pending',async()=>{
 const node={disabled:false,setAttribute(){},removeAttribute(){}},errors=[];let calls=0,resolve;
 const action=()=>{calls++;return new Promise(done=>resolve=done);};
 const first=runButtonAction(node,action,e=>errors.push(e));await runButtonAction(node,action,e=>errors.push(e));assert.equal(calls,1);assert.equal(node.disabled,true);resolve();await first;assert.equal(node.disabled,false);assert.equal(errors.length,0);
});
test('home closes the modal and clears filters and selection without navigating or locking',()=>{
 const calls=[];returnHome({close:()=>calls.push('close'),clearFilter:()=>calls.push('filter'),clearSelection:()=>calls.push('selection'),showList:()=>calls.push('list'),render:()=>calls.push('render')});assert.deepEqual(calls,['close','filter','selection','list','render']);
});
