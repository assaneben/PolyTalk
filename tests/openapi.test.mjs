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
import {createOpenApi} from '../server/openapi.mjs';
test('OpenAPI covers every literal public API route and declares path parameters and security',async()=>{
 const spec=createOpenApi();assert.equal(spec.openapi,'3.1.0');assert.deepEqual(spec.security,[{MatrixBearer:[]}]);
 const source=await readFile(new URL('../server/app.mjs',import.meta.url),'utf8');
 for(const match of source.matchAll(/path==='(\/api\/[^']+)'&&req.method==='(GET|POST|PUT)'/g))assert.ok(spec.paths[match[1]]?.[match[2].toLowerCase()],match[2]+' '+match[1]);
 const ids=new Set();for(const [path,item]of Object.entries(spec.paths))for(const [method,op]of Object.entries(item)){assert.ok(op.operationId&&!ids.has(op.operationId));ids.add(op.operationId);assert.ok(op.summary&&op.responses);for(const parameter of path.matchAll(/\{([^}]+)\}/g))assert.ok(op.parameters?.some(p=>p.in==='path'&&p.name===parameter[1]&&p.required));if(method==='post'||method==='put')assert.ok(op.requestBody?.content?.['application/json']?.schema);}
 assert.deepEqual(spec.paths['/api/register'].post.security,[]);assert.ok(spec.paths['/api/coordination/tasks/{taskId}'].put);
 assert.equal(JSON.stringify(spec).includes('POLICY_SECRET'),false);
});
