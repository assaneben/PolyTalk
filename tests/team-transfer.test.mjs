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
import {parseTeam,exportTeam,prepareTeam,createTeam} from '../web/team-transfer.js';
const origin='http://localhost:3210',agent={id:'11111111-1111-4111-8111-111111111111',mxid:'@agent:localhost',name:'Agent'};
const template={schema:'polytalk.team.v1',origin,name:'Équipe de test',agents:[agent]};
test('team format is closed and rejects duplicates, foreign origins, secrets and oversized files',()=>{
 assert.deepEqual(parseTeam(JSON.stringify(template),origin),template);
 for(const invalid of [{...template,origin:'https://foreign.example'},{...template,accessToken:'secret'},{...template,agents:[agent,agent]},{...template,agents:[{...agent,permissions:['execute']}]},{...template,agents:[]},{...template,name:'x'.repeat(101)}])assert.throws(()=>parseTeam(JSON.stringify(invalid),origin));
 assert.throws(()=>parseTeam(' '.repeat(65537),origin),/volumineux/);
 const exported=JSON.parse(exportTeam({origin,name:'Équipe de test',agents:[{...agent,accessToken:'must-not-export',capabilities:['coding']}]}));assert.deepEqual(exported,template);
});
test('import preview verifies identities and never creates or invites before explicit creation',async()=>{
 let calls=0,creates=0;const messenger={session:{userId:'@me:localhost'},api:async()=>{calls++;return {...agent,status:'offline'};},createConversation:async()=>{creates++;return '!new';}};
 const prepared=await prepareTeam({messenger,template,check(){}});assert.equal(calls,1);assert.equal(creates,0);assert.equal(prepared.agents[0].status,'offline');
 const state={};assert.equal(await createTeam({messenger,prepared,state,check(){}}),'!new');assert.equal(creates,1);await assert.rejects(createTeam({messenger,prepared,state,check(){}}),/déjà/);assert.equal(creates,1);
});
test('identity mismatch, closed view and uncertain creation fail without repeated invitations',async()=>{
 const bad={session:{userId:'@me:localhost'},api:async()=>({...agent,mxid:'@other:localhost'})};await assert.rejects(prepareTeam({messenger:bad,template,check(){}}),/identité/);
 let active=true,creates=0;const messenger={session:{userId:'@me:localhost'},api:async()=>{active=false;return agent;},createConversation:async()=>{creates++;throw Error('network');}};const check=()=>{if(!active)throw Error('closed');};await assert.rejects(prepareTeam({messenger,template,check}),/closed/);assert.equal(creates,0);
 active=true;const prepared={...template,agents:[agent]},state={};await assert.rejects(createTeam({messenger,prepared,state,check}),/Vérifiez/);await assert.rejects(createTeam({messenger,prepared,state,check}),/déjà/);assert.equal(creates,1);
});
