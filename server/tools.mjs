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
// Server-owned descriptors only. External agents cannot register executable handlers.
export function resolvePermission(serverRules,modelSuggestion='allow'){
 const rank={allow:0,ask:1,never:2};
 if(!Array.isArray(serverRules)||!serverRules.length||serverRules.some(r=>!Object.hasOwn(rank,r))||!Object.hasOwn(rank,modelSuggestion))return 'never';
 return [...serverRules,modelSuggestion].reduce((decision,rule)=>rank[rule]>rank[decision]?rule:decision,'allow');
}
export const coordinationTools=Object.freeze([
 {id:'polytalk.task.create',version:1,method:'POST',path:'/api/coordination/tasks',effect:'Create a tracked task; never start an external process.',permission:'matrix-participants-and-reception-policy',inputSchema:{type:'object',additionalProperties:false,required:['requestId','roomId','assigneeId','instructionEventId'],properties:{requestId:{type:'string',maxLength:128},roomId:{type:'string',maxLength:255},assigneeId:{type:'string',format:'uuid'},instructionEventId:{type:'string',maxLength:255},expiresAt:{type:['string','null'],format:'date-time'},parentId:{type:'string',format:'uuid'},approvalId:{type:'string',format:'uuid'}}}},
 {id:'polytalk.delegation.request_approval',version:1,method:'POST',path:'/api/coordination/approvals',effect:'Request approval for an exact delegation; no execution.',permission:'running-parent-assignee-and-ask-policy',inputSchema:{type:'object',additionalProperties:false,required:['requestId','roomId','assigneeId','instructionEventId','parentId'],properties:{requestId:{type:'string',maxLength:128},roomId:{type:'string',maxLength:255},assigneeId:{type:'string',format:'uuid'},instructionEventId:{type:'string',maxLength:255},expiresAt:{type:['string','null'],format:'date-time'},parentId:{type:'string',format:'uuid'}}}},
 {id:'polytalk.task.transition',version:1,method:'PUT',path:'/api/coordination/tasks/{taskId}',effect:'Change tracked state; cancellation is cooperative for external runtimes.',permission:'participant-role-and-version',inputSchema:{type:'object',additionalProperties:false,required:['state','version'],properties:{state:{enum:['running','completed','failed','cancelled','awaiting_approval','assigned']},version:{type:'integer',minimum:1},resultEventId:{type:'string',maxLength:255}}}},
 {id:'polytalk.approval.decide',version:1,method:'PUT',path:'/api/coordination/approvals/{approvalId}',effect:'Approve or reject one bounded delegation.',permission:'configured-operator-and-root-controller',inputSchema:{type:'object',additionalProperties:false,required:['state'],properties:{state:{enum:['approved','rejected']}}}}
]);
