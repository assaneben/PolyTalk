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
import {SearchMessageFocus} from '../web/message-focus.js';
function container(){const c={children:[],scrollTop:44,ownerDocument:{activeElement:null}},calls=[];c.replace=()=>{const target={dataset:{eventId:'$target'},classList:{add:x=>calls.push(['class',x])},focus:()=>{calls.push(['focus']);c.ownerDocument.activeElement=target;},scrollIntoView:()=>{calls.push(['scroll']);c.scrollTop=100;}};c.children=[target];return target;};return {c,calls};}
test('result remains highlighted and focused across receipt rendering without scrolling again',()=>{
 const state=new SearchMessageFocus(),{c,calls}=container();state.select('!a','$target');const snap=state.capture(c,'!a');const first=c.replace();state.apply(c,'!a',snap);
 assert.equal(c.ownerDocument.activeElement,first);assert.equal(calls.filter(x=>x[0]==='scroll').length,1);
 c.scrollTop=63;const next=state.capture(c,'!a');const second=c.replace();state.apply(c,'!a',next);
 assert.equal(c.ownerDocument.activeElement,second);assert.equal(c.scrollTop,63);assert.equal(calls.filter(x=>x[0]==='scroll').length,1);assert.equal(calls.filter(x=>x[0]==='class').length,2);
});
test('render never steals focus from composer and a missing result or room switch clears navigation',()=>{
 const state=new SearchMessageFocus(),{c,calls}=container();state.select('!a','$target');c.replace();state.apply(c,'!a',state.capture(c,'!a'));
 const composer={};c.ownerDocument.activeElement=composer;const snap=state.capture(c,'!a');c.replace();state.apply(c,'!a',snap);assert.equal(c.ownerDocument.activeElement,composer);
 c.children=[];assert.equal(state.apply(c,'!a',state.capture(c,'!a')),false);assert.equal(state.capture(c,'!a'),null);
 state.select('!a','$target');assert.equal(state.capture(c,'!b'),null);state.clear();assert.equal(state.capture(c,'!a'),null);
});
