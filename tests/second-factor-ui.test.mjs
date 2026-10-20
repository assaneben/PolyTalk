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
import {secondFactorUi} from '../web/security-ui.js';
import {SessionScope} from '../web/session-scope.js';
function fixture(){
 const modal=new EventTarget();modal.open=true;modal.close=()=>{modal.open=false;queueMicrotask(()=>modal.dispatchEvent(new Event('close')));};
 const nodes=[],body={isConnected:true,append(){}};const el=(tag,text)=>{const node={tag,text,value:'',setAttribute(){},focus(){}};nodes.push(node);return node;};
 const scope=new SessionScope();scope.begin();const calls=[];let resolve;
 const messenger={scope,api:async(path)=>{calls.push(path);if(path==='/auth/verify')return new Promise(done=>resolve=done);return {};}};
 const prompt=secondFactorUi({messenger,dialog:()=>body,el,field:()=>({wrapper:{},input:{value:'123456',focus(){}}}),getDialog:()=>modal});
 return {prompt,modal,calls,submit:()=>nodes.find(n=>n.tag==='button').onclick(),resolve:value=>resolve(value)};
}
test('MFA prompt only releases a verified session and closes cleanly',async()=>{
 const f=fixture(),result=f.prompt({id:'pending'}),action=f.submit();f.resolve({access_token:'verified'});await action;
 assert.equal((await result).access_token,'verified');assert.deepEqual(f.calls,['/auth/verify']);assert.equal(f.modal.open,false);
});
test('closing during verification cancels pending login and revokes a late successful session',async()=>{
 const f=fixture(),previous=globalThis.fetch,logouts=[];globalThis.fetch=async(path,init)=>{logouts.push({path,authorization:init.headers.Authorization});return new Response('{}');};
 try{
  const result=f.prompt({id:'pending'}),rejected=assert.rejects(result,/annulée/),action=f.submit();f.modal.close();await rejected;
  f.resolve({access_token:'late-token'});await action;
  assert.deepEqual(f.calls,['/auth/verify','/auth/cancel']);assert.equal(logouts.length,1);assert.equal(logouts[0].path,'/_matrix/client/v3/logout');assert.equal(logouts[0].authorization,'Bearer late-token');
 }finally{globalThis.fetch=previous;}
});
