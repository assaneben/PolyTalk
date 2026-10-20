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
import {readdir,lstat,mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const roots=['web','server','agent','scripts','tests','deploy','docs','examples','.github'];
const excluded=new Set(['target','node_modules','.local','data','__pycache__']);
const rootFiles=['README.md','README.en.md','LICENSE','CHANGELOG.md','CONTRIBUTING.md','CODE_OF_CONDUCT.md','SECURITY.md','SUPPORT.md','CITATION.cff','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','.gitignore','.gitattributes','.editorconfig','.nvmrc','.env.example','.dockerignore'];
export function publicTextIssue(text){
 if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))return 'private-key';
 if(/\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(text))return 'github-token';
 if(/[A-Za-z]:[\\/]Users[\\/][^\s\\/"<>]+[\\/]/.test(text))return 'personal-path';
 return null;
}
export async function exportPublic({root=process.cwd(),name='public-export'}={}){
 if(!/^[a-z0-9-]{1,80}$/.test(name))throw Error('Invalid export name');
 root=resolve(root);const parent=join(root,'.local');await mkdir(parent,{recursive:true});if((await lstat(parent)).isSymbolicLink())throw Error('Linked export parent refused');
 const destination=join(parent,name);await mkdir(destination);const files=[];
 async function copy(source,path){
  const stat=await lstat(source);if(stat.isSymbolicLink())throw Error('Linked source refused: '+path);
  if(stat.isDirectory()){for(const entry of (await readdir(source)).sort()){if(!excluded.has(entry))await copy(join(source,entry),path+'/'+entry);}return;}
  if(!stat.isFile()||/\.pyc$/.test(path))return;if(stat.size>20*1024*1024)throw Error('Oversize source: '+path);
  const bytes=await readFile(source);if(!/\.(png|jpg|jpeg|webp|ico|wasm)$/.test(path)){const issue=publicTextIssue(bytes.toString('utf8'));if(issue)throw Error('Publication check '+issue+': '+path);}
  const target=join(destination,path);await mkdir(dirname(target),{recursive:true});await copyFile(source,target);files.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 for(const name of rootFiles)await copy(join(root,name),name);
 for(const dir of roots)await copy(join(root,dir),dir);
 // Operational documents only; historical audits, raw archives and logo laboratory stay local.
 for(const dir of ['00-pilotage','01-cadrage','02-architecture','03-recherche','04-livrables','06-conception-ux'])await copy(join(root,'documentation',dir),'documentation/'+dir);
 await writeFile(join(destination,'PUBLICATION-MANIFEST.json'),JSON.stringify({schema:'polytalk.public-source.v1',files,excluded:['.env','data/','.local/','node_modules/','agent/target/','private historical reports'],securityReview:'Mechanical checks only; artwork rights and maintainer settings still require review.'},null,2)+'\n');
 return {destination,files:files.length,manifest:join(destination,'PUBLICATION-MANIFEST.json')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const args=process.argv.slice(2);if(args.length>1)throw Error('Expected at most one export name');console.log(JSON.stringify(await exportPublic({name:args[0]||'public-export'})));}catch(error){console.error(error.message);process.exitCode=1;}}
