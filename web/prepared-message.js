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
export async function sendPreparedMessage({input,state,getAttachment,clearAttachment,sendText,sendFile,isCurrent=()=>true}){
 if(state.busy)return;const text=input.value,file=getAttachment();if(!text.trim()&&!file)return;state.busy=true;
 try{
  if(file){await sendFile(file);if(!isCurrent())return;clearAttachment(file);}
  if(!isCurrent())return;
  if(text.trim()){await sendText(text);if(isCurrent()&&input.value===text)input.value='';}
 }finally{state.busy=false;}
}
export function canSendMessage({ready,busy,text='',attachment=null}){return Boolean(ready&&!busy&&(text.trim()||attachment));}
