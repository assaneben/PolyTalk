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
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {filterContacts} from '../web/contact-list-ui.js';
test('contacts persist, are account scoped and never change reception permissions',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'polytalk-contacts-')),'db.sqlite');let store=new Store(file);
 store.saveContact('@owner:local','@friend:remote','Camille');store.saveContact('@owner:local','@friend:remote','Camille travail');assert.equal(store.contacts('@owner:local').length,1);assert.deepEqual(store.contacts('@other:local'),[]);assert.equal(store.policy('@owner:local').mode,'open');store.close();store=new Store(file);
 assert.equal(store.contacts('@owner:local')[0].name,'Camille travail');assert.equal(filterContacts(store.contacts('@owner:local'),'TRAVAIL').length,1);assert.throws(()=>store.saveContact('@owner:local','@owner:local','Moi'));store.removeContact('@other:local','@friend:remote');assert.equal(store.contacts('@owner:local').length,1);store.removeContact('@owner:local','@friend:remote');assert.equal(store.contacts('@owner:local').length,0);store.close();
});
test('address book HTTP authenticates, validates and isolates both list and mutation',async t=>{
 const store=new Store(':memory:'),origin='http://localhost:3210';const server=createApp({store,origin,serverName:'local',upstream:'http://matrix.invalid',policySecret:'p'.repeat(64),fetchImpl:async(url,options)=>new Response(JSON.stringify({user_id:options.headers.Authorization==='Bearer other'?'@other:local':'@owner:local'}))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.close();});const base='http://127.0.0.1:'+server.address().port;
 const request=(token,data)=>fetch(base+'/api/address-book',{method:data?'POST':'GET',headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});
 assert.equal((await request(null)).status,401);assert.equal((await request('owner',{action:'save',mxid:'bad',name:'Bad'})).status,400);assert.equal((await request('owner',{action:'save',mxid:'@friend:remote',name:'Camille'})).status,200);
 assert.equal((await (await request('owner')).json()).contacts.length,1);assert.deepEqual((await (await request('other')).json()).contacts,[]);
 await request('other',{action:'remove',mxid:'@friend:remote'});assert.equal((await (await request('owner')).json()).contacts.length,1);
});
