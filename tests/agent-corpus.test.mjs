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
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareCorpus} from '../scripts/agent-corpus.mjs';
test('agent context copies only bounded application sources, never account data or environment',async()=>{
 const root=await mkdtemp(join(tmpdir(),'polytalk-corpus-'));
 for(const name of ['web','server','agent/src','agent/adapters','scripts','data'])await mkdir(join(root,name),{recursive:true});
 await writeFile(join(root,'web','app.js'),'export const publicSource=true;');await writeFile(join(root,'web','private.env'),'synthetic-secret');await writeFile(join(root,'data','messages.js'),'private messages');await writeFile(join(root,'.env'),'private config');
 const result=await prepareCorpus(root);assert.deepEqual(result.files,['web/app.js']);assert.equal(await readFile(join(result.root,'web/app.js'),'utf8'),'export const publicSource=true;');
 await writeFile(join(root,'server','oversize.js'),'x'.repeat(1024*1024+1));await assert.rejects(prepareCorpus(root),/CORPUS_TOO_LARGE/);
});
