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
import {SessionScope} from './session-scope.js';
import {ConversationCreation} from './conversation-creation.js';
import {createClient,ClientEvent,RoomEvent,MatrixEventEvent} from 'matrix-js-sdk';
import {CryptoEvent} from 'matrix-js-sdk/lib/crypto-api/CryptoEvent.js';
import {logger} from 'matrix-js-sdk/lib/logger.js';
import {initAsync,Attachment,EncryptedAttachment} from '@matrix-org/matrix-sdk-crypto-wasm';
import {protectRoomKeys,restoreRoomKeys} from './key-transfer.js';
import {ClientState,validateResume,acceptsSender} from './client-state.js';
logger.setLevel('silent');
export class Messenger extends EventTarget {
  connectionGeneration=null;
  scope=new SessionScope(); state=new ClientState(); pendingPolicy=new Set(); client=null; session=null; policy=null; release=null;
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}));}
  status(value){this.state.transition(value);this.emit('status',value);}
  async api(path,method='GET',data){
    const token=this.scope.generation,session=this.session;
    const response=await fetch('/api'+path,{method,headers:{...(this.session?{Authorization:'Bearer '+this.session.accessToken}:{}),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});
    this.scope.assert(token);
    if(response.status===401&&session&&this.session===session){
      this.lock();this.emit('session-expired');
      throw Error('Votre session a expiré. Connectez-vous à nouveau.');
    }
    const result=await response.json();this.scope.assert(token);if(!response.ok)throw Error(result.error||'Requête refusée.');return result;
  }
  async login(username,password){
    const config=await this.api('/config');
    const data=await this.completeAuthentication(await this.api('/auth/password','POST',{username,password}));
    return {userId:data.user_id,deviceId:data.device_id,accessToken:data.access_token,baseUrl:config.matrixBase,prefix:'polytalk-'+crypto.randomUUID()};
  }
  async completeAuthentication(data){if(data.mfaRequired){if(!this.requestSecondFactor)throw Error('Validation en deux étapes requise.');return this.requestSecondFactor(data);}return data;}
  async connect(session,storagePassword){
    if(storagePassword.length<12)throw Error('Phrase de coffre : 12 caractères minimum.');
    if(!navigator.locks||!indexedDB.databases)throw Error('Ce navigateur doit prendre en charge Web Locks et IndexedDB.databases. Utilisez un navigateur récent.');
    if(this.client||this.release)this.lock();
    const token=this.scope.begin();
    const active=()=>this.scope.current(token);
    this.status('connecting');
    await new Promise((resolve,reject)=>{
      navigator.locks.request(session.prefix,{ifAvailable:true},async lock=>{
        if(!active()){reject(Error('Session expirée.'));return;}
        if(!lock){reject(Error('Cet appareil est déjà ouvert dans un autre onglet. Fermez-le puis réessayez.'));return;}
        await new Promise(done=>{this.release=done;resolve();});
      }).catch(reject);
    });
    try{
      const dbs=await indexedDB.databases();this.scope.assert(token);
      const expected=[session.prefix+'::matrix-sdk-crypto',session.prefix+'::matrix-sdk-crypto-meta'];
      const exists=expected.every(name=>dbs.some(db=>db.name===name));
      if(session.identity)validateResume(session,exists,session.identity);
      await initAsync(__POLYTALK_CRYPTO_WASM__);this.scope.assert(token);
      this.session=session;
      this.client=createClient({baseUrl:session.baseUrl,accessToken:session.accessToken,userId:session.userId,deviceId:session.deviceId,verificationMethods:['m.sas.v1']});
      const client=this.client;
      await client.initRustCrypto({useIndexedDB:true,cryptoDatabasePrefix:session.prefix,storagePassword});
      this.scope.assert(token);
      const keys=await client.getCrypto().getOwnDeviceKeys();this.scope.assert(token);
      if(session.identity)validateResume(session,exists,keys.curve25519);
      session.identity=keys.curve25519;session.fingerprint=keys.ed25519;
      const me=await this.api('/me');this.scope.assert(token);this.policy=me.policy;this.profile=me.profile;
      this.client.on(ClientEvent.Sync,(value)=>{
        if(!active())return;
        if(value==='PREPARED'||value==='SYNCING')this.status('ready');
        if(value==='ERROR'||value==='RECONNECTING')this.status('offline');
        this.emit('change');
      });
      this.client.on(RoomEvent.Timeline,(event,room,toStart,removed,data)=>{
        if(!active())return;
        if(!toStart&&!removed&&data?.liveEvent){
          this.pendingPolicy.add(event.getId());
          this.receive(event,room).catch(()=>{}).finally(()=>{if(!active())return;this.pendingPolicy.delete(event.getId());this.emit('change');});
        }
        this.emit('change');
      });
      this.client.on(MatrixEventEvent.Decrypted,()=>{if(active())this.emit('change');});
      this.client.on(RoomEvent.MyMembership,()=>{if(active())this.emit('change');});
      this.client.on(CryptoEvent.VerificationRequestReceived,request=>{if(active())this.emit('verification',request);});
      this.status('syncing');await this.client.startClient({initialSyncLimit:50,lazyLoadMembers:true});
      this.scope.assert(token);this.connectionGeneration=token;return session;
    }catch(error){if(active())this.lock();throw error;}
  }
  lock(){this.scope.begin();this.connectionGeneration=null;this.client?.removeAllListeners();this.client?.stopClient();this.pendingPolicy.clear();this.profile=null;this.client=null;this.session=null;this.policy=null;this.release?.();this.release=null;this.status('locked');}
  async markRead(roomId){
    const token=this.scope.generation,client=this.client,room=client?.getRoom(roomId);
    if(room?.getMyMembership()!=='join')return;
    const event=room.getLiveTimeline().getEvents().findLast(event=>event.getId()?.startsWith('$'));
    if(!event)return;
    await client.sendReadReceipt(event);this.scope.assert(token);
    if(room.getLiveTimeline().getEvents().findLast(item=>item.getId()?.startsWith('$'))?.getId()!==event.getId())return;
    room.setUnreadNotificationCount('total',0);room.setUnreadNotificationCount('highlight',0);this.emit('change');
  }
  async refreshPolicy(){const token=this.scope.generation;try{const policy=await this.api('/policy');this.scope.assert(token);this.policy=policy;}catch(error){if(this.scope.current(token))this.policy=null;throw error;}}
  async receive(event,room){
    const token=this.scope.generation,client=this.client;
    if(event.getType()==='m.room.encrypted')await client.decryptEventIfNeeded(event);
    this.scope.assert(token);
    if(event.getType()!=='m.room.message'||event.getSender()===this.session?.userId)return;
    await this.refreshPolicy();this.scope.assert(token);if(!acceptsSender(this.policy,event.getSender()))return;
    this.emit('incoming',{event,room});
    await this.api('/receipts','POST',{eventId:event.getId(),roomId:room.roomId,state:'received'});
  }
  rooms(){return this.client?.getRooms().filter(room=>['join','invite'].includes(room.getMyMembership())).sort((a,b)=>b.getLastActiveTimestamp()-a.getLastActiveTimestamp())||[];}
  messages(roomId){
    return (this.client?.getRoom(roomId)?.getLiveTimeline().getEvents()||[]).filter(event=>
      ['m.room.message','m.room.encrypted'].includes(event.getType())&&(event.getSender()===this.session?.userId||acceptsSender(this.policy,event.getSender(),this.pendingPolicy.has(event.getId()))));
  }
  guard(roomId){
    this.state.assertSend();
    if(!this.client?.getCrypto()||!this.client.isRoomEncrypted(roomId)||this.client.getRoom(roomId)?.getMyMembership()!=='join')throw Error('Salon chiffré rejoint requis. Aucun envoi en clair autorisé.');
  }
  async sendText(roomId,body){this.guard(roomId);if(!body.trim()||body.length>20000)throw Error('Message vide ou trop long (20 000 caractères).');const token=this.scope.generation,client=this.client,result=await client.sendTextMessage(roomId,body);this.scope.assert(token);return result;}
  async createConversation(members,name=''){
    this.state.assertSend();if(!members.length||members.length>99||members.some(id=>!/^@[^\s:]+:[^\s]+$/.test(id)))throw Error('Indiquez des adresses Matrix complètes valides.');
    const token=this.scope.generation,client=this.client;
    const creation=this.conversationCreation();
    return creation.create(client,{visibility:'private',preset:'private_chat',is_direct:members.length===1,invite:[...new Set(members)],...(name?{name}:{}),creation_content:{'m.federate':false},initial_state:[{type:'m.room.encryption',state_key:'',content:{algorithm:'m.megolm.v1.aes-sha2'}}]},()=>this.scope.assert(token));
  }
  conversationCreation(){if(!this.session)throw Error('Session verrouillée.');return new ConversationCreation({storage:localStorage,account:[this.session.baseUrl,this.session.userId]});}
  recoverConversation(){this.state.assertSend();const token=this.scope.generation;return this.conversationCreation().recover(this.client,()=>this.scope.assert(token));}
  async sendFile(roomId,file){
    this.guard(roomId);if(file.size>10*1024*1024)throw Error('La taille maximale est de 10 Mio.');
    const token=this.scope.generation,client=this.client;
    const bytes=new Uint8Array(await file.arrayBuffer());this.scope.assert(token);
    const attachment=Attachment.encrypt(bytes);
    try{
      const info=JSON.parse(attachment.mediaEncryptionInfo);
      const uploaded=await client.uploadContent(new Blob([attachment.encryptedData],{type:'application/octet-stream'}),{type:'application/octet-stream',includeFilename:false});
      this.scope.assert(token);
      const result=await client.sendMessage(roomId,{msgtype:'m.file',body:file.name,file:{...info,url:uploaded.content_uri},info:{size:file.size,mimetype:file.type||'application/octet-stream'}});this.scope.assert(token);return result;
    }finally{attachment.free();}
  }
  async download(content){
    const token=this.scope.generation;
    if(!content.file?.url||content.info?.size>10*1024*1024)throw Error('Pièce jointe non chiffrée ou trop volumineuse.');
    const match=/^mxc:\/\/([^/]+)\/([^/]+)$/.exec(content.file.url);if(!match)throw Error('Adresse de média invalide.');
    const response=await fetch('/_matrix/client/v1/media/download/'+encodeURIComponent(match[1])+'/'+encodeURIComponent(match[2]),{headers:{Authorization:'Bearer '+this.session.accessToken}});
    if(!response.ok)throw Error('Téléchargement refusé.');
    const reader=response.body.getReader();const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();this.scope.assert(token);if(done)break;size+=value.length;if(size>10*1024*1024+1024){await reader.cancel();throw Error('Fichier trop volumineux.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const attachment=new EncryptedAttachment(bytes,JSON.stringify(content.file));
    try{return new Blob([Attachment.decrypt(attachment)],{type:'application/octet-stream'});}finally{attachment.free();}
  }
  async exportKeys(passphrase){const token=this.scope.generation,client=this.client;const json=await client.getCrypto().exportRoomKeysAsJson();this.scope.assert(token);const armored=await protectRoomKeys(json,passphrase);this.scope.assert(token);return armored;}
  async importKeys(armored,passphrase){const token=this.scope.generation,client=this.client;const json=await restoreRoomKeys(armored,passphrase);this.scope.assert(token);await client.getCrypto().importRoomKeysAsJson(json);this.scope.assert(token);this.emit('change');}
  async verifyDevice(userId,deviceId){const token=this.scope.generation,client=this.client,result=await client.getCrypto().requestDeviceVerification(userId,deviceId);this.scope.assert(token);return result;}
}



