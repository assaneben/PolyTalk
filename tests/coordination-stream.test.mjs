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
import {CoordinationFrames,watchCoordination} from '../web/coordination-stream.js';
import {SessionScope} from '../web/session-scope.js';
const event={sequence:1,id:'11111111-1111-4111-8111-111111111111',task_id:'22222222-2222-4222-8222-222222222222',actor_id:'33333333-3333-4333-8333-333333333333',type:'task.running',state:'running',version:2,created_at:'2026-10-18T10:00:00.000Z'};
const frame=(e=event)=>'id: '+e.sequence+'\nevent: coordination\ndata: '+JSON.stringify(e)+'\n\n';
const response=text=>new Response(new TextEncoder().encode(text),{headers:{'Content-Type':'text/event-stream'}});
function setup(extra={}){const scope=new SessionScope();scope.begin();const statuses=[],events=[];return {scope,statuses,events,options:{scope,token:'secret-token',check(){},onEvent:e=>events.push(e),onStatus:s=>statuses.push(s),sleep:async()=>{},...extra}};}
test('SSE parser handles chunk boundaries and CRLF, rejects oversized or incomplete frames',()=>{
 const frames=[],p=new CoordinationFrames(f=>frames.push(f));const text=frame().replaceAll('\n','\r\n');for(const char of text)p.push(char);p.finish();assert.equal(frames.length,1);assert.equal(frames[0].event,'coordination');assert.equal(JSON.parse(frames[0].data).sequence,1);
 assert.throws(()=>new CoordinationFrames(()=>{}).push('x'.repeat(65537)),/volumineux/);
 const incomplete=new CoordinationFrames(()=>{});incomplete.push('data: {}');assert.throws(()=>incomplete.finish(),/incomplet/);
});
test('stream reconnects with cursor, deduplicates and sends credentials only in headers',async()=>{
 const f=setup();let calls=0,watch;const requests=[];
 watch=watchCoordination({...f.options,fetchImpl:async(url,options)=>{requests.push([url,options]);if(++calls===1)return response(frame()+'event: cursor\ndata: {"next":3}\n\n');if(calls===2)return response(frame({...event,sequence:3})+frame({...event,sequence:4}));watch.stop();throw Error('stopped');}});
 await watch.done;assert.deepEqual(f.events.map(e=>e.sequence),[1,4]);assert.ok(requests[1][0].endsWith('after=3'));assert.equal(requests[0][1].headers.Authorization,'Bearer secret-token');assert.equal(requests.some(([u])=>u.includes('secret-token')),false);assert.equal(requests[0][1].redirect,'error');
});
test('auth rejection stops without retry; transient failures have a bounded retry budget',async()=>{
 const f=setup();let calls=0;await watchCoordination({...f.options,fetchImpl:async()=>{calls++;return new Response('',{status:401});}}).done;assert.equal(calls,1);assert.ok(f.statuses.includes('authentication'));
 const g=setup();calls=0;await watchCoordination({...g.options,fetchImpl:async()=>{calls++;throw Error('network');}}).done;assert.equal(calls,6);assert.ok(g.statuses.includes('failed'));
});
test('stopping or locking while read is pending cannot publish late private events',async()=>{
 const f=setup();let release;const stream=new ReadableStream({start(c){release=c;}});const watch=watchCoordination({...f.options,fetchImpl:async()=>new Response(stream,{headers:{'Content-Type':'text/event-stream'}})});
 await new Promise(resolve=>setImmediate(resolve));f.scope.begin();release.enqueue(new TextEncoder().encode(frame()));release.close();await watch.done;assert.equal(f.events.length,0);
});
test('malformed state or cursor never advances or publishes an event',async()=>{
 const f=setup();await watchCoordination({...f.options,fetchImpl:async()=>response(frame({...event,state:'execute_shell'}))}).done;assert.equal(f.events.length,0);assert.ok(f.statuses.includes('failed'));
});
