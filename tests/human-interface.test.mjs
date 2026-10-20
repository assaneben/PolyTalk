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
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile('web/index.html','utf8');
function label(id){const match=html.match(new RegExp('<button\\b[^>]*\\bid="'+id+'"[^>]*>([\\s\\S]*?)</button>'));assert.ok(match,'button '+id);return match[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();}
test('human navigation and message actions have visible French labels, never only symbols',()=>{
 for(const [id,text] of Object.entries({chats:'Conversations',contacts:'Trouver un contact','share-id':'Mon adresse',settings:'Paramètres',lock:'Verrouiller',coordination:'Tâches et agents',teams:'Équipes', 'new-chat':'Nouvelle conversation',details:'Informations',back:'Conversations','dialog-close':'Fermer'}))assert.ok(label(id).includes(text),id+' must visibly explain '+text);
 assert.match(html,/>Envoyer<\/button>/);assert.match(html,/Joindre un fichier/);
});
test('technical agent and authentication paths are disclosed separately from everyday messaging',()=>{
 assert.match(html,/<details[^>]*id="agent-navigation"[^>]*>\s*<summary>Agents IA<\/summary>/);
 assert.match(html,/<details[^>]*id="alternative-access"[^>]*>\s*<summary>Autres moyens de connexion<\/summary>/);
 assert.ok(label('workspace-help').includes('Aide'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'all UI ids unique');
});
