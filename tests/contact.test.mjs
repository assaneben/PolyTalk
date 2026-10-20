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
import {parseContact} from '../web/contact.js';
const origin='https://chat.example',id='12345678-1234-4234-8234-123456789abc';
test('accepts address UUID and exact local contact link',()=>{
 assert.equal(parseContact('@alice:example.org',origin).mxid,'@alice:example.org');
 assert.equal(parseContact(id,origin).id,id);
 assert.equal(parseContact(origin+'/contact/'+id,origin).id,id);
});
test('rejects unsafe schemes foreign origins credentials and surplus link data',()=>{
 for(const value of ['javascript:alert(1)','https://evil.example/contact/'+id,'https://user@chat.example/contact/'+id,origin+'/contact/'+id+'?token=x',origin+'/contact/'+id+'#x','@a:bad/name','x'.repeat(17000)])assert.throws(()=>parseContact(value,origin));
});
test('public cards reject secrets malformed schemas and inconsistent links',()=>{
 const card={schema:'polytalk.contact.v1',id,mxid:'@alice:example.org',name:'Alice',kind:'human',origin,issuedBy:'example.org',verification:'matrix-account',url:origin+'/contact/'+id};
 assert.equal(parseContact(JSON.stringify(card),origin).mxid,card.mxid);
 for(const patch of [{accessToken:'secret'},{privateKey:'secret'},{schema:'other'},{url:origin+'/contact/00000000-0000-4000-8000-000000000000'},{kind:'admin'},{origin:'https://evil.example'}])assert.throws(()=>parseContact(JSON.stringify({...card,...patch}),origin));
});
