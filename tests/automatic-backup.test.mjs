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
import {AutomaticBackup} from '../web/automatic-backup.js';
import {SessionScope} from '../web/session-scope.js';
import {showBackup} from '../web/backup-ui.js';
const fixture=()=>{
 let info=null,stored=0,resets=0;
 const crypto={getKeyBackupInfo:async()=>info,getActiveSessionBackupVersion:async()=>info?.version||null,resetKeyBackup:async()=>{resets++;info={version:'1',algorithm:'m.megolm_backup.v1.curve25519-aes-sha2',auth_data:{public_key:'public'}};},getSessionBackupPrivateKey:async()=>new Uint8Array(32).fill(1),storeSessionBackupPrivateKey:async()=>{stored++;},checkKeyBackupAndEnable:async()=>{},restoreKeyBackup:async()=>({total:2,imported:2})};
 const scope=new SessionScope();scope.begin();
 const client={getCrypto:()=>crypto,http:{authedRequest:async(method,path)=>{assert.equal(method,'POST');assert.equal(path,'/room_keys/version');resets++;info={version:'1',algorithm:'m.megolm_backup.v1.curve25519-aes-sha2',auth_data:{public_key:'public'}};return {version:'1'};}}};
 return {backup:new AutomaticBackup({client,scope,publicKey:()=> 'public'}),client,crypto,setInfo:v=>info=v,counts:()=>({stored,resets}),scope};
};
test('automatic backup creation returns standard recovery key but refuses overwriting an existing backup',async()=>{
 const f=fixture();const key=f.backup.prepare();assert.ok(key.length>32);assert.deepEqual(f.counts(),{stored:0,resets:0});
 await f.backup.activate(key);assert.equal(f.counts().resets,1);await assert.rejects(f.backup.activate(key),/existe/);assert.equal(f.counts().resets,1);
});
test('restoration checks the public key before trusting and storing a supplied recovery key',async()=>{
 const f=fixture();const code=f.backup.prepare();await f.backup.activate(code);
 f.setInfo({version:'2',algorithm:'m.megolm_backup.v1.curve25519-aes-sha2',auth_data:{public_key:'different'}});
 await assert.rejects(f.backup.restore(code),/correspond/);assert.equal(f.counts().stored,1);
 f.setInfo({version:'1',algorithm:'m.megolm_backup.v1.curve25519-aes-sha2',auth_data:{public_key:'public'}});
 assert.equal((await f.backup.restore(code)).imported,2);assert.equal(f.counts().stored,2);
 await assert.rejects(f.backup.restore('invalid'),/récupération/);
});
test('late backup results cannot reveal a recovery key after account switch',async()=>{
 const f=fixture();let done;f.client.http.authedRequest=()=>new Promise(r=>done=r);
 const result=f.backup.activate(f.backup.prepare());await new Promise(r=>setImmediate(r));f.scope.begin();done();await assert.rejects(result,/Session/);
});
test('a code conserved before activation can recover a backup even if local key storage fails',async()=>{
 const f=fixture(),code=f.backup.prepare(),save=f.crypto.storeSessionBackupPrivateKey;
 f.crypto.storeSessionBackupPrivateKey=async()=>{throw Error('storage interrupted');};
 await assert.rejects(f.backup.activate(code),/interrupted/);assert.equal(f.counts().resets,1);
 f.crypto.storeSessionBackupPrivateKey=save;
 assert.equal((await f.backup.restore(code)).imported,2);
});
test('closing the dialog during status lookup does not publish late controls',async()=>{
 const f=fixture();let resolve;f.crypto.getKeyBackupInfo=()=>new Promise(done=>resolve=done);
 const previous=globalThis.document,modal={open:true};globalThis.document={getElementById:()=>modal};
 const body={isConnected:true,append(){}};let buttons=0;
 try{
  const result=showBackup({messenger:{scope:f.scope,client:f.client},dialog:()=>body,el:()=>({}),button:()=>{buttons++;},field(){},download(){},notice(){}});
  await new Promise(r=>setImmediate(r));modal.open=false;resolve(null);
  await assert.rejects(result,/fermée/);assert.equal(buttons,0);assert.equal(f.counts().resets,0);
 }finally{globalThis.document=previous;}
});

test('backup code rotation restores old keys and never deletes an existing backup',async()=>{
 const f=fixture(),code=f.backup.prepare();await f.backup.activate(code);const calls=[];
 f.crypto.restoreKeyBackup=async()=>{calls.push('restore');return {total:2,imported:2};};
 f.client.http.authedRequest=async()=>{calls.push('create');f.setInfo({version:'2',algorithm:'m.megolm_backup.v1.curve25519-aes-sha2',auth_data:{public_key:'public'}});return {version:'2'};};
 f.crypto.deleteKeyBackupVersion=async()=>{throw Error('Must not delete existing history');};
 const result=await f.backup.rotate(f.backup.prepare(),'1');assert.deepEqual(calls,['restore','create']);assert.deepEqual(result,{version:'2',previousVersion:'1'});
});

test('rotation refuses inactive or concurrently replaced backup before creating anything',async()=>{
 const f=fixture(),code=f.backup.prepare();await f.backup.activate(code);
 await assert.rejects(f.backup.rotate(code,'different'),/changé/);assert.equal(f.counts().resets,1);
 f.crypto.getActiveSessionBackupVersion=async()=>null;await assert.rejects(f.backup.rotate(code,'1'),/Restaurez/);assert.equal(f.counts().resets,1);
 f.crypto.getActiveSessionBackupVersion=async()=> '1';f.crypto.restoreKeyBackup=async()=>{f.setInfo({version:'2'});return {};};
 await assert.rejects(f.backup.rotate(code,'1'),/autre appareil/);assert.equal(f.counts().resets,1);
});

test('stopping backup deletes only the confirmed version and detects a remaining backup',async()=>{
 const f=fixture(),code=f.backup.prepare();await f.backup.activate(code);const deleted=[];
 f.crypto.deleteKeyBackupVersion=async version=>{deleted.push(version);f.setInfo(null);};
 await assert.rejects(f.backup.stop('old'),/changé/);assert.deepEqual(deleted,[]);
 assert.deepEqual(await f.backup.stop('1'),{stopped:true,remainingVersion:null});assert.deepEqual(deleted,['1']);
 f.setInfo({version:'2'});f.crypto.deleteKeyBackupVersion=async version=>{deleted.push(version);f.setInfo({version:'3'});};
 assert.deepEqual(await f.backup.stop('2'),{stopped:false,remainingVersion:'3'});assert.deepEqual(deleted,['1','2']);
});

test('stopAll removes older server versions but preserves a newer concurrent version',async()=>{
 const f=fixture();f.setInfo({version:'3'});const deleted=[];
 f.crypto.deleteKeyBackupVersion=async version=>{deleted.push(version);f.setInfo(version==='3'?{version:'2'}:null);};
 assert.deepEqual(await f.backup.stopAll('3'),{stopped:true,remainingVersion:null,deleted:2});assert.deepEqual(deleted,['3','2']);
 f.setInfo({version:'4'});f.crypto.deleteKeyBackupVersion=async version=>{deleted.push(version);f.setInfo({version:'5'});};
 assert.deepEqual(await f.backup.stopAll('4'),{stopped:false,remainingVersion:'5',deleted:1});assert.equal(deleted.includes('5'),false);
});
