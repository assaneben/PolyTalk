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
export async function runButtonAction(node,action,onError){
 if(node.disabled)return;node.disabled=true;node.setAttribute('aria-busy','true');
 try{return await action();}catch(error){onError(error);}finally{node.disabled=false;node.removeAttribute('aria-busy');}
}
export function returnHome({close,clearFilter,clearSelection,showList,render}){
 close();clearFilter();clearSelection();showList();render();
}
