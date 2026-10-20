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
import {lstat,readdir,mkdir,copyFile,writeFile,mkdtemp} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
const roots=['web','server','agent/src','agent/adapters','scripts'];
const extensions=new Set(['.js','.mjs','.rs','.css','.html']);
// Only application sources: never walk account stores, .env, logs or conversation exports.
export async function prepareCorpus(root=process.cwd()){
 const base=join(root,'.local','agent-context');await mkdir(base,{recursive:true});
 const target=await mkdtemp(join(base,'sources-')),files=[];let size=0;
 async function visit(path,relative){
  const info=await lstat(path);if(info.isSymbolicLink())throw Error('SYMLINK_REFUSED');
  if(info.isDirectory()){for(const name of (await readdir(path)).sort())await visit(join(path,name),join(relative,name));return;}
  if(!extensions.has(extname(path))||!info.isFile())return;
  size+=info.size;if(info.size>1024*1024||size>20*1024*1024)throw Error('CORPUS_TOO_LARGE');
  const destination=join(target,relative);await mkdir(resolve(destination,'..'),{recursive:true});await copyFile(path,destination);files.push(relative.replaceAll('\\','/'));
 }
 for(const dir of roots)await visit(join(root,dir),dir);
 const manifest={version:1,root:target,files,bytes:size,scope:'Application sources only. No messages or private account data.'};
 await writeFile(join(target,'corpus-manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){console.log(JSON.stringify(await prepareCorpus()));}
