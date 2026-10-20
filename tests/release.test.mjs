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
import {verifyRelease} from '../scripts/verify-release.mjs';
test('verification stops on failure and cannot label an unbuilt native release as qualified',async()=>{
 const calls=[];const report=await verifyRelease({profile:'release',run:async(command,args)=>{calls.push({command,args});return args.includes('--release')?1:0;}});
 assert.equal(report.passed,false);assert.ok(report.checks.some(check=>check.id==='native-release'&&check.status==='failed'));assert.equal(calls.length,5);assert.ok(!calls.some(call=>call.args.includes('tests/mcp-native.integration.mjs')));
});
test('runtime verification includes real MCP and A2A gates while local verification makes no such claim',async()=>{
 const local=await verifyRelease({profile:'local',run:async()=>0}),runtime=await verifyRelease({profile:'runtime',run:async()=>0});
 assert.equal(local.passed,true);assert.equal(local.checks.some(c=>c.id==='mcp-real'),false);assert.ok(runtime.checks.some(c=>c.id==='mcp-real'));assert.ok(runtime.checks.some(c=>c.id==='a2a-real'));
 await assert.rejects(verifyRelease({profile:'unknown',run:()=>{throw Error('must not run');}}),/Profil/);
});
