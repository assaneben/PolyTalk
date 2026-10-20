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
import {createHash,generateKeyPairSync,randomBytes,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
export function virtualCredential(user,{origin='https://chat.example.test',rp='chat.example.test'}={}){
 const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'}),id=randomBytes(32).toString('base64url');
 const cose=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]));
 const clientData=(type,challenge,site)=>Buffer.from(JSON.stringify({type,challenge,origin:site,crossOrigin:false}));
 return {id,registration(challenge){const length=Buffer.alloc(2);length.writeUInt16BE(32);const auth=Buffer.concat([createHash('sha256').update(rp).digest(),Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),length,Buffer.from(id,'base64url'),cose]);return {id,rawId:id,type:'public-key',response:{clientDataJSON:clientData('webauthn.create',challenge,origin).toString('base64url'),attestationObject:Buffer.from(isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',auth]]))).toString('base64url'),transports:['internal']},clientExtensionResults:{credProps:{rk:true}},authenticatorAttachment:'platform'};},
 assertion(challenge,{site=origin,flags=5,counter=1}={}){const data=clientData('webauthn.get',challenge,site),c=Buffer.alloc(4);c.writeUInt32BE(counter);const auth=Buffer.concat([createHash('sha256').update(rp).digest(),Buffer.from([flags]),c]);return {id,rawId:id,type:'public-key',response:{clientDataJSON:data.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:sign('sha256',Buffer.concat([auth,createHash('sha256').update(data).digest()]),privateKey).toString('base64url'),userHandle:Buffer.from(user.id).toString('base64url')},clientExtensionResults:{}};}};
}
