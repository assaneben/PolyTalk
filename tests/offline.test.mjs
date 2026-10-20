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
import {verifyOffline} from '../scripts/verify-offline.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {exportOffline} from '../scripts/export-offline.mjs';
test('offline export uses an explicit public allowlist and immutable image identities',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'polytalk-export-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 for(const file of ['deploy/compose.yaml','deploy/compose.intranet.yaml','deploy/compose.internet.yaml','deploy/synapse/polytalk_policy.py','scripts/setup.mjs','scripts/verify-offline.mjs','README.md','documentation/04-livrables/2026-10-18-distribution-internet-intranet.html']){await mkdir(dirname(join(directory,file)),{recursive:true});await writeFile(join(directory,file),'public deployment source');}
 await writeFile(join(directory,'README.md'),'# Development\nnpm ci\nSur la machine cible,\nnode scripts/verify-offline.mjs\ndocker image load --input images.tar\n<!-- offline-install:end -->\nnpm run unavailable-in-package');
 await writeFile(join(directory,'.env'),'NEVER EXPORT THIS');const calls=[];
 const docker=async(command,args)=>{calls.push(args);if(args[1]==='inspect')return {stdout:'sha256:'+'a'.repeat(64)+' linux amd64\n'};if(args[1]==='tag')return {stdout:''};await writeFile(args[args.indexOf('--output')+1],'fake image archive');return {stdout:''};};
 const result=await exportOffline({directory,name:'release-test',docker});
 assert.equal(result.manifest.secretsIncluded,false);assert.equal(result.manifest.files.length,10);assert.ok(result.manifest.files.every(file=>/^[a-f0-9]{64}$/.test(file.sha256)));
 const guide=await readFile(join(result.destination,'README.md'),'utf8');assert.doesNotMatch(guide,/npm ci|unavailable-in-package/);assert.match(guide,/docker image load/);assert.match(guide,/connecteurs natifs/);
 assert.ok(!(await readdir(result.destination)).includes('.env'));assert.match(await readFile(join(result.destination,'deploy/compose.images.yaml'),'utf8'),/image: polytalk-offline\/polytalk:sha256-a{64}/);
 assert.deepEqual(await verifyOffline({directory:result.destination}),{verified:10});await writeFile(join(result.destination,'images.tar'),'tampered');await assert.rejects(verifyOffline({directory:result.destination}),/mismatch/);
 assert.equal(calls.at(-1).filter(arg=>arg.startsWith('polytalk-offline/')).length,4);
 await assert.rejects(exportOffline({directory,name:'release-test',docker}),/EEXIST/);await assert.rejects(exportOffline({directory,name:'../escape',docker}),/Invalid release/);
});
