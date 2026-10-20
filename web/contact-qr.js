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
import jsQR from 'jsqr';
export function decodePixels(data,width,height){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>2048||height>2048||data.length!==width*height*4)throw Error('Dimensions QR invalides.');
 const result=jsQR(data,width,height);if(!result)throw Error('Aucun QR code lisible dans cette image.');return result.data;
}
export async function readContactFile(file){
 if(!file||file.size>5*1024*1024)throw Error('Fichier limité à 5 Mio.');
 if(/\.(json|txt)$/i.test(file.name)){if(file.size>16384)throw Error('Carte trop volumineuse.');return file.text();}
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Importez une carte JSON ou une image PNG, JPEG ou WebP.');
 const image=await createImageBitmap(file);
 try{
  if(image.width*image.height>16000000)throw Error('Image limitée à 16 millions de pixels.');
  const ratio=Math.min(1,2048/image.width,2048/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,canvas.width,canvas.height);return decodePixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
 }finally{image.close();}
}
