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
import {SessionResume} from '../web/session-resume.js';
function fixture(){const data=new Map(),keys=new Map();let now=1000;const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},keyStore={put:async(id,key)=>keys.set(id,key),get:async id=>keys.get(id),remove:async id=>keys.delete(id)};return {data,keys,storage,keyStore,now:()=>now,advance:()=>now+=13*60*60*1000};}
test('same-tab refresh resumes an encrypted local vault, explicit lock removes that ability',async()=>{
 const f=fixture(),resume=new SessionResume({...f,origin:'https://polytalk.local'});await resume.save({vaultId:'device',phrase:'a private local password'});
 assert.equal(JSON.stringify([...f.data]).includes('a private local password'),false);assert.equal([...f.keys.values()][0].extractable,false);
 const refreshed=new SessionResume({...f,origin:'https://polytalk.local'});assert.deepEqual(await refreshed.load(),{vaultId:'device',phrase:'a private local password'});await refreshed.clear();assert.equal(await resume.load(),null);assert.equal(f.keys.size,0);
});
test('expired, altered or cross-origin resume envelopes cannot reopen a session',async()=>{
 const f=fixture(),resume=new SessionResume({...f,origin:'https://polytalk.local'});await resume.save({vaultId:'device',phrase:'a private local password'});
 assert.equal(await new SessionResume({...f,origin:'https://other.local'}).load(),null);
 await resume.save({vaultId:'device',phrase:'a private local password'});f.advance();assert.equal(await resume.load(),null);
});
test('locking while a resume write is pending prevents late persistence',async()=>{
 const f=fixture();let resolve;const put=f.keyStore.put;f.keyStore.put=async(...args)=>{await put(...args);await new Promise(done=>resolve=done);};
 const resume=new SessionResume({...f,origin:'https://polytalk.local'}),saving=resume.save({vaultId:'device',phrase:'a private local password'});
 while(!resolve)await new Promise(done=>setTimeout(done,1));await resume.clear();resolve();await assert.rejects(saving,/verrouillée/);assert.equal(f.data.size,0);assert.equal(f.keys.size,0);
});
