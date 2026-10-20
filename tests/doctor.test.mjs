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
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {diagnose} from '../scripts/doctor.mjs';
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'polytalk-doctor-'));t.after(()=>rm(root,{recursive:true,force:true}));await mkdir(join(root,'dist'));await writeFile(join(root,'.env'),'POLICY_SECRET=do-not-display\nREGISTRATION_SECRET=also-private\n');const assets={};for(const [kind,extension]of [['script','js'],['style','css'],['crypto','wasm']]){const bytes=Buffer.from(kind),name=kind+'.'+createHash('sha256').update(bytes).digest('hex').slice(0,16)+'.'+extension;assets[kind]=name;await writeFile(join(root,'dist',name),bytes);}assets.chunks=[];await writeFile(join(root,'dist','index.html'),'<html></html>');await writeFile(join(root,'dist','assets.json'),JSON.stringify(assets));return root;}
test('doctor validates real build hashes and service readiness without printing configuration secrets',async t=>{
 const root=await fixture(t),calls=[];const result=await diagnose({root,fetchImpl:async url=>{calls.push(String(url));return new Response(JSON.stringify({status:'ready',matrix:true}));}});
 assert.equal(result.ready,true);assert.equal(calls.length,1);assert.equal(JSON.stringify(result).includes('do-not-display'),false);
 await writeFile(join(root,'dist','index.html'),'');assert.equal((await diagnose({root,fetchImpl:async()=>new Response('{}')})).ready,false);
});
test('doctor reports unavailable Matrix and rejects redirects rather than claiming API readiness',async t=>{
 const root=await fixture(t);for(const response of [new Response(JSON.stringify({status:'matrix_unavailable',matrix:false})),new Response(null,{status:302,headers:{location:'https://foreign.example'}})]){const result=await diagnose({root,fetchImpl:async()=>response});assert.equal(result.ready,false);assert.ok(result.checks.some(c=>c.id==='services'&&!c.ok));}
});
