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
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const methods=new Set(['status','login','rooms','join','send','read','listen','ack','coordination','knowledge']);
export class NativeBridge extends EventEmitter{
 constructor({env=process.env,executable=env.POLYTALK_AGENT_BINARY||fileURLToPath(new URL('../target/release/polytalk-agent'+(process.platform==='win32'?'.exe':''),import.meta.url)),spawnImpl=spawn}={}){
  super();this.pending=new Map();this.buffer='';this.closed=false;
  const childEnv={};for(const key of ['PATH','Path','SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','POLYTALK_ORIGIN','POLYTALK_AGENT_STORE','POLYTALK_AGENT_PASSWORD'])if(env[key]!==undefined)childEnv[key]=env[key];
  this.child=spawnImpl(executable,[],{shell:false,windowsHide:true,env:childEnv,stdio:['pipe','pipe','pipe']});
  this.ended=new Promise(resolve=>{const end=()=>{this.exited=true;resolve();};this.child.once('exit',end);this.child.once('error',end);});
  this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',chunk=>this.consume(chunk));
  // Native diagnostics never enter MCP stdout or expose message contents.
  this.child.stderr.on('data',()=>{});
  this.child.on('error',()=>this.fail('CONNECTOR_UNAVAILABLE'));this.child.on('exit',()=>this.fail('CONNECTOR_STOPPED'));
  this.child.stdin.on('error',()=>this.fail('CONNECTOR_UNAVAILABLE'));
 }
 consume(chunk){
  if(this.closed)return;
  this.buffer+=chunk;if(this.buffer.length>8*1024*1024){this.fail('CONNECTOR_OUTPUT_TOO_LARGE');this.child.kill();return;}
  let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);let value;try{value=JSON.parse(line);}catch{this.fail('CONNECTOR_PROTOCOL_ERROR');this.child.kill();return;}
   if(value.v!==1){this.fail('CONNECTOR_PROTOCOL_ERROR');return;}
   if(value.event==='message.available'){this.emit('message.available',value);continue;}
   const pending=this.pending.get(value.id);if(!pending)continue;this.pending.delete(value.id);clearTimeout(pending.timer);
   if(value.error){const code=['RATE_LIMITED','AUTH_REQUIRED','ACCESS_DENIED','HISTORY_KEYS_PENDING','OPERATION_TIMEOUT'].includes(value.error.code)?value.error.code:'OPERATION_FAILED';pending.reject(Error(code));}else pending.resolve(value.result);
  }
 }
 call(method,params={}){
  if(!methods.has(method))return Promise.reject(Error('UNSUPPORTED_METHOD'));
  if(this.closed)return Promise.reject(Error('CONNECTOR_STOPPED'));if(this.pending.size>=64)return Promise.reject(Error('CONNECTOR_BUSY'));
  const id=randomUUID(),line=JSON.stringify({v:1,id,method,params})+'\n';if(Buffer.byteLength(line)>65536)return Promise.reject(Error('REQUEST_TOO_LARGE'));
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('DELIVERY_UNKNOWN_OR_TIMEOUT'));},65000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(line);});
 }
 fail(code){this.closed=true;for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(Error(code));}this.pending.clear();}
 close(){
  if(this.closing)return this.closing;
  this.fail('CONNECTOR_STOPPED');
  this.closing=(async()=>{
   if(this.exited)return;
   const force=setTimeout(()=>this.child.kill(),1000);force.unref();let deadline;
   try{this.child.stdin.end();await Promise.race([this.ended,new Promise((resolve,reject)=>{deadline=setTimeout(()=>reject(Error('CONNECTOR_SHUTDOWN_TIMEOUT')),5000);deadline.unref();})]);}
   finally{clearTimeout(force);clearTimeout(deadline);}
  })();
  return this.closing;
 }
}
