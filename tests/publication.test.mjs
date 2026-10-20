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
import {readFile} from 'node:fs/promises';
import {publicTextIssue} from '../scripts/export-public.mjs';
test('publication checks flag private keys and account paths without printing their values',()=>{
 assert.equal(publicTextIssue('-----BEGIN '+'PRIVATE KEY-----'),'private-key');
 assert.equal(publicTextIssue('C:'+String.raw`\Users\synthetic-user\private.txt`),'personal-path');
 assert.equal(publicTextIssue('synthetic public source @qa:example.test'),null);
});
test('official GPL text and package metadata agree on the distribution licence',async()=>{
 const license=await readFile('LICENSE','utf8'),metadata=JSON.parse(await readFile('package.json','utf8'));
 assert.match(license,/Version 3, 29 June 2007/);assert.ok(license.length>34000);assert.equal(metadata.license,'GPL-3.0-or-later');
});
