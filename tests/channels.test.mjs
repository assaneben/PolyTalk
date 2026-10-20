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
import {Store} from '../server/store.mjs';
import {Channels} from '../server/channels.mjs';

test('channel modes resolve registered joined agents, never humans or blocked senders',()=>{
 const store=new Store(':memory:');try{
 const owner=store.ensure('@owner:local','Owner'),a=store.ensure('@a:local','A','agent'),b=store.ensure('@b:local','B','agent');
 const channels=new Channels(store);const roster=[a,b],room='!room';
 assert.deepEqual(channels.get(room),{roomId:room,mode:'manual',principalId:null,version:0});
 assert.deepEqual(channels.resolve(owner,room,roster,{mentions:[a.id]}).recipients,[a.id]);
 assert.throws(()=>channels.resolve(owner,room,roster,{mentions:[]}),/Mention/);
 const all=channels.configure(room,{mode:'all',principalId:null,version:0},roster);assert.equal(all.version,1);
 assert.deepEqual(channels.resolve(owner,room,roster,{mentions:[]}).recipients,[a.id,b.id]);
 store.setRule(b.mxid,owner.mxid,'block');assert.deepEqual(channels.resolve(owner,room,roster,{mentions:[]}).recipients,[a.id]);
 assert.throws(()=>channels.configure(room,{mode:'principal',principalId:owner.id,version:1},roster),/principal/);
 channels.configure(room,{mode:'principal',principalId:a.id,version:1},roster);
 assert.deepEqual(channels.resolve(owner,room,roster,{mentions:[]}).recipients,[a.id]);
 assert.throws(()=>channels.resolve(owner,room,[b],{mentions:[]}),/indisponible/);
 assert.throws(()=>channels.configure(room,{mode:'all',principalId:null,version:1},roster),/Version/);
 assert.throws(()=>channels.resolve(owner,room,roster,{mentions:[a.id],command:'shell'}),/Sélection/);
 }finally{store.close();}
});


test('channel configuration and audit commit together or both roll back',()=>{
 const store=new Store(':memory:');try{
  const channels=new Channels(store);channels.configure('!room',{mode:'all',principalId:null,version:0},[]);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM coordination_channel_events').get().n,1);
  store.db.exec("CREATE TRIGGER deny_channel_audit BEFORE INSERT ON coordination_channel_events BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
  assert.throws(()=>channels.configure('!room',{mode:'manual',principalId:null,version:1},[]),/audit unavailable/);
  assert.equal(channels.get('!room').mode,'all');assert.equal(channels.get('!room').version,1);
 }finally{store.close();}
});
