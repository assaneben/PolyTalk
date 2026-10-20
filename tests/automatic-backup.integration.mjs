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
import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {randomBytes} from 'node:crypto';
import {createClient,ClientEvent,MatrixEvent} from 'matrix-js-sdk';
import {logger} from 'matrix-js-sdk/lib/logger.js';
import {saveRecoveryPhrase,readRecoveryPhrase} from '../web/recovery-phrase.js';
import {generateProtectionPhrase} from '../web/passphrase-generator.js';
import {AutomaticBackup} from '../web/automatic-backup.js';
import {SessionScope} from '../web/session-scope.js';
logger.setLevel('silent');
test('real Matrix backup restores and decrypts history by protection phrase on another device',{timeout:900000},async t=>{
 const origin='http://localhost:3210',env=parseEnv(await readFile('.env','utf8')),username='backupqa'+randomBytes(5).toString('hex'),password=randomBytes(24).toString('base64url');
 const tokens=[],clients=[];
 async function request(path,token,method='GET',data){for(let attempt=0;attempt<5;attempt++){const r=await fetch(origin+path,{method,signal:AbortSignal.timeout(15000),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});if(r.status===429&&attempt<4){console.info('[backup-qa] Server rate limit; waiting before retry');await r.arrayBuffer();await new Promise(resolve=>setTimeout(resolve,30000));continue;}assert.ok(r.ok,'Unexpected HTTP '+r.status+' for '+path);return r.json();}}
 t.after(async()=>{for(const client of clients)client.stopClient();for(const token of tokens)await fetch(origin+'/_matrix/client/v3/logout',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'}).catch(()=>{});});
 console.info('[backup-qa] Creating isolated QA account');
 await request('/api/register',null,'POST',{username,password,name:username,kind:'human',code:env.SIGNUP_CODE});
 const silent={trace(){},debug(){},info(){},warn(){},error(){},getChild(){return this;}};
 async function device(sync){
  const session=await request('/_matrix/client/v3/login',null,'POST',{type:'m.login.password',identifier:{type:'m.id.user',user:username},password});tokens.push(session.access_token);
  const client=createClient({baseUrl:origin,userId:session.user_id,deviceId:session.device_id,accessToken:session.access_token,logger:silent});clients.push(client);await client.initRustCrypto({useIndexedDB:false});
  if(sync){
   let timer,changed;const prepared=new Promise((resolve,reject)=>{changed=s=>{if(s==='PREPARED'||s==='SYNCING')resolve();};timer=setTimeout(()=>reject(Error('QA synchronization not prepared within 60 seconds; state='+client.getSyncState())),60000);client.on(ClientEvent.Sync,changed);});
   try{await Promise.all([client.startClient({initialSyncLimit:10}),prepared]);}finally{clearTimeout(timer);client.removeListener(ClientEvent.Sync,changed);}
  }
  const scope=new SessionScope();scope.begin();return {client,session,scope,backup:new AutomaticBackup({client,scope})};
 }
 const first=await device(true);console.info('[backup-qa] First device synchronized');assert.equal((await first.backup.status()).exists,false);
 const room=await first.client.createRoom({visibility:'private',preset:'private_chat',creation_content:{'m.federate':false},initial_state:[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}}]});
 const end=Date.now()+20000;while(!first.client.isRoomEncrypted(room.room_id)&&Date.now()<end)await new Promise(r=>setTimeout(r,500));
 assert.equal(first.client.isRoomEncrypted(room.room_id),true);
 const sent=await first.client.sendTextMessage(room.room_id,'Private backup qualification payload');
 const key=first.backup.prepare();assert.ok(key.length>32);assert.equal((await first.backup.status()).exists,false);await first.backup.activate(key);console.info('[backup-qa] Initial backup activated');await assert.rejects(first.backup.activate(key),/existe/);
 let info;const until=Date.now()+45000;
 do{info=await request('/_matrix/client/v3/room_keys/version',first.session.access_token);if(info.count>0)break;await new Promise(r=>setTimeout(r,1200));}while(Date.now()<until);
 assert.ok(info.count>0,'SDK must actually upload an encrypted session');console.info('[backup-qa] Initial encrypted keys uploaded');
 const data=await request('/_matrix/client/v3/room_keys/keys?version='+encodeURIComponent(info.version),first.session.access_token);
 assert.equal(JSON.stringify(data).includes('Private backup qualification payload'),false);
 const phrase=generateProtectionPhrase();await saveRecoveryPhrase({client:first.client,scope:first.scope,phrase,code:key,version:info.version});
 const second=await device(false);console.info('[backup-qa] Second fresh device initialized');
 assert.equal(await second.client.getCrypto().getSessionBackupPrivateKey(),null);
 const recovered=await readRecoveryPhrase({client:second.client,scope:second.scope,phrase,version:info.version});assert.equal(recovered,key);
 const restored=await second.backup.restore(recovered);assert.ok(restored.imported>0);assert.equal((await second.backup.status()).active,true);console.info('[backup-qa] Second device restored history');
 const encryptedEvent=await request('/_matrix/client/v3/rooms/'+encodeURIComponent(room.room_id)+'/event/'+encodeURIComponent(sent.event_id),second.session.access_token);
 assert.equal(encryptedEvent.type,'m.room.encrypted');assert.equal(encryptedEvent.content.body,undefined);
 const recoveredEvent=new MatrixEvent(encryptedEvent);await second.client.decryptEventIfNeeded(recoveredEvent);
 assert.equal(recoveredEvent.isDecryptionFailure(),false);assert.equal(recoveredEvent.getContent().body,'Private backup qualification payload');
 // Rotate without deleting the previous version, then restore the new version
 // on a genuinely fresh device and decrypt the same historical ciphertext.
 const newCode=first.backup.prepare();console.info('[backup-qa] Starting rotation');const rotated=await first.backup.rotate(newCode,info.version);assert.notEqual(rotated.version,info.version);console.info('[backup-qa] New backup version created');
 const rotationDeadline=Date.now()+45000;let currentBackup;
 do{currentBackup=await request('/_matrix/client/v3/room_keys/version',first.session.access_token);if(currentBackup.version===rotated.version&&currentBackup.count>0)break;await new Promise(r=>setTimeout(r,1200));}while(Date.now()<rotationDeadline);
 assert.equal(currentBackup.version,rotated.version);assert.ok(currentBackup.count>0,'Rotated backup must contain uploaded encrypted keys');console.info('[backup-qa] Rotated encrypted keys uploaded');
 const previousBackup=await request('/_matrix/client/v3/room_keys/version/'+encodeURIComponent(info.version),first.session.access_token);assert.equal(previousBackup.version,info.version);
 const third=await device(false);assert.equal(await third.client.getCrypto().getSessionBackupPrivateKey(),null);
 await assert.rejects(third.backup.restore(key),/correspond/);await assert.rejects(readRecoveryPhrase({client:third.client,scope:third.scope,phrase,version:rotated.version}),/version/);
 assert.ok((await third.backup.restore(newCode)).imported>0);console.info('[backup-qa] Third device restored new backup');
 const afterRotation=new MatrixEvent(encryptedEvent);await third.client.decryptEventIfNeeded(afterRotation);assert.equal(afterRotation.isDecryptionFailure(),false);assert.equal(afterRotation.getContent().body,'Private backup qualification payload');
 const deletedCurrent=await first.backup.stop(rotated.version);assert.equal(deletedCurrent.stopped,false);assert.equal(deletedCurrent.remainingVersion,info.version);
 assert.equal((await first.backup.stopAll(info.version)).stopped,true);assert.equal((await first.backup.status()).exists,false);console.info('[backup-qa] All confirmed backup versions explicitly deleted');
 // Stopping a server backup cannot erase keys already restored on a device.
 const afterStop=new MatrixEvent(encryptedEvent);await third.client.decryptEventIfNeeded(afterStop);assert.equal(afterStop.getContent().body,'Private backup qualification payload');
 const inventory=await request('/api/security/devices',first.session.access_token);assert.equal(inventory.currentDeviceId,first.session.device_id);assert.ok(inventory.devices.some(d=>d.deviceId===second.session.device_id));
 await request('/api/security/devices/revoke',first.session.access_token,'POST',{password,deviceId:second.session.device_id});
 const rejected=await fetch(origin+'/_matrix/client/v3/account/whoami',{headers:{Authorization:'Bearer '+second.session.access_token}});assert.equal(rejected.status,401);
 assert.ok((await request('/api/security/devices',first.session.access_token)).devices.some(d=>d.deviceId===first.session.device_id));
});
