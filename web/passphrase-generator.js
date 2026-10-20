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
// 64 distinct words, 16 independent choices: 96 bits before user edits.
const words='abricot acacia agate aigle alpage ambre ananas ancre ardoise aurore baleine bambou banane bateau berger bijou bison brise cacao cactus canard canyon caramel cerise chalet citron colline comete corail cristal dauphin desert dragon dune eclair ecume etoile falaise faucon feuille flocon foret fraise galet gazelle glacier hibou horizon jasmin jardin lagune lapin lavande lilas lune mangue marbre melon miroir noisette nuage olive opale'.split(' ');
export function generateProtectionPhrase(random=globalThis.crypto){
 if(typeof random?.getRandomValues!=='function')throw Error('La génération aléatoire sécurisée est indisponible sur cet appareil.');
 const bytes=random.getRandomValues(new Uint8Array(16));
 try{return Array.from(bytes,value=>words[value&63]).join(' ');}finally{bytes.fill(0);}
}
