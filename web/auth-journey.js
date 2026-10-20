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
export function accessProtection({method,password,custom,phrase,confirmation}){
 if(method==='password'&&!custom){
  if(typeof password!=='string'||password.length<12)throw Error('Mot de passe du compte : 12 caractères minimum.');
  return {phrase:password,protection:'account-password'};
 }
 validateDevicePhrase(phrase,confirmation,method==='password'?password:'');
 return {phrase,protection:'custom'};
}
export function validateDevicePhrase(phrase,confirmation,accountPassword){
 if(typeof phrase!=='string'||phrase.length<12)throw Error('Choisissez une phrase de 12 caractères minimum pour protéger cet appareil.');
 if(phrase!==confirmation)throw Error('Les deux phrases ne correspondent pas. Vérifiez la confirmation.');
 if(phrase===accountPassword)throw Error('Utilisez une phrase différente du mot de passe de votre compte.');
}
export async function authenticateOnce({signup,username,password,name,kind,code},state,{register,login}){
 if(signup&&!state.registered){await register({username,password,name,kind,code});state.registered=true;}
 return login(username,password);
}
export async function finishAccess({scope,prepare,connect,connectedGeneration,seal,persist}){
 const initial=scope.generation,session=await prepare();scope.assert(initial);
 const connected=await connect(session),generation=connectedGeneration(connected);scope.assert(generation);
 const box=await seal(connected);scope.assert(generation);persist(connected,box);
 return {session:connected,generation};
}
