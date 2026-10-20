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
import {randomUUID,createHash} from 'node:crypto';
import {resolvePermission} from './tools.mjs';
export class CoordinationError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new CoordinationError(status,message);};
const shape=(v,fields)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>fields.includes(k));
const label=(v,n=80)=>typeof v==='string'&&v.trim().length>0&&v.length<=n&&!/[\p{Cc}\p{Cf}\p{Cs}]/u.test(v);
const reference=(v,prefix)=>label(v,255)&&v.startsWith(prefix)&&!/[\s]/u.test(v)&&Buffer.byteLength(v)<=255;
const terminal=new Set(['completed','failed','cancelled','expired']);
export class Coordination{
 constructor(store,{approvers=[]}={}){this.approvers=new Set(approvers);this.store=store;this.db=store.db;this.db.exec(`
 CREATE TABLE IF NOT EXISTS coordination_agents(id TEXT PRIMARY KEY REFERENCES profiles(id),provider TEXT NOT NULL,capabilities TEXT NOT NULL,protocols TEXT NOT NULL,heartbeat INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS coordination_tasks(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES profiles(id),assignee_id TEXT NOT NULL REFERENCES profiles(id),room_id TEXT NOT NULL,instruction_event_id TEXT NOT NULL,result_event_id TEXT,state TEXT NOT NULL,version INTEGER NOT NULL,expires_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,UNIQUE(owner_id,request_id));
 CREATE TABLE IF NOT EXISTS coordination_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,task_id TEXT NOT NULL REFERENCES coordination_tasks(id),actor_id TEXT NOT NULL,type TEXT NOT NULL,state TEXT NOT NULL,version INTEGER NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS coordination_tasks_owner ON coordination_tasks(owner_id,updated_at);
 CREATE INDEX IF NOT EXISTS coordination_tasks_assignee ON coordination_tasks(assignee_id,updated_at);
 CREATE INDEX IF NOT EXISTS coordination_events_task ON coordination_events(task_id,sequence);
 CREATE TABLE IF NOT EXISTS coordination_delegation(root_id TEXT PRIMARY KEY REFERENCES coordination_tasks(id),decision TEXT NOT NULL,max_depth INTEGER NOT NULL,max_tasks INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS coordination_approvals(id TEXT PRIMARY KEY,parent_id TEXT NOT NULL REFERENCES coordination_tasks(id),requester_id TEXT NOT NULL,controller_id TEXT NOT NULL,fingerprint TEXT NOT NULL,assignee_id TEXT NOT NULL,instruction_event_id TEXT NOT NULL,state TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const columns=new Set(this.db.prepare('PRAGMA table_info(coordination_tasks)').all().map(c=>c.name));
 for(const [name,type]of [['parent_id','TEXT'],['root_id','TEXT'],['controller_id','TEXT'],['depth','INTEGER NOT NULL DEFAULT 0']])if(!columns.has(name))this.db.exec(`ALTER TABLE coordination_tasks ADD COLUMN ${name} ${type}`);
 this.db.exec('UPDATE coordination_tasks SET root_id=id,controller_id=owner_id WHERE root_id IS NULL; CREATE INDEX IF NOT EXISTS coordination_tasks_root ON coordination_tasks(root_id);');
 if(!this.db.prepare('PRAGMA table_info(coordination_approvals)').all().some(c=>c.name==='contract'))this.db.exec('ALTER TABLE coordination_approvals ADD COLUMN contract TEXT;');
 }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 requireOperator(actor,root){if(actor.id!==root.controller_id||!this.approvers.has(actor.mxid))fail(403,'Opérateur désigné requis.');}
 delegationFingerprint(input){return createHash('sha256').update(JSON.stringify([input.parentId,input.requestId,input.roomId,input.assigneeId,input.instructionEventId,input.expiresAt||null])).digest('hex');}
 delegationPolicy(actor,id){const task=this.get(actor,id);return this.db.prepare('SELECT * FROM coordination_delegation WHERE root_id=?').get(task.root_id)||{root_id:task.root_id,decision:'never',max_depth:0,max_tasks:0};}
 setDelegation(actor,id,input){
  const root=this.get(actor,id);this.requireOperator(actor,root);
  if(root.parent_id||terminal.has(root.state)||!shape(input,['decision','maxDepth','maxTasks'])||!['allow','ask','never'].includes(input.decision)||!Number.isInteger(input.maxDepth)||input.maxDepth<1||input.maxDepth>3||!Number.isInteger(input.maxTasks)||input.maxTasks<1||input.maxTasks>32)fail(400,'Politique de délégation invalide.');
  return this.transaction(()=>{this.db.prepare('INSERT INTO coordination_delegation VALUES(?,?,?,?) ON CONFLICT(root_id) DO UPDATE SET decision=excluded.decision,max_depth=excluded.max_depth,max_tasks=excluded.max_tasks').run(id,input.decision,input.maxDepth,input.maxTasks);if(input.decision==='never')this.db.prepare("UPDATE coordination_approvals SET state='revoked' WHERE parent_id IN (SELECT id FROM coordination_tasks WHERE root_id=?) AND state IN ('pending','approved')").run(id);this.event(root,actor.id,'delegation.'+input.decision);return {rootId:id,...input};});
 }
 checkDelegation(actor,input){
  const parent=this.get(actor,input.parentId);
  if(parent.assignee_id!==actor.id||actor.kind!=='agent'||parent.state!=='running'||parent.expires_at&&Date.parse(parent.expires_at)<=Date.now())fail(403,'Parent non exécutable par cet agent.');
  if(parent.room_id!==input.roomId)fail(403,'Canal parent requis.');
  const policy=this.db.prepare('SELECT * FROM coordination_delegation WHERE root_id=?').get(parent.root_id);
  const controller=this.store.byId(parent.controller_id);
  if(resolvePermission([policy?.decision||'never',controller&&this.approvers.has(controller.mxid)?'allow':'never'])==='never')fail(403,'Délégation interdite.');
  if(parent.depth+1>policy.max_depth)fail(403,'Profondeur maximale atteinte.');
  let ancestor=parent;for(let i=0;ancestor&&i<5;i++){
   if(input.assigneeId===ancestor.assignee_id||input.assigneeId===ancestor.owner_id)fail(403,'Cycle de délégation interdit.');
   ancestor=ancestor.parent_id?this.db.prepare('SELECT * FROM coordination_tasks WHERE id=?').get(ancestor.parent_id):null;
  }
  if(this.db.prepare('SELECT count(*) AS n FROM coordination_tasks WHERE root_id=?').get(parent.root_id).n>=policy.max_tasks)fail(403,'Budget de tâches atteint.');
  const target=this.store.byId(input.assigneeId);if(!target||!this.store.allowed(controller.mxid,target.mxid)||!this.store.allowed(target.mxid,controller.mxid))fail(403,'Règles de réception incompatibles.');
  return {parent,policy};
 }
 requestDelegation(actor,input){
  this.validateTask(input);if(!input.parentId||input.approvalId)fail(400,'Demande de délégation invalide.');
  if(!this.lookup(actor,input.assigneeId))fail(400,'Agent enregistré requis.');
  return this.transaction(()=>{const {parent,policy}=this.checkDelegation(actor,input);if(policy.decision!=='ask')fail(403,'Approbation non applicable.');
   const fingerprint=this.delegationFingerprint(input),old=this.db.prepare("SELECT * FROM coordination_approvals WHERE requester_id=? AND fingerprint=? AND state IN ('pending','approved') AND expires_at>? ORDER BY created_at DESC LIMIT 1").get(actor.id,fingerprint,new Date().toISOString());if(old)return old;
   if(this.db.prepare("SELECT count(*) AS n FROM coordination_approvals WHERE controller_id=? AND state IN ('pending','approved') AND expires_at>?").get(parent.controller_id,new Date().toISOString()).n>=100)fail(429,'Trop de validations en attente.');
   const id=randomUUID(),now=new Date().toISOString(),expires=new Date(Math.min(Date.now()+300000,parent.expires_at?Date.parse(parent.expires_at):Infinity)).toISOString();
   this.db.prepare('INSERT INTO coordination_approvals(id,parent_id,requester_id,controller_id,fingerprint,assignee_id,instruction_event_id,state,expires_at,created_at,contract) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,parent.id,actor.id,parent.controller_id,fingerprint,input.assigneeId,input.instructionEventId,'pending',expires,now,JSON.stringify(input));
   this.event(parent,actor.id,'approval.requested');return this.db.prepare('SELECT * FROM coordination_approvals WHERE id=?').get(id);
  });
 }
 approvals(actor){return this.db.prepare(`SELECT * FROM coordination_approvals WHERE controller_id=? OR requester_id=? ORDER BY CASE WHEN state IN ('pending','approved') AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 0 ELSE 1 END,created_at DESC LIMIT 100`).all(actor.id,actor.id).map(row=>({...row,state:['pending','approved'].includes(row.state)&&Date.parse(row.expires_at)<=Date.now()?'expired':row.state}));}
 approval(actor,id){const row=this.db.prepare('SELECT * FROM coordination_approvals WHERE id=? AND (controller_id=? OR requester_id=?)').get(id,actor.id,actor.id);if(!row)fail(403,'Accès interdit.');return row;}
 decideApproval(actor,id,state){
  if(!['approved','rejected'].includes(state))fail(400,'Décision invalide.');
  return this.transaction(()=>{const approval=this.db.prepare('SELECT * FROM coordination_approvals WHERE id=?').get(id);if(!approval)fail(403,'Accès interdit.');const parent=this.get(actor,approval.parent_id);this.requireOperator(actor,parent);
   if(approval.state!=='pending'||Date.parse(approval.expires_at)<=Date.now()||parent.state!=='running')fail(409,'Approbation expirée ou déjà traitée.');
   this.db.prepare('UPDATE coordination_approvals SET state=? WHERE id=?').run(state,id);this.event(parent,actor.id,'approval.'+state);return {...approval,state};
  });
 }
 descendants(id){return this.db.prepare('WITH RECURSIVE children AS (SELECT * FROM coordination_tasks WHERE parent_id=? UNION ALL SELECT t.* FROM coordination_tasks t JOIN children c ON t.parent_id=c.id) SELECT * FROM children').all(id);}
 cancelChildren(id,actor){this.db.prepare("UPDATE coordination_approvals SET state='cancelled' WHERE (parent_id=? OR parent_id IN (WITH RECURSIVE children AS (SELECT id FROM coordination_tasks WHERE parent_id=? UNION ALL SELECT t.id FROM coordination_tasks t JOIN children c ON t.parent_id=c.id) SELECT id FROM children)) AND state IN ('pending','approved')").run(id,id);for(const task of this.descendants(id)){if(terminal.has(task.state))continue;task.state='cancelled';task.version++;task.updated_at=new Date().toISOString();this.db.prepare('UPDATE coordination_tasks SET state=?,version=?,updated_at=? WHERE id=?').run(task.state,task.version,task.updated_at,task.id);this.event(task,actor,'task.cancelled');}}
 agent(row){if(!row)return null;const profile=this.store.byId(row.id);return {id:row.id,mxid:profile.mxid,name:profile.name,provider:row.provider,capabilities:JSON.parse(row.capabilities),protocols:JSON.parse(row.protocols),verification:'declared',status:Date.now()-row.heartbeat<90000?'online':'offline',lastSeen:new Date(row.heartbeat).toISOString()};}
 register(actor,input){
  const list=v=>Array.isArray(v)&&v.length<=32&&new Set(v).size===v.length&&v.every(x=>label(x,48));
  if(actor.kind!=='agent'||!shape(input,['provider','capabilities','protocols'])||!label(input.provider)||!list(input.capabilities)||!list(input.protocols))fail(400,'Fiche agent invalide.');
  this.db.prepare(`INSERT INTO coordination_agents VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,capabilities=excluded.capabilities,protocols=excluded.protocols,heartbeat=excluded.heartbeat`).run(actor.id,input.provider,JSON.stringify(input.capabilities),JSON.stringify(input.protocols),Date.now());return this.agent(this.db.prepare('SELECT * FROM coordination_agents WHERE id=?').get(actor.id));
 }
 heartbeat(actor){if(actor.kind!=='agent'||this.db.prepare('UPDATE coordination_agents SET heartbeat=? WHERE id=?').run(Date.now(),actor.id).changes!==1)fail(403,'Fiche agent enregistrée requise.');return {online:true};}
 agents(actor){return this.db.prepare('SELECT * FROM coordination_agents WHERE id=?').all(actor.id).map(row=>this.agent(row));}
 lookup(actor,id){const row=this.db.prepare('SELECT * FROM coordination_agents WHERE id=?').get(id);if(!row)return null;const target=this.store.byId(id);if(!this.store.allowed(target.mxid,actor.mxid)||!this.store.allowed(actor.mxid,target.mxid))fail(403,'Règles de réception incompatibles.');return this.agent(row);}
 get(actor,id){const row=this.db.prepare('SELECT * FROM coordination_tasks WHERE id=? AND (owner_id=? OR assignee_id=? OR controller_id=?)').get(id,actor.id,actor.id,actor.id);if(!row)fail(403,'Accès interdit.');return row;}
 list(actor){return this.db.prepare('SELECT * FROM coordination_tasks WHERE owner_id=? OR assignee_id=? OR controller_id=? ORDER BY updated_at DESC,id LIMIT 100').all(actor.id,actor.id,actor.id);}
 page(actor,after=''){
  if(typeof after!=='string'||after&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(after))fail(400,'Curseur invalide.');
  after=after.toLowerCase();
  const rows=this.db.prepare('SELECT * FROM coordination_tasks WHERE (owner_id=? OR assignee_id=? OR controller_id=?) AND id>? ORDER BY id LIMIT 101').all(actor.id,actor.id,actor.id,after);
  return {tasks:rows.slice(0,100),next:rows.length>100?rows[99].id:null};
 }
 revocable(actor,after=''){if(after&&!/^[0-9a-f-]{36}$/.test(after))fail(400,'Curseur invalide.');const rows=this.db.prepare("SELECT id,state,version FROM coordination_tasks WHERE (owner_id=? OR controller_id=?) AND state NOT IN ('completed','failed','cancelled','expired') AND id>? ORDER BY id LIMIT 101").all(actor.id,actor.id,after);return {tasks:rows.slice(0,100),next:rows.length>100?rows[99].id:null};}
 event(task,actor,type){this.db.prepare('INSERT INTO coordination_events(id,task_id,actor_id,type,state,version,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),task.id,actor,type,task.state,task.version,new Date().toISOString());}
 validateTask(input){
  if(!shape(input,['requestId','roomId','assigneeId','instructionEventId','expiresAt','parentId','approvalId'])||!label(input.requestId,128)||!reference(input.roomId,'!')||!reference(input.instructionEventId,'$')||!label(input.assigneeId,36)||(input.parentId!==undefined&&!label(input.parentId,36))||(input.approvalId!==undefined&&!label(input.approvalId,36))||(input.expiresAt!==null&&input.expiresAt!==undefined&&(!label(input.expiresAt,40)||!Number.isFinite(Date.parse(input.expiresAt))||Date.parse(input.expiresAt)<=Date.now())))fail(400,'Contrat de tâche invalide.');
 }
 create(actor,input){
  this.validateTask(input);
  // A caller cannot evade delegation budgets by omitting parentId or editing its profile kind.
  if(!input.parentId&&!this.approvers.has(actor.mxid))fail(403,'Opérateur désigné requis pour créer une tâche racine.');
  const agent=this.lookup(actor,input.assigneeId);if(!agent)fail(400,'Agent enregistré requis.');
  const fingerprint=createHash('sha256').update(JSON.stringify([input.roomId,input.assigneeId,input.instructionEventId,input.expiresAt||null].concat(input.parentId?[input.parentId]:[]))).digest('hex');
  return this.transaction(()=>{const old=this.db.prepare('SELECT * FROM coordination_tasks WHERE owner_id=? AND request_id=?').get(actor.id,input.requestId);if(old){if(old.fingerprint!==fingerprint)fail(409,'Idempotence : paramètres différents.');return old;}
   const delegated=input.parentId?this.checkDelegation(actor,input):null;
   if(delegated?.policy.decision==='ask'){
    const approval=this.db.prepare('SELECT * FROM coordination_approvals WHERE id=?').get(input.approvalId||'');
    if(!approval||approval.state!=='approved'||approval.requester_id!==actor.id||approval.parent_id!==input.parentId||approval.fingerprint!==this.delegationFingerprint(input)||Date.parse(approval.expires_at)<=Date.now())fail(403,'Approbation exacte requise.');
    this.db.prepare("UPDATE coordination_approvals SET state='consumed' WHERE id=?").run(approval.id);
   }else if(input.approvalId)fail(400,'Approbation inattendue.');
   const id=randomUUID(),now=new Date().toISOString(),deadline=delegated?.parent.expires_at?(input.expiresAt&&Date.parse(input.expiresAt)<Date.parse(delegated.parent.expires_at)?input.expiresAt:delegated.parent.expires_at):input.expiresAt||null;
   this.db.prepare('INSERT INTO coordination_tasks(id,owner_id,assignee_id,room_id,instruction_event_id,result_event_id,state,version,expires_at,created_at,updated_at,request_id,fingerprint,parent_id,root_id,controller_id,depth) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,actor.id,input.assigneeId,input.roomId,input.instructionEventId,null,'assigned',1,deadline,now,now,input.requestId,fingerprint,input.parentId||null,delegated?.parent.root_id||id,delegated?.parent.controller_id||actor.id,delegated?delegated.parent.depth+1:0);
   const task=this.get(actor,id);this.event(task,actor.id,'task.assigned');return task;
  });
 }
 transition(actor,id,input){
  if(!shape(input,['state','version','resultEventId'])||!Number.isSafeInteger(input.version)||input.version<1||!label(input.state,32)||(input.resultEventId!==undefined&&!reference(input.resultEventId,'$')))fail(400,'Transition invalide.');
  return this.transaction(()=>{const task=this.get(actor,id);if(task.version!==input.version)fail(409,'Version dépassée.');
   if(task.expires_at&&Date.parse(task.expires_at)<=Date.now())fail(409,'Tâche expirée.');
   const worker=actor.id===task.assignee_id,owner=actor.id===task.owner_id||actor.id===task.controller_id;
   const allowed=!terminal.has(task.state)&&((input.state==='cancelled'&&owner)||(worker&&((task.state==='assigned'&&input.state==='running')||(task.state==='running'&&['completed','failed','awaiting_approval'].includes(input.state))))||(owner&&task.state==='awaiting_approval'&&input.state==='assigned'));
   if(!allowed||input.state==='completed'&&!input.resultEventId||input.state!=='completed'&&input.resultEventId!==undefined)fail(403,'Transition non autorisée.');
   if(input.state==='completed'&&this.descendants(task.id).some(t=>!terminal.has(t.state)))fail(409,'Sous-tâches encore actives.');
   this.db.prepare('UPDATE coordination_tasks SET state=?,version=version+1,result_event_id=?,updated_at=? WHERE id=?').run(input.state,input.resultEventId||null,new Date().toISOString(),id);const next=this.get(actor,id);this.event(next,actor.id,'task.'+input.state);if(['cancelled','failed'].includes(input.state))this.cancelChildren(task.id,actor.id);return next;
  });
 }
 expire(now=Date.now()){return this.transaction(()=>{const rows=this.db.prepare("SELECT * FROM coordination_tasks WHERE expires_at IS NOT NULL AND state NOT IN ('completed','failed','cancelled','expired') AND julianday(expires_at)<=julianday(?) LIMIT 500").all(new Date(now).toISOString());for(const task of rows){if(terminal.has(this.db.prepare('SELECT state FROM coordination_tasks WHERE id=?').get(task.id).state)||Date.parse(task.expires_at)>now)continue;task.state='expired';task.version++;task.updated_at=new Date(now).toISOString();this.db.prepare('UPDATE coordination_tasks SET state=?,version=?,updated_at=? WHERE id=?').run(task.state,task.version,task.updated_at,task.id);this.event(task,'system','task.expired');this.cancelChildren(task.id,'system');}});}
 events(actor,after){if(!Number.isSafeInteger(after)||after<0)fail(400,'Curseur invalide.');return this.db.prepare('SELECT e.* FROM coordination_events e JOIN coordination_tasks t ON e.task_id=t.id WHERE e.sequence>? AND (t.owner_id=? OR t.assignee_id=? OR t.controller_id=?) ORDER BY e.sequence LIMIT 100').all(after,actor.id,actor.id,actor.id);}
}
