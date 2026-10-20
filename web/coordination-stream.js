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
export class CoordinationFrames{
 constructor(receive){this.receive=receive;this.buffer='';}
 push(text){
  this.buffer+=text;let match;
  while((match=/\r?\n\r?\n/.exec(this.buffer))){const frame=this.buffer.slice(0,match.index);this.buffer=this.buffer.slice(match.index+match[0].length);if(frame.length>65536)throw Error('Événement trop volumineux.');
   const fields={event:'message',data:''};for(const line of frame.split(/\r?\n/)){if(!line||line.startsWith(':'))continue;const colon=line.indexOf(':'),key=colon<0?line:line.slice(0,colon),value=colon<0?'':line.slice(colon+1).replace(/^ /,'');if(key==='data')fields.data+=(fields.data?'\n':'')+value;else if(key==='event'||key==='id')fields[key]=value;}
   if(fields.data)this.receive(fields);
  }
  if(this.buffer.length>65536)throw Error('Événement trop volumineux.');
 }
 finish(){if(this.buffer.trim())throw Error('Flux incomplet.');}
}
const states=new Set(['assigned','running','awaiting_approval','completed','failed','cancelled','expired']);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function validatedEvent(value){
 const fields=['sequence','id','task_id','actor_id','type','state','version','created_at'];
 if(!value||typeof value!=='object'||Object.keys(value).some(key=>!fields.includes(key))||!Number.isSafeInteger(value.sequence)||value.sequence<1||!uuid(value.id)||!uuid(value.task_id)||!(uuid(value.actor_id)||value.actor_id==='system')||typeof value.type!=='string'||!/^(task\.(assigned|running|awaiting_approval|completed|failed|cancelled|expired)|delegation\.(allow|ask|never)|approval\.(requested|approved|rejected))$/.test(value.type)||!states.has(value.state)||!Number.isSafeInteger(value.version)||value.version<1||typeof value.created_at!=='string'||value.created_at.length>40||!Number.isFinite(Date.parse(value.created_at)))throw Error('Événement de coordination invalide.');
 return Object.freeze({...value});
}
function wait(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(Error('Arrêté.'));return;}const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);resolve();},abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(Error('Arrêté.'));},timer=setTimeout(done,ms);signal.addEventListener('abort',abort,{once:true});});}
export function watchCoordination({scope,token,check=()=>{},onEvent,onStatus,fetchImpl=fetch,sleep=wait}){
 const generation=scope.generation,controller=new AbortController();let cursor=0,failures=0;
 const active=()=>{if(controller.signal.aborted||!scope.current(generation))return false;try{check();return true;}catch{return false;}};
 const publish=status=>{if(active())onStatus(status);};
 const stop=()=>controller.abort();
 const done=(async()=>{
  while(active()){
   let reader,timer,connection,signal,cancel;
   try{
    publish('connecting');connection=new AbortController();signal=AbortSignal.any([controller.signal,connection.signal]);timer=setTimeout(()=>connection.abort(),45000);
    const response=await fetchImpl('/api/coordination/events?stream=1&after='+cursor,{headers:{Authorization:'Bearer '+token,Accept:'text/event-stream'},credentials:'same-origin',cache:'no-store',redirect:'error',signal});
    if(!active()){await response.body?.cancel();return;}
    if(response.status===401||response.status===403){await response.body?.cancel();publish('authentication');return;}
    if(!response.ok||!response.headers.get('content-type')?.startsWith('text/event-stream')||!response.body){await response.body?.cancel();throw Error('Flux indisponible.');}
    publish('connected');const decoder=new TextDecoder('utf-8',{fatal:true});
    const parser=new CoordinationFrames(frame=>{
     if(!active())return;
     if(frame.event==='cursor'){const value=JSON.parse(frame.data);if(!value||Object.keys(value).length!==1||!Number.isSafeInteger(value.next)||value.next<cursor)throw Error('Curseur invalide.');cursor=value.next;}
     else if(frame.event==='coordination'){const event=validatedEvent(JSON.parse(frame.data));if(frame.id!==undefined&&frame.id!==String(event.sequence))throw Error('Séquence invalide.');if(event.sequence<=cursor)return;onEvent(event);if(active())cursor=event.sequence;}
    });
    reader=response.body.getReader();cancel=()=>reader.cancel().catch(()=>{});signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
    while(active()&&!signal.aborted){const chunk=await reader.read();if(!active())return;if(signal.aborted)throw Error('Flux interrompu.');if(chunk.done)break;parser.push(decoder.decode(chunk.value,{stream:true}));}
    if(!active())return;if(signal.aborted)throw Error('Flux interrompu.');parser.push(decoder.decode());parser.finish();failures=0;
   }catch{
    if(!active())return;failures++;if(failures>5){publish('failed');return;}publish('retrying');
   }finally{clearTimeout(timer);if(signal&&cancel)signal.removeEventListener('abort',cancel);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
   try{await sleep(failures?Math.min(30000,1000*2**(failures-1)):1000,controller.signal);}catch{return;}
  }
 })();
 return {stop,done};
}
