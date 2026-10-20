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
export class SearchMessageFocus {
 target=null;
 select(roomId,eventId){this.target={roomId,eventId,pending:true};}
 clear(){this.target=null;}
 capture(container,roomId){
  const target=this.target;if(!target||target.roomId!==roomId)return null;
  const active=container.ownerDocument?.activeElement;
  return {target,focused:active?.dataset?.eventId===target.eventId,scrollTop:container.scrollTop};
 }
 apply(container,roomId,snapshot){
  const target=this.target;if(!snapshot||snapshot.target!==target||target.roomId!==roomId)return false;
  const node=Array.from(container.children).find(item=>item.dataset?.eventId===target.eventId);
  if(!node){this.clear();return false;}
  node.classList.add('search-match');node.tabIndex=-1;
  if(target.pending){node.focus({preventScroll:true});node.scrollIntoView({block:'center'});target.pending=false;}
  else{if(snapshot.focused)node.focus({preventScroll:true});container.scrollTop=snapshot.scrollTop;}
  return true;
 }
}
