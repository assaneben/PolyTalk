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
import {readContactFile,decodePixels} from '../web/contact-qr.js';
test('file import rejects large inputs and active formats before image decoding',async()=>{
 await assert.rejects(()=>readContactFile({size:6*1024*1024}),/5 Mio/);
 await assert.rejects(()=>readContactFile({size:17000,name:'card.json'}),/volumineuse/);
 await assert.rejects(()=>readContactFile({size:100,name:'qr.svg',type:'image/svg+xml'}),/PNG/);
 await assert.rejects(()=>readContactFile({size:100,name:'qr.html',type:'text/html'}),/PNG/);
 assert.equal(await readContactFile({size:4,name:'card.txt',text:async()=>'test'}),'test');
 assert.throws(()=>decodePixels(new Uint8ClampedArray(16),2,2),/Aucun QR/);
});
