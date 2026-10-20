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
import {identityUi} from '../web/identity-ui.js';
import {SessionScope} from '../web/session-scope.js';
import {createIdentity,exportIdentity} from '../web/identity-recovery.js';
test('closing identity backup while encryption is pending clears the recovery code and never creates an account',async()=>{
 const modal=new EventTarget();modal.open=true;modal.close=()=>{modal.open=false;modal.dispatchEvent(new Event('close'));};
 const scope=new SessionScope();scope.begin();const fields=[],buttons=[],views=[];
 const el=(tag,text)=>({tag,text,children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
 const field=(label,type='text',value='')=>{const input={value,type,focus(){},files:[]},result={label,input,wrapper:el('label',label)};fields.push(result);return result;};
 const button=(text,action)=>{const value={text,action};buttons.push(value);return value;};
 const dialog=()=>{for(const view of views)view.isConnected=false;const view=el('div');view.isConnected=true;views.push(view);modal.open=true;return view;};
 const ui=identityUi({messenger:{scope},config:()=>({origin:'https://chat.example',serverName:'example',walletEnabled:true}),dialog,el,field,button,getDialog:()=>modal,onReady(){throw Error('must not connect');}});
 ui.create();fields.find(f=>f.label.startsWith('Identifiant souhaité')).input.value='identityqa';
 const action=buttons.find(b=>b.text==='Préparer mon identité et sa sauvegarde').action(),secret=fields.find(f=>f.label.startsWith('Code personnel de récupération'));
 assert.equal(secret.input.value.length,32);modal.close();assert.equal(secret.input.value,'');await assert.rejects(action,/fermé/);
});
test('a late verified MFA session is revoked if the identity view was invalidated',async()=>{
 const origin='https://chat.example',{identity,recoveryCode}=createIdentity({origin,serverName:'example',username:'identityqa'}),file=await exportIdentity(identity,recoveryCode);
 const scope=new SessionScope();scope.begin();const fields=[],buttons=[],modal=new EventTarget();modal.open=true;modal.close=()=>{modal.open=false;modal.dispatchEvent(new Event('close'));};
 const el=(tag,text)=>({tag,text,append(){},replaceChildren(){}}),body={isConnected:true,append(){}},field=(label,type='text',value='')=>{const result={label,wrapper:{},input:{value,type,files:[],focus(){}}};fields.push(result);return result;};
 const previous=globalThis.fetch,calls=[],session={user_id:'@identityqa:example',device_id:'DEVICE',access_token:'late-test-session'};
 globalThis.fetch=async(url)=>{const path=new URL(url).pathname;calls.push(path);let data={};
  if(path==='/api/config')data={origin,matrixBase:origin,serverName:'example',walletEnabled:true};
  if(path==='/api/wallet/challenge'){const now=Date.now(),id=crypto.randomUUID(),expiresAt=new Date(now+300000).toISOString();data={id,address:identity.address,chainId:1,expiresAt,message:`chat.example wants you to sign in with your Ethereum account:\n${identity.address}\n\nSign in to PolyTalk. No transaction. No access to funds.\n\nURI: ${origin}/\nVersion: 1\nChain ID: 1\nNonce: ${'a'.repeat(48)}\nIssued At: ${new Date(now).toISOString()}\nExpiration Time: ${expiresAt}\nRequest ID: ${id}`};}
  if(path==='/api/wallet/login')data={mfaRequired:true,id:'pending'};return new Response(JSON.stringify(data));
 };
 try{
  const ui=identityUi({messenger:{scope,completeAuthentication:async()=>{scope.begin();return session;}},config:()=>({origin,serverName:'example',walletEnabled:true}),dialog:()=>body,el,field,button:(text,action)=>{buttons.push({text,action});return {};},getDialog:()=>modal,onReady(){throw Error('must not open');}});
  ui.restore();fields.find(f=>f.label==='Fichier d’identité PolyTalk chiffré').input.files=[{size:file.length,text:async()=>file}];fields.find(f=>f.label==='Code personnel de récupération de l’identité').input.value=recoveryCode;
  await assert.rejects(buttons.find(b=>b.text==='Restaurer et me connecter').action(),/verrouillée/);assert.ok(calls.includes('/_matrix/client/v3/logout'));
 }finally{globalThis.fetch=previous;}
});
