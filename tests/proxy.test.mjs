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
import test from 'node:test';import assert from 'node:assert/strict';
import {proxyPeers,clientAddress} from '../server/proxy.mjs';
test('proxy attribution trusts only exact configured peers and a single validated client address',()=>{
 const request=(peer,header)=>({socket:{remoteAddress:peer},headers:{'x-forwarded-for':header}});
 assert.equal(clientAddress(request('192.0.2.1','203.0.113.8'),proxyPeers([])),'192.0.2.1');
 assert.equal(clientAddress(request('::ffff:127.0.0.1','203.0.113.8'),proxyPeers(['127.0.0.1'])),'203.0.113.8');
 assert.throws(()=>clientAddress(request('127.0.0.1','203.0.113.8, 192.0.2.9'),proxyPeers(['127.0.0.1'])),/proxy/);
 assert.throws(()=>proxyPeers(['0.0.0.0/0']),/explicit/);
});
