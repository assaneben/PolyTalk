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
import {Passkeys} from '../server/passkeys.mjs';
import {virtualCredential} from './helpers/virtual-webauthn.mjs';
const origin='https://chat.example.test';
test('passkey registration and real P256 signatures require origin, UV, binding and a fresh challenge',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const user=store.ensure('@alice:localhost'),keys=new Passkeys(store,origin),virtual=virtualCredential(user);
 const enrollment=await keys.registration(user,'session','Mon téléphone');assert.equal(enrollment.options.authenticatorSelection.userVerification,'required');
 await keys.register(enrollment.id,'session',virtual.registration(enrollment.options.challenge));assert.equal(keys.list(user).length,1);
 let request=await keys.authentication('browser');assert.equal((await keys.authenticate(request.id,'browser',virtual.assertion(request.options.challenge))).id,user.id);
 await assert.rejects(keys.authenticate(request.id,'browser',virtual.assertion(request.options.challenge)),/refusée/);
 for(const change of [{site:'https://phishing.example'},{flags:1}]){request=await keys.authentication('browser');await assert.rejects(keys.authenticate(request.id,'browser',virtual.assertion(request.options.challenge,{counter:2,...change})),/refusée/);}
 request=await keys.authentication('browser');await assert.rejects(keys.authenticate(request.id,'wrong-browser',virtual.assertion(request.options.challenge,{counter:3})),/refusée/);
 assert.equal((await keys.authenticate(request.id,'browser',virtual.assertion(request.options.challenge,{counter:3}))).id,user.id);
 assert.equal(keys.remove(user,virtual.id).length,0);
});
