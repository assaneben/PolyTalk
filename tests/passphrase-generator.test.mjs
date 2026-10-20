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
import {generateProtectionPhrase} from '../web/passphrase-generator.js';

test('local phrase uses sixteen independent unbiased cryptographic word choices',()=>{
 let calls=0;
 const phrase=generateProtectionPhrase({getRandomValues(bytes){calls++;assert.equal(bytes.length,16);for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes;}});
 assert.equal(calls,1);assert.equal(phrase.split(' ').length,16);assert.equal(new Set(phrase.split(' ')).size,16);
 assert.match(phrase,/^[a-z]+(?: [a-z]+){15}$/);
 const a=generateProtectionPhrase({getRandomValues(bytes){bytes.fill(0);return bytes;}});
 const b=generateProtectionPhrase({getRandomValues(bytes){bytes.fill(64);return bytes;}});
 assert.equal(a,b);assert.notEqual(generateProtectionPhrase(),generateProtectionPhrase());
});

test('unavailable secure randomness fails without a weak fallback',()=>{
 assert.throws(()=>generateProtectionPhrase({}),/aléatoire/);
});
