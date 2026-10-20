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
import {searchMessages} from '../web/message-search.js';
import {Messenger} from '../web/matrix-client.js';
const event=(id,body,extra={})=>({getId:()=>id,getType:()=> 'm.room.message',getContent:()=>({msgtype:'m.text',body}),getSender:()=> '@alice:local',getTs:()=>100,isRedacted:()=>false,isDecryptionFailure:()=>false,...extra});
const room=(id,membership='join')=>({roomId:id,name:'Équipe',getMyMembership:()=>membership});
function source(rooms,events){return {rooms:()=>rooms,messages:id=>events[id]||[]};}
test('local search is literal, accent insensitive, sorted and limited with room and sender filters',()=>{
 const m=source([room('!a'),room('!b')],{'!a':[event('$a','Décision [budget]',{getTs:()=>10})],'!b':[event('$b','DÉCISION [budget]',{getTs:()=>20})]});
 assert.deepEqual(searchMessages(m,{query:'decision [budget]'}).matches.map(x=>x.eventId),['$b','$a']);
 assert.equal(searchMessages(m,{query:'[budget]',roomId:'!a',sender:'ALICE'}).matches.length,1);
 assert.equal(searchMessages(m,{query:'[budget]',sender:'bob'}).matches.length,0);
 const capped=searchMessages(m,{query:'decision',limit:1});assert.equal(capped.matches.length,1);assert.equal(capped.truncated,true);
 assert.throws(()=>searchMessages(m,{query:'a'}),/2/);assert.throws(()=>searchMessages(m,{query:'x'.repeat(201)}),/200/);
});
test('search excludes unjoined rooms, encrypted failures, redactions and replacement events',()=>{
 const events=[event('$ok','secret'),event('$enc','secret',{getType:()=> 'm.room.encrypted'}),event('$fail','secret',{isDecryptionFailure:()=>true}),event('$red','secret',{isRedacted:()=>true}),event('$edit','secret',{getContent:()=>({msgtype:'m.text',body:'secret','m.relates_to':{rel_type:'m.replace'}})})];
 const m=source([room('!joined'),room('!invite','invite'),room('!left','leave')],{'!joined':events,'!invite':[event('$invite','secret')],'!left':[event('$left','secret')]});
 assert.deepEqual(searchMessages(m,{query:'secret'}).matches.map(x=>x.eventId),['$ok']);
});
test('real Messenger policy excludes blocked, pending and whitelist-excluded senders',()=>{
 const m=new Messenger();m.scope.begin();m.session={userId:'@me:local'};m.policy={mode:'whitelist',rules:[{target:'@alice:local',action:'allow'}]};
 const events=[event('$ok','find me'),event('$pending','find me'),event('$blocked','find me',{getSender:()=> '@bob:local'})];m.pendingPolicy.add('$pending');
 const r={...room('!a'),getLiveTimeline:()=>({getEvents:()=>events}),getLastActiveTimestamp:()=>1};m.client={getRooms:()=>[r],getRoom:()=>r};
 assert.deepEqual(searchMessages(m,{query:'find'}).matches.map(x=>x.eventId),['$ok']);
});

// Matrix's actual replacement semantics must never return the superseded text.
test('real MatrixEvent replacement searches current text and removes it after redaction',async()=>{
 const {MatrixEvent}=await import('matrix-js-sdk');
 const original=new MatrixEvent({event_id:'$original',type:'m.room.message',room_id:'!a',sender:'@alice:local',origin_server_ts:100,content:{msgtype:'m.text',body:'Ancien budget secret'}});
 const edit=new MatrixEvent({event_id:'$edit',type:'m.room.message',room_id:'!a',sender:'@alice:local',origin_server_ts:200,content:{msgtype:'m.text',body:'* Budget approuvé','m.new_content':{msgtype:'m.text',body:'Budget approuvé'},'m.relates_to':{rel_type:'m.replace',event_id:'$original'}}});
 original.makeReplaced(edit);const m=source([room('!a')],{'!a':[original,edit]});
 assert.equal(searchMessages(m,{query:'ancien'}).matches.length,0);
 assert.deepEqual(searchMessages(m,{query:'approuve'}).matches.map(x=>x.eventId),['$original']);
 original.makeRedacted(new MatrixEvent({type:'m.room.redaction',event_id:'$redaction',sender:'@alice:local',content:{},redacts:'$original'}));
 assert.equal(searchMessages(m,{query:'approuve'}).matches.length,0);
});
