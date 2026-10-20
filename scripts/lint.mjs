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
import {readdir,readFile,lstat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,extname} from 'node:path';
const roots=['web','server','scripts','tests','agent/src','agent/adapters','agent/tests','deploy/synapse'];
let checked=0;const errors=[];
async function visit(path){
 const stat=await lstat(path);if(stat.isSymbolicLink())throw Error('Linked source refused');
 if(stat.isDirectory()){for(const entry of await readdir(path))if(entry!=='__pycache__')await visit(join(path,entry));return;}
 const extension=extname(path);if(!['.js','.mjs','.rs','.py','.css','.html'].includes(extension))return;
 const source=await readFile(path,'utf8');if(!/^(?:\/\*! @license|\/\/ Copyright|# Copyright|<!doctype html>[\s\r\n]+<!--)/i.test(source)||!source.split('\n').slice(0,10).join('\n').includes('SPDX-License-Identifier: GPL-3.0-or-later'))errors.push(path+': missing SPDX');
 if(['.js','.mjs'].includes(extension)){const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8',windowsHide:true});if(result.status!==0)errors.push(path+': invalid JavaScript');}checked++;
}
for(const root of roots)await visit(root);
const metadata=JSON.parse(await readFile('package.json','utf8'));if(metadata.license!=='GPL-3.0-or-later')errors.push('package.json: licence');
const license=await readFile('LICENSE','utf8');if(!license.includes('Version 3, 29 June 2007')||license.length<34000)errors.push('LICENSE: incomplete GPLv3');
console.log(JSON.stringify({checked,errors}));if(errors.length)process.exitCode=1;
