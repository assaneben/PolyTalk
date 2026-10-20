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
import {resolvePermission} from '../server/tools.mjs';
import {createHash} from 'node:crypto';
test('server never and ask cannot be downgraded by a model suggestion',()=>{
 assert.equal(resolvePermission(['allow','never'],'allow'),'never');assert.equal(resolvePermission(['allow','ask'],'allow'),'ask');assert.equal(resolvePermission(['allow'],'ask'),'ask');assert.equal(resolvePermission(['allow'],'untrusted'),'never');assert.equal(resolvePermission([]),'never');
});
function setup(){const store=new Store(':memory:');const owner=store.ensure('@operator:local','Operator'),a=store.ensure('@a:local','A','agent'),b=store.ensure('@b:local','B','agent'),c=store.ensure('@c:local','C','agent');const runtime=new Coordination(store,{approvers:[owner.mxid]});for(const actor of [a,b,c])runtime.register(actor,{provider:'test',capabilities:['consult'],protocols:['api']});const root=runtime.create(owner,{requestId:'root',roomId:'!room',assigneeId:a.id,instructionEventId:'$root'});runtime.transition(a,root.id,{state:'running',version:1});return {store,runtime,owner,a,b,c,root};}
test('delegation requires an operator grant, rejects cycles and cascades cancellation',()=>{
 const {store,runtime:r,owner,a,b,root}=setup();try{
 const input={requestId:'child',roomId:'!room',assigneeId:b.id,instructionEventId:'$child',parentId:root.id};
 assert.throws(()=>r.create(a,{...input,parentId:undefined}),/Opérateur/);
 store.update(a.mxid,'A','human');assert.throws(()=>r.create(store.profile(a.mxid),{...input,parentId:undefined}),/Opérateur/);store.update(a.mxid,'A','agent');
 assert.throws(()=>r.create(a,input),/Délégation interdite/);
 assert.throws(()=>r.setDelegation(a,root.id,{decision:'allow',maxDepth:2,maxTasks:8}),/Opérateur/);
 r.setDelegation(owner,root.id,{decision:'allow',maxDepth:2,maxTasks:8});const child=r.create(a,input);assert.equal(child.parent_id,root.id);assert.equal(child.controller_id,owner.id);assert.equal(r.get(owner,child.id).id,child.id);
 assert.throws(()=>r.transition(a,root.id,{state:'completed',version:2,resultEventId:'$premature'}),/Sous-tâches/);
 r.transition(b,child.id,{state:'running',version:1});assert.throws(()=>r.create(b,{...input,parentId:child.id,requestId:'cycle',assigneeId:a.id}),/Cycle/);
 r.transition(owner,root.id,{state:'cancelled',version:2});assert.equal(r.get(owner,child.id).state,'cancelled');assert.throws(()=>r.create(a,{...input,requestId:'late'}),/Parent/);
 }finally{store.close();}
});
test('migration preserves legacy root task submission keys and backfills supervision',()=>{
 const store=new Store(':memory:');try{const owner=store.ensure('@operator:local','Owner'),worker=store.ensure('@worker:local','Worker','agent');
 store.db.exec('CREATE TABLE coordination_tasks(id TEXT PRIMARY KEY,owner_id TEXT,assignee_id TEXT,room_id TEXT,instruction_event_id TEXT,result_event_id TEXT,state TEXT,version INTEGER,expires_at TEXT,created_at TEXT,updated_at TEXT,request_id TEXT,fingerprint TEXT,UNIQUE(owner_id,request_id));');
 const fingerprint=createHash('sha256').update(JSON.stringify(['!r',worker.id,'$e',null])).digest('hex'),now=new Date().toISOString();store.db.prepare('INSERT INTO coordination_tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('legacy',owner.id,worker.id,'!r','$e',null,'assigned',1,null,now,now,'old-key',fingerprint);
 const r=new Coordination(store,{approvers:[owner.mxid]});r.register(worker,{provider:'test',capabilities:[],protocols:['api']});const restored=r.create(owner,{requestId:'old-key',roomId:'!r',assigneeId:worker.id,instructionEventId:'$e'});assert.equal(restored.id,'legacy');assert.equal(restored.controller_id,owner.id);assert.equal(restored.root_id,'legacy');
 }finally{store.close();}
});
test('expiring a root cancels descendants only once and invalidates pending approvals',()=>{
 const {store,runtime:r,owner,a,b,root}=setup();try{r.setDelegation(owner,root.id,{decision:'allow',maxDepth:2,maxTasks:8});const input={requestId:'child',roomId:'!room',assigneeId:b.id,instructionEventId:'$child',parentId:root.id};const child=r.create(a,input);
 r.setDelegation(owner,root.id,{decision:'ask',maxDepth:2,maxTasks:8});const approval=r.requestDelegation(a,{...input,requestId:'pending'});
 store.db.prepare('UPDATE coordination_tasks SET expires_at=? WHERE root_id=?').run('2000-01-01T00:00:00.000Z',root.id);r.expire();r.expire();assert.equal(r.get(owner,root.id).state,'expired');assert.equal(r.get(owner,child.id).state,'cancelled');assert.equal(r.events(owner,0).filter(e=>e.task_id===child.id&&e.type==='task.cancelled').length,1);assert.equal(r.approvals(owner).find(v=>v.id===approval.id).state,'cancelled');
 }finally{store.close();}
});
test('ask approvals bind exact delegation, expire, consume once and cannot override never',()=>{
 const {store,runtime:r,owner,a,b,root}=setup();try{
 r.setDelegation(owner,root.id,{decision:'ask',maxDepth:1,maxTasks:3});const input={requestId:'child',roomId:'!room',assigneeId:b.id,instructionEventId:'$child',parentId:root.id};
 const approval=r.requestDelegation(a,input);assert.equal(approval.state,'pending');assert.throws(()=>r.decideApproval(a,approval.id,'approved'),/Opérateur/);
 r.decideApproval(owner,approval.id,'approved');assert.throws(()=>r.create(a,{...input,instructionEventId:'$changed',approvalId:approval.id}),/Approbation/);
 const child=r.create(a,{...input,approvalId:approval.id});assert.equal(r.create(a,{...input,approvalId:approval.id}).id,child.id);assert.equal(r.approvals(owner)[0].state,'consumed');
 r.transition(b,child.id,{state:'running',version:1});assert.throws(()=>r.create(b,{...input,parentId:child.id,requestId:'too-deep',assigneeId:owner.id}),/Profondeur|Agent/);
 const second=r.requestDelegation(a,{...input,requestId:'second'});r.decideApproval(owner,second.id,'approved');r.setDelegation(owner,root.id,{decision:'never',maxDepth:1,maxTasks:3});assert.throws(()=>r.create(a,{...input,requestId:'second',approvalId:second.id}),/Délégation interdite/);
 }finally{store.close();}
});
test('expired approvals and task budgets fail closed without consuming an approval',()=>{
 const {store,runtime:r,owner,a,b,root}=setup();try{
 r.setDelegation(owner,root.id,{decision:'ask',maxDepth:1,maxTasks:2});const input={requestId:'child',roomId:'!room',assigneeId:b.id,instructionEventId:'$child',parentId:root.id};
 const expired=r.requestDelegation(a,input);r.decideApproval(owner,expired.id,'approved');store.db.prepare('UPDATE coordination_approvals SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z',expired.id);
 assert.throws(()=>r.create(a,{...input,approvalId:expired.id}),/Approbation/);
 const valid=r.requestDelegation(a,{...input,requestId:'valid'});r.decideApproval(owner,valid.id,'approved');
 store.db.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON coordination_events BEGIN SELECT RAISE(ABORT,'audit failed'); END;");
 assert.throws(()=>r.create(a,{...input,requestId:'valid',approvalId:valid.id}),/audit failed/);assert.equal(r.approvals(owner).find(v=>v.id===valid.id).state,'approved');store.db.exec('DROP TRIGGER audit_failure');
 r.create(a,{...input,requestId:'valid',approvalId:valid.id});assert.throws(()=>r.requestDelegation(a,{...input,requestId:'over-budget'}),/Budget/);
 }finally{store.close();}
});
