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
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {Messenger} from '../web/matrix-client.js';
import {SessionScope} from '../web/session-scope.js';
import {showNotifications} from '../web/notifications-ui.js';

// Synthetic identities, DOM and transports; no real account or server is touched.
async function contactsFixture(api){
 const source=await readFile(new URL('../web/app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function contacts(){'),source.indexOf('let installPrompt='));
 const buttons=[],fields=[],created=[],scope=new SessionScope();scope.begin();
 const node=()=>({isConnected:true,append(){},replaceChildren(){},focus(){}}),body=node(),modal={open:true,close(){this.open=false;}};
 const context={config:{serverName:'qa.local'},location:{origin:'http://localhost',pathname:'/'},messenger:{scope,session:{userId:'@me:qa.local'},api:api|| (async path=>({contacts:[{mxid:decodeURIComponent(path.split('=')[1]),name:'Synthetic QA'}]})),createConversation:async members=>{created.push(members);return '!qa';}},dialog:()=>body,el:node,field:()=>{const input={value:'',focus(){}};fields.push(input);return {input,wrapper:node()};},button:(text,action)=>{buttons.push({text,action});return node();},parseContact:value=>({mxid:value}),readContactFile(){},newConversation(){},selectRoom(){},$:()=>modal};
 vm.createContext(context);vm.runInContext(fn+'\ncontacts();',context);
 return {input:fields[0],created,buttons,body,modal,action:label=>buttons.findLast(b=>b.text===label).action};
}
test('contact changed after preview cannot invite the old address even without an input event',async()=>{
 const f=await contactsFixture();f.input.value='@old:qa.local';await f.action('Afficher l’aperçu')();
 f.input.value='@new:qa.local';await assert.rejects(f.action('Créer une conversation et inviter')(),/adresse a changé/);assert.equal(f.created.length,0);
 await f.action('Afficher l’aperçu')();await f.action('Créer une conversation et inviter')();assert.equal(f.created[0][0],'@new:qa.local');
});
test('out-of-order contact lookup cannot overwrite the latest preview',async()=>{
 const pending=[];const f=await contactsFixture(()=>new Promise(resolve=>pending.push(resolve)));
 f.input.value='@old:qa.local';const old=f.action('Afficher l’aperçu')();
 f.input.value='@new:qa.local';f.input.oninput();const latest=f.action('Afficher l’aperçu')();
 pending[1]({contacts:[{mxid:'@new:qa.local',name:'New synthetic QA'}]});await latest;
 pending[0]({contacts:[{mxid:'@old:qa.local',name:'Old synthetic QA'}]});await old;
 assert.equal(f.buttons.filter(b=>b.text==='Créer une conversation et inviter').length,1);
 await f.action('Créer une conversation et inviter')();assert.equal(f.created[0][0],'@new:qa.local');
});
test('authenticated HTTP 401 locks before parsing, clears crypto client and emits expiry once',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('not JSON',{status:401});
 try{
  const m=new Messenger();m.scope.begin();m.session={accessToken:'synthetic'};m.status('ready');let stopped=0,expired=0;
  m.client={removeAllListeners(){},stopClient(){stopped++;}};m.policy={mode:'open'};m.profile={name:'Synthetic'};
  m.addEventListener('session-expired',()=>expired++);
  await assert.rejects(m.api('/me'),/session a expiré/);
  assert.equal(m.session,null);assert.equal(m.client,null);assert.equal(m.policy,null);assert.equal(m.profile,null);assert.equal(m.state.status,'locked');assert.equal(stopped,1);assert.equal(expired,1);
 }finally{globalThis.fetch=previous;}
});
test('network errors, HTTP 503 and unauthenticated 401 do not revoke a valid local session',async()=>{
 const previous=globalThis.fetch;
 try{
  for(const status of [503,401,0]){
   const m=new Messenger();m.scope.begin();m.session=status===401?null:{accessToken:'synthetic'};m.status('ready');let expired=0;m.addEventListener('session-expired',()=>expired++);
   globalThis.fetch=async()=>{if(!status)throw Error('Synthetic network failure');return new Response(JSON.stringify({error:'Synthetic rejection'}),{status});};
   await assert.rejects(m.api('/me'));assert.equal(m.state.status,'ready');assert.equal(expired,0);
  }
 }finally{globalThis.fetch=previous;}
});
test('late HTTP 401 from previous generation cannot lock a newer session',async()=>{
 const previous=globalThis.fetch;let resolve;globalThis.fetch=()=>new Promise(done=>resolve=done);
 try{
  const m=new Messenger();m.scope.begin();m.session={accessToken:'old-synthetic'};m.status('ready');
  const request=m.api('/me');m.scope.begin();const latest={accessToken:'new-synthetic'};m.session=latest;
  resolve(new Response('{}',{status:401}));await assert.rejects(request,/expirée ou verrouillée/);assert.equal(m.session,latest);assert.equal(m.state.status,'ready');
 }finally{globalThis.fetch=previous;}
});
function notificationFixture(confirmReject){
 const m=new EventTarget();m.scope=new SessionScope();m.scope.begin();let leaves=0;
 const room={roomId:'!qa',name:'Synthetic',getMyMembership:()=> 'invite'};m.rooms=()=>[room];m.client={getRoom:()=>room,leave:async()=>leaves++};
 const modal=new EventTarget();modal.open=true;const buttons=[],node=()=>({isConnected:true,append(){},replaceChildren(){}});
 showNotifications({messenger:m,dialog:node,el:node,button:(text,action)=>{buttons.push({text,action});return node();},getDialog:()=>modal,openRoom(){},notice(){},confirmReject});
 return {m,modal,leaves:()=>leaves,reject:()=>buttons.find(b=>b.text==='Refuser').action()};
}
test('rejecting invitation requires confirmation; cancellation never leaves room',async()=>{
 let confirms=0;const f=notificationFixture(async()=>{confirms++;return false;});await f.reject();assert.equal(confirms,1);assert.equal(f.leaves(),0);
 const accepted=notificationFixture(async()=>true);await accepted.reject();assert.equal(accepted.leaves(),1);
});
test('double click and closing while rejection confirmation is pending cannot mutate twice',async()=>{
 let resolve;const f=notificationFixture(()=>new Promise(done=>resolve=done));const pending=f.reject();await f.reject();assert.equal(f.leaves(),0);
 f.modal.open=false;resolve(true);await assert.rejects(pending,/fermée/);assert.equal(f.leaves(),0);
});
test('placeholder color meets normal text contrast and explicitly avoids browser opacity reduction',async()=>{
 const css=await readFile(new URL('../web/style.css',import.meta.url),'utf8');
 const rule=css.match(/input::placeholder,textarea::placeholder\{([^}]+)\}/)?.[1];assert.match(rule,/opacity:1/);
 const color=rule.match(/color:(#[\da-f]{6})/)[1];
 const values=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
 const lum=values[0]*.2126+values[1]*.7152+values[2]*.0722;assert.ok(1.05/(lum+.05)>=4.5);
});

test('confirmation rejection preserves the authenticated session',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({error:'Confirmation refusée.'}),{status:403});
 try{const m=new Messenger();m.scope.begin();const session={accessToken:'synthetic'};m.session=session;m.status('ready');await assert.rejects(m.api('/security/devices/revoke','POST',{}),/Confirmation refusée/);assert.equal(m.session,session);assert.equal(m.state.status,'ready');}finally{globalThis.fetch=previous;}
});
