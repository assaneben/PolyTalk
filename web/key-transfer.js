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
import {OlmMachine} from '@matrix-org/matrix-sdk-crypto-wasm';
export async function protectRoomKeys(json,passphrase){
  if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Phrase d’export : 12 caractères minimum.');
  return OlmMachine.encryptExportedRoomKeys(json,passphrase,500000);
}
export async function restoreRoomKeys(armored,passphrase){
  if(typeof armored!=='string'||armored.length>32*1024*1024)throw Error('Export invalide ou trop volumineux.');
  try{return OlmMachine.decryptExportedRoomKeys(armored,passphrase);}catch{throw Error('Export illisible : phrase incorrecte ou fichier endommagé.');}
}
