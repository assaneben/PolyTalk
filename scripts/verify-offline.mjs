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
import {readFile,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const expected=['deploy/compose.yaml','deploy/compose.intranet.yaml','deploy/compose.internet.yaml','deploy/synapse/polytalk_policy.py','scripts/setup.mjs','scripts/verify-offline.mjs','README.md','documentation/04-livrables/2026-10-18-distribution-internet-intranet.html','deploy/compose.images.yaml','images.tar'];
export async function verifyOffline({directory=process.cwd()}={}){
 const root=resolve(directory);async function regular(file){let path=join(root,file);const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Invalid release file');while(path!==root){path=dirname(path);if((await lstat(path)).isSymbolicLink())throw Error('Linked release path');}return stat;}
 if((await regular('manifest.json')).size>1048576)throw Error('Manifest too large');
 const manifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 if(manifest.schema!=='polytalk.offline.v1'||manifest.secretsIncluded!==false||!Array.isArray(manifest.files)||manifest.files.length!==expected.length)throw Error('Invalid release manifest');
 const seen=new Set();for(const entry of manifest.files){if(!expected.includes(entry.path)||seen.has(entry.path)||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error('Invalid inventory entry');seen.add(entry.path);if((await regular(entry.path)).size!==entry.bytes)throw Error('Release size mismatch');const hash=createHash('sha256');for await(const chunk of createReadStream(join(root,entry.path)))hash.update(chunk);if(hash.digest('hex')!==entry.sha256)throw Error('Release hash mismatch');}
 return {verified:seen.size};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{const result=await verifyOffline();console.log('Intégrité vérifiée : '+result.verified+' fichiers.');}catch{console.error('Paquet invalide ou altéré : ne pas importer les images.');process.exitCode=1;}}
