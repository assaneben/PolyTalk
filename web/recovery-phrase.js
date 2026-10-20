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
import {seal,unseal} from './vault.js';
const type='io.polytalk.recovery_phrase.v1';
export async function saveRecoveryPhrase({client,scope,phrase,code,version}){
 const token=scope.generation,userId=client.getUserId();scope.assert(token);
 if(typeof phrase!=='string'||phrase.length<12||phrase.length>4096)throw Error('Phrase de restauration : 12 caractères minimum, 4096 maximum.');
 if(typeof code!=='string'||code.length>256||!version)throw Error('Sauvegarde invalide.');
 const box=await seal({userId,version,code},phrase);scope.assert(token);
 await client.setAccountData(type,{version:1,box});scope.assert(token);
}
export async function readRecoveryPhrase({client,scope,phrase,version}){
 const token=scope.generation,userId=client.getUserId();scope.assert(token);
 if(typeof phrase!=='string'||phrase.length<12||phrase.length>4096)throw Error('Phrase de restauration invalide.');
 const data=await client.getAccountDataFromServer(type);scope.assert(token);
 if(data?.version!==1||data.box?.version!==1||typeof data.box.data!=='string'||data.box.data.length>4096||typeof data.box.salt!=='string'||data.box.salt.length!==24||typeof data.box.iv!=='string'||data.box.iv.length!==16)throw Error('Aucune phrase de restauration valide enregistrée pour ce compte.');
 const clear=await unseal(data.box,phrase);scope.assert(token);
 if(clear.userId!==userId)throw Error('La phrase appartient à un autre compte.');
 if(clear.version!==version)throw Error('La phrase ne correspond pas à cette version de sauvegarde.');
 if(typeof clear.code!=='string'||clear.code.length>256)throw Error('Code de sauvegarde invalide.');
 return clear.code;
}
