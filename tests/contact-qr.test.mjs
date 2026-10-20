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
import QRCode from 'qrcode';
import {decodePixels} from '../web/contact-qr.js';
test('locally generated QR pixels recover the exact public contact link',()=>{
 const text='https://chat.example/contact/12345678-1234-4234-8234-123456789abc',qr=QRCode.create(text,{errorCorrectionLevel:'M'}),scale=6,margin=4,width=(qr.modules.size+margin*2)*scale,data=new Uint8ClampedArray(width*width*4);data.fill(255);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){const row=Math.floor(y/scale)-margin,col=Math.floor(x/scale)-margin;if(row>=0&&col>=0&&row<qr.modules.size&&col<qr.modules.size&&qr.modules.get(row,col)){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;}}
 assert.equal(decodePixels(data,width,width),text);
 assert.throws(()=>decodePixels(new Uint8ClampedArray(4),4096,4096));
});
