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
import {createServer} from 'node:http';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {NativeBridge} from './bridge.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const identifier=value=>typeof value==='string'&&value.length>0&&Buffer.byteLength(value)<=255&&!/[\s\p{Cc}\p{Cf}]/u.test(value);
// Owner-local relay profile: one credential, one preselected encrypted Matrix room.
// No remote URLs, model execution, task lifecycle or automatic delivery retry.
export function createA2aServer({bridge,token,roomId}){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43,256}$/.test(token))throw Error('A2A credential must contain at least 43 random URL-safe characters.');
 if(!identifier(roomId)||!roomId.startsWith('!'))throw Error('An operator-selected Matrix room is required.');
 const digest=value=>createHash('sha256').update(value).digest(),expected=digest(`Bearer ${token}`);
 let active=0,windowStart=Date.now(),requests=0;
 const server=createServer(async(req,res)=>{
  const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){reply(403,{error:'Local access required'});return;}
  if(req.headers.origin){reply(403,{error:'Browser requests are not supported'});return;}
  if(Date.now()-windowStart>60000){windowStart=Date.now();requests=0;}if(++requests>90){reply(429,{error:'Rate limit'});return;}
  const address=server.address(),base=`http://127.0.0.1:${address.port}`;
  if(req.method==='GET'&&req.url==='/.well-known/agent-card.json'){
   reply(200,{name:'PolyTalk local Matrix relay',description:'Owner-authorized text relay to one configured encrypted room. Returns a transport receipt, never a peer or model reply. No tasks or durable A2A deduplication.',version:'0.1.0',supportedInterfaces:[{url:base+'/rpc',protocolBinding:'JSONRPC',protocolVersion:'1.0'}],capabilities:{streaming:false,pushNotifications:false,extendedAgentCard:false},securitySchemes:{owner:{httpAuthSecurityScheme:{scheme:'bearer'}}},securityRequirements:[{schemes:{owner:{list:[]}}}],defaultInputModes:['text/plain'],defaultOutputModes:['text/plain'],skills:[{id:'matrix-text-relay',name:'Encrypted room text relay',description:'Send text through the local authenticated Matrix endpoint.',tags:['messaging','matrix']}]});return;
  }
  if(req.method!=='POST'||req.url!=='/rpc'){reply(404,{error:'Not found'});return;}
  if(!timingSafeEqual(digest(req.headers.authorization||''),expected)){reply(401,{error:'Authentication required'});return;}
  if(req.headers['a2a-version']&&req.headers['a2a-version']!=='1.0'){reply(400,{error:'Unsupported A2A version',supportedVersions:['1.0']});return;}
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')){reply(415,{error:'JSON required'});return;}
  if(active>=4){reply(429,{error:'Busy'});return;}active++;
  let id=null;
  const rpcError=(code,message)=>reply(200,{jsonrpc:'2.0',id,error:{code,message}});
  try{
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536){reply(413,{error:'Request too large'});return;}chunks.push(chunk);}
   let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{rpcError(-32700,'Parse error');return;}
   if(!keys(request,['jsonrpc','id','method','params'])||request.jsonrpc!=='2.0'||!(typeof request.id==='string'&&request.id.length<=255||Number.isSafeInteger(request.id))){rpcError(-32600,'Invalid request');return;}id=request.id;
   if(request.method!=='SendMessage'){rpcError(-32601,'Method not supported by this relay profile');return;}
   const p=request.params,m=p?.message;
   if(!keys(p,['message'])||!keys(m,['messageId','contextId','role','parts'])||!identifier(m.messageId)||(m.contextId!==undefined&&!identifier(m.contextId))||m.role!=='ROLE_USER'||!Array.isArray(m.parts)||m.parts.length!==1||!keys(m.parts[0],['text'])||typeof m.parts[0].text!=='string'||!m.parts[0].text.trim()||Buffer.byteLength(m.parts[0].text)>20000){rpcError(-32602,'Only one text part without extensions, tasks or configuration is supported');return;}
   const sent=await bridge.call('send',{room_id:roomId,text:m.parts[0].text});
   reply(200,{jsonrpc:'2.0',id,result:{message:{messageId:randomUUID(),contextId:m.contextId||randomUUID(),role:'ROLE_AGENT',parts:[{text:'Message submitted to Matrix. This receipt does not mean that a recipient has read or processed it.'}],metadata:{matrixEventId:sent.event_id}}}});
  }catch{if(!res.headersSent)rpcError(-32603,'Delivery refused or indeterminate. Do not retry automatically.');}
  finally{active--;}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=32;
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const port=Number(process.env.POLYTALK_A2A_PORT||3211);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid A2A port');
 // Validate configuration before starting the native process.
 const config={token:process.env.POLYTALK_A2A_TOKEN,roomId:process.env.POLYTALK_A2A_ROOM};
 const bridge={call:(...args)=>native.call(...args)};const server=createA2aServer({...config,bridge});const native=new NativeBridge();
 let stopping;const stop=()=>stopping??=Promise.all([native.close(),server.listening?new Promise(resolve=>server.close(resolve)):Promise.resolve()]);
 const shutdown=()=>{stop().catch(()=>{process.exitCode=1;});};server.on('error',()=>{process.exitCode=1;shutdown();});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,shutdown);
 server.listen(port,'127.0.0.1');
}
