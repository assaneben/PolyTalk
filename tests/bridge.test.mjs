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
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {NativeBridge} from '../agent/adapters/bridge.mjs';
test('closing a native bridge waits for actual process exit before the store can be reused',async()=>{
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>child.emit('exit',0);let finished=false;
 const bridge=new NativeBridge({spawnImpl:()=>child});const closing=bridge.close().then(()=>finished=true);await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);child.emit('exit',0);await closing;assert.equal(finished,true);
});
test('native bridge correlates out-of-order replies and rejects shell-like methods',async()=>{
 const sent=[];let spawned;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new Writable({write(chunk,encoding,done){sent.push(JSON.parse(chunk));done();}});child.kill=()=>child.emit('exit',0);
 const bridge=new NativeBridge({executable:'fixed-native-binary',env:{POLYTALK_ORIGIN:'https://local.example',UNRELATED_SECRET:'private'},spawnImpl:(path,args,opts)=>{spawned={path,args,opts};return child;}});
 const first=bridge.call('status'),second=bridge.call('rooms');assert.equal(sent.length,2);child.stdout.write(JSON.stringify({v:1,id:sent[1].id,result:{rooms:[]}})+'\n');child.stdout.write(JSON.stringify({v:1,id:sent[0].id,result:{authenticated:true}})+'\n');
 assert.deepEqual(await first,{authenticated:true});assert.deepEqual(await second,{rooms:[]});assert.equal(spawned.opts.shell,false);assert.equal(spawned.opts.env.UNRELATED_SECRET,undefined);assert.deepEqual(spawned.args,[]);
 await assert.rejects(bridge.call('exec',{command:'do something'}),/UNSUPPORTED/);assert.equal(sent.length,2);bridge.close();
});
test('native bridge contains malformed output and never includes arbitrary native error details',async()=>{
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let request;child.stdin=new Writable({write(chunk,encoding,done){request=JSON.parse(chunk);done();}});child.kill=()=>child.emit('exit',1);
 const bridge=new NativeBridge({spawnImpl:()=>child});const waiting=bridge.call('send',{room_id:'!room',text:'test'});child.stdout.write(JSON.stringify({v:1,id:request.id,error:{code:'private-server-details',message:'secret'}})+'\n');await assert.rejects(waiting,error=>error.message==='OPERATION_FAILED');
 const pending=bridge.call('read');child.stdout.write('invalid-json\n');await assert.rejects(pending,/PROTOCOL_ERROR/);bridge.close();
});


test('public native build and adapter default select the same release executable',async()=>{
 const {readFile}=await import('node:fs/promises'),{fileURLToPath}=await import('node:url');const scripts=JSON.parse(await readFile('package.json','utf8')).scripts;assert.match(scripts['build:agent'],/build --release /);assert.doesNotMatch(scripts['build:agent:debug'],/--release/);
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>child.emit('exit',0);let selected;
 const bridge=new NativeBridge({env:{},spawnImpl:path=>{selected=path;return child;}});assert.equal(selected,fileURLToPath(new URL('../agent/target/release/polytalk-agent'+(process.platform==='win32'?'.exe':''),import.meta.url)));bridge.close();
});
