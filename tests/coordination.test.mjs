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
import {Store} from '../server/store.mjs';
import {Coordination} from '../server/coordination.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('task pagination exposes all accessible contracts beyond 100 without duplicates or cross-user leakage',()=>{
 const store=new Store(':memory:');try{
  const owner=store.ensure('@owner:local','Owner'),worker=store.ensure('@worker:local','Worker','agent'),stranger=store.ensure('@stranger:local','Stranger');
  const c=new Coordination(store,{approvers:[owner.mxid]});c.register(worker,{provider:'synthetic',capabilities:['testing'],protocols:['api']});
  for(let i=0;i<205;i++)c.create(owner,{requestId:'pagination-'+i,roomId:'!qa',assigneeId:worker.id,instructionEventId:'$instruction'+i});
  const first=c.page(owner);assert.equal(first.tasks.length,100);assert.ok(first.next);
  const second=c.page(owner,first.next);assert.equal(second.tasks.length,100);assert.ok(second.next);
  assert.deepEqual(c.page(owner,first.next.toUpperCase()),second);
  const third=c.page(owner,second.next);assert.equal(third.tasks.length,5);assert.equal(third.next,null);
  const ids=[...first.tasks,...second.tasks,...third.tasks].map(t=>t.id);assert.equal(new Set(ids).size,205);assert.deepEqual(ids,[...ids].sort());
  assert.deepEqual(c.page(stranger),{tasks:[],next:null});assert.throws(()=>c.page(owner,'not-a-cursor'),/Curseur/);
 }finally{store.close();}
});
test('coordination persists identities, deduplicates submissions and enforces participant transitions',()=>{
 const store=new Store(':memory:');try{
 const owner=store.ensure('@owner:local','Owner'),worker=store.ensure('@worker:local','Worker','agent'),stranger=store.ensure('@other:local','Other');
 const c=new Coordination(store,{approvers:['@owner:local','@a:local']});const agent=c.register(worker,{provider:'external',capabilities:['coding'],protocols:['mcp']});assert.equal(agent.id,worker.id);assert.equal(agent.verification,'declared');
 const input={requestId:'request-1',roomId:'!room',assigneeId:worker.id,instructionEventId:'$encrypted',expiresAt:null};
 const task=c.create(owner,input);assert.equal(task.state,'assigned');assert.equal(c.create(owner,input).id,task.id);assert.equal(c.events(owner,0).length,1);assert.equal(c.list(stranger).length,0);
 assert.throws(()=>c.transition(stranger,task.id,{state:'running',version:1}),/Accès/);
 assert.throws(()=>c.transition(owner,task.id,{state:'completed',version:1,resultEventId:'$result'}),/Transition/);
 const running=c.transition(worker,task.id,{state:'running',version:1});assert.equal(running.version,2);
 assert.throws(()=>c.transition(worker,task.id,{state:'failed',version:1}),/Version/);
 const done=c.transition(worker,task.id,{state:'completed',version:2,resultEventId:'$result'});assert.equal(done.state,'completed');assert.equal(c.events(owner,0).length,3);
 assert.throws(()=>c.transition(worker,task.id,{state:'running',version:3}),/Transition/);
 assert.throws(()=>c.create(owner,{...input,instructionEventId:'$different'}),/Idempotence/);
 }finally{store.close();}
});
test('coordination survives reopening and rolls back task state if audit insertion fails',()=>{
 const directory=mkdtempSync(join(tmpdir(),'polytalk-coordination-'));let store=new Store(join(directory,'state.sqlite'));
 try{const a=store.ensure('@a:local','A'),b=store.ensure('@b:local','B','agent');let c=new Coordination(store,{approvers:['@owner:local','@a:local']});c.register(b,{provider:'local',capabilities:['testing'],protocols:['api']});
 const task=c.create(a,{requestId:'persistent',roomId:'!room',assigneeId:b.id,instructionEventId:'$instructions'});store.close();store=new Store(join(directory,'state.sqlite'));c=new Coordination(store,{approvers:['@owner:local','@a:local']});assert.equal(c.get(b,task.id).state,'assigned');assert.equal(c.events(a,0).length,1);
 store.db.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON coordination_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
 assert.throws(()=>c.transition(b,task.id,{state:'running',version:1}),/audit unavailable/);assert.equal(c.get(b,task.id).state,'assigned');assert.equal(c.get(b,task.id).version,1);
 }finally{store.close();rmSync(directory,{recursive:true,force:true});}
});
test('coordination expires tasks, respects blocks and never lets agents verify their own capabilities',()=>{
 const store=new Store(':memory:');try{const a=store.ensure('@a:local','A'),b=store.ensure('@b:local','B','agent');const c=new Coordination(store,{approvers:['@owner:local','@a:local']});
 assert.throws(()=>c.register(b,{provider:'x',capabilities:['code'],protocols:['api'],verification:'verified'}),/Fiche/);
 c.register(b,{provider:'x',capabilities:['code'],protocols:['api']});store.setRule(b.mxid,a.mxid,'block');
 const input={requestId:'r',roomId:'!r',assigneeId:b.id,instructionEventId:'$e',expiresAt:null};assert.throws(()=>c.create(a,input),/réception/);store.setRule(b.mxid,a.mxid,'remove');
 const task=c.create(a,{...input,expiresAt:new Date(Date.now()+10000).toISOString()});c.expire(Date.now()+20000);assert.equal(c.get(a,task.id).state,'expired');assert.equal(c.events(a,0).length,2);
 }finally{store.close();}
});


test('presence refresh requires an existing authenticated agent registration',()=>{
 const store=new Store(':memory:');try{const agent=store.ensure('@presence:local','Presence','agent'),human=store.ensure('@human:local','Human'),c=new Coordination(store);
 assert.throws(()=>c.heartbeat(agent),/enregistrée/);assert.throws(()=>c.heartbeat(human),/enregistrée/);
 c.register(agent,{provider:'native',capabilities:[],protocols:['mcp']});store.db.prepare('UPDATE coordination_agents SET heartbeat=0 WHERE id=?').run(agent.id);assert.equal(c.agents(agent)[0].status,'offline');
 assert.deepEqual(c.heartbeat(agent),{online:true});assert.equal(c.agents(agent)[0].status,'online');assert.equal(c.agents(agent)[0].verification,'declared');
 }finally{store.close();}
});
