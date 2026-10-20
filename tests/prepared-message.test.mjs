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
import {sendPreparedMessage} from '../web/prepared-message.js';
test('prepared file is sent only by explicit submit, followed by text; duplicates are prevented',async()=>{
 const file={name:'document.pdf'},input={value:'Bonjour'},state={busy:false},calls=[];let pending=file,complete;
 const options={input,state,getAttachment:()=>pending,clearAttachment:expected=>{if(pending===expected)pending=null;},sendFile:async value=>{calls.push(value.name);await new Promise(resolve=>complete=resolve);},sendText:async text=>calls.push(text),isCurrent:()=>true};
 assert.deepEqual(calls,[]);const send=sendPreparedMessage(options);await sendPreparedMessage(options);assert.deepEqual(calls,['document.pdf']);complete();await send;assert.deepEqual(calls,['document.pdf','Bonjour']);assert.equal(pending,null);assert.equal(input.value,'');assert.equal(state.busy,false);
});
test('file success followed by text failure never resends the attachment on retry',async()=>{
 let pending={name:'file'},files=0,texts=0;const input={value:'message'},state={busy:false},options={input,state,getAttachment:()=>pending,clearAttachment:()=>pending=null,sendFile:async()=>files++,sendText:async()=>{if(++texts===1)throw Error('offline');},isCurrent:()=>true};
 await assert.rejects(sendPreparedMessage(options));assert.equal(pending,null);assert.equal(input.value,'message');await sendPreparedMessage(options);assert.equal(files,1);assert.equal(texts,2);
});
test('room change during upload cannot send captured text or clear another view',async()=>{
 let current=true,complete,sent=0,cleared=0;const input={value:'draft'},state={busy:false};const pending=sendPreparedMessage({input,state,getAttachment:()=>({name:'file'}),clearAttachment:()=>cleared++,sendFile:()=>new Promise(resolve=>complete=resolve),sendText:async()=>sent++,isCurrent:()=>current});current=false;input.value='new room';complete();await pending;assert.equal(input.value,'new room');assert.equal(cleared,0);assert.equal(sent,0);
});

test('send availability explains empty and offline states by disabling unavailable submission',async()=>{
 const {canSendMessage}=await import('../web/prepared-message.js');
 assert.equal(canSendMessage({ready:true,busy:false,text:'  ',attachment:null}),false);
 assert.equal(canSendMessage({ready:true,busy:false,text:'',attachment:{name:'file'}}),true);
 assert.equal(canSendMessage({ready:false,busy:false,text:'message'}),false);
 assert.equal(canSendMessage({ready:true,busy:true,text:'message'}),false);
});
