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
import {Security,totp} from '../server/security.mjs';
const actor={mxid:'@alice:localhost'};
function fixture(t){const store=new Store(':memory:');t.after(()=>store.close());let now=1700000000000;const security=new Security(store,'s'.repeat(64),{now:()=>now});return {security,store,tick:()=>now+=30000,now:()=>now};}
test('TOTP matches RFC6238 SHA1 vectors with six digit truncation',()=>{
 assert.equal(totp(Buffer.from('12345678901234567890'),59000),'287082');
 assert.equal(totp(Buffer.from('12345678901234567890'),1111111109000),'081804');
});
test('optional enrollment requires a correct first code and stores no clear TOTP secret',t=>{
 const f=fixture(t);assert.equal(f.security.enabled(actor.mxid),false);
 const enrollment=f.security.begin(actor.mxid,'session');
 assert.throws(()=>f.security.confirm(actor.mxid,'another', '000000'),/Code/);
 assert.throws(()=>f.security.confirm(actor.mxid,'session', '000000'),/Code/);
 const codes=f.security.confirm(actor.mxid,'session',totp(Buffer.from(enrollment.raw,'base64'),f.now()));
 assert.equal(codes.length,10);assert.equal(new Set(codes).size,10);assert.equal(f.security.enabled(actor.mxid),true);
 const saved=f.store.db.prepare('SELECT secret FROM auth_totp').get().secret;assert.ok(!saved.includes(enrollment.raw));
 assert.throws(()=>f.security.verify(actor.mxid,totp(Buffer.from(enrollment.raw,'base64'),f.now())),/Code/);
 f.tick();f.security.verify(actor.mxid,totp(Buffer.from(enrollment.raw,'base64'),f.now()));
 f.security.verify(actor.mxid,codes[0]);assert.throws(()=>f.security.verify(actor.mxid,codes[0]),/Code/);
 assert.equal(f.security.status(actor.mxid).backupCodesRemaining,9);
});
test('Synapse grants are bound to account, single use and short lived',t=>{
 const f=fixture(t),e=f.security.begin(actor.mxid,'session');f.security.confirm(actor.mxid,'session',totp(Buffer.from(e.raw,'base64'),f.now()));
 assert.equal(f.security.allowLogin(actor.mxid,'arbitrary'),false);
 const device=f.security.grant(actor.mxid);assert.equal(f.security.allowLogin('@bob:localhost',device),true);
 assert.equal(f.security.allowLogin(actor.mxid,device),true);assert.equal(f.security.allowLogin(actor.mxid,device),false);
 const stale=f.security.grant(actor.mxid);f.tick();f.tick();f.tick();assert.equal(f.security.allowLogin(actor.mxid,stale),false);
});
test('security changes leave bounded audit metadata with no codes, TOTP secret or raw account ID',t=>{
 const f=fixture(t),setup=f.security.begin(actor.mxid,'session');f.security.confirm(actor.mxid,'session',totp(Buffer.from(setup.raw,'base64'),f.now()));
 const audit=f.security.history(actor.mxid);assert.equal(audit[0].event,'totp.enabled');
 const stored=JSON.stringify(f.store.db.prepare('SELECT * FROM auth_security_audit').all());
 assert.equal(stored.includes(actor.mxid),false);assert.equal(stored.includes(setup.secret),false);assert.equal(stored.includes(setup.raw),false);
 assert.throws(()=>f.security.audit(actor.mxid,'secret='+setup.secret),/audit/);
});
