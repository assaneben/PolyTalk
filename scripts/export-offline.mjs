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
import {mkdir,readFile,writeFile,lstat,copyFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
const run=promisify(execFile);
export const imageReferences={polytalk:'polytalk/server:0.1.0',synapse:'ghcr.io/element-hq/synapse@sha256:97665cd4539dcf107c69fb6afdb720e1d1c9c09fb2b5701fb13d6c33b22cd8f0',postgres:'postgres:16-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea',node:'node@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f'};
const files=['deploy/compose.yaml','deploy/compose.intranet.yaml','deploy/compose.internet.yaml','deploy/synapse/polytalk_policy.py','scripts/setup.mjs','scripts/verify-offline.mjs','README.md','documentation/04-livrables/2026-10-18-distribution-internet-intranet.html'];
async function noLinks(root,path){let current=path;while(true){try{if((await lstat(current)).isSymbolicLink())throw Error('Linked deployment path refused');}catch(error){if(error.code!=='ENOENT')throw error;}if(current===root)break;const parent=dirname(current);if(parent===current)throw Error('Path outside deployment root');current=parent;}}
async function hash(path){const digest=createHash('sha256');for await(const chunk of createReadStream(path))digest.update(chunk);return digest.digest('hex');}
export async function exportOffline({directory=process.cwd(),name='polytalk-offline-'+new Date().toISOString().replace(/[:.]/g,'-'),docker=run}={}){
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(name))throw Error('Invalid release name');
 const root=resolve(directory),parent=join(root,'.local','releases'),destination=join(parent,name);
 await noLinks(root,parent);await mkdir(parent,{recursive:true});await mkdir(destination);
 // Export only an explicit public deployment allowlist. Never recurse into the installation.
 for(const file of files){const source=join(root,file);await noLinks(root,source);if(!(await lstat(source)).isFile())throw Error('Deployment source is not a regular file');await mkdir(dirname(join(destination,file)),{recursive:true});await copyFile(source,join(destination,file));}
 const readmePath=join(destination,'README.md'),readme=await readFile(readmePath,'utf8'),targetStart=readme.indexOf('Sur la machine cible,');
 const targetEnd=readme.indexOf('<!-- offline-install:end -->',Math.max(0,targetStart)),targetInstructions=readme.slice(targetStart,targetEnd<0?undefined:targetEnd);
 const targetReadme=targetStart>=0?'# PolyTalk — paquet serveur hors ligne\n\nCe paquet installe le serveur et le client web à partir des images fournies. Il ne contient aucun secret ni aucune donnée de l’installation source. Les connecteurs natifs des agents se préparent séparément depuis le dépôt, pour chaque OS.\n\n[Guide autonome de distribution](documentation/04-livrables/2026-10-18-distribution-internet-intranet.html)\n\nTransférez ce paquet par un canal de confiance. Les sommes SHA-256 détectent les modifications mais ne constituent pas une signature d’éditeur. Vérifiez le paquet avant d’importer ses images.\n\n'+targetInstructions:readme.replace('[le registre documentaire](documentation/00-pilotage/index.html)','[le guide de distribution](documentation/04-livrables/2026-10-18-distribution-internet-intranet.html)');
 await writeFile(readmePath,targetReadme);
 const guidePath=join(destination,'documentation/04-livrables/2026-10-18-distribution-internet-intranet.html');await writeFile(guidePath,(await readFile(guidePath,'utf8')).replace('../00-pilotage/index.html','../../README.md'));
 const images={};for(const [service,reference]of Object.entries(imageReferences)){
  const {stdout}=await docker('docker',['image','inspect','--format','{{.Id}} {{.Os}} {{.Architecture}}',reference],{windowsHide:true,maxBuffer:1048576});const [id,os,architecture]=stdout.trim().split(' ');if(!/^sha256:[a-f0-9]{64}$/.test(id)||!['linux'].includes(os)||!['amd64','arm64'].includes(architecture))throw Error('Invalid image identity or platform');const exportTag=`polytalk-offline/${service}:sha256-${id.slice(7)}`;await docker('docker',['image','tag',id,exportTag],{windowsHide:true,maxBuffer:1048576});images[service]={reference,id,os,architecture,exportTag};
 }
 const archive=join(destination,'images.tar');await docker('docker',['image','save','--output',archive,...Object.values(images).map(image=>image.exportTag)],{windowsHide:true,maxBuffer:1048576});
 const mapping={postgres:images.postgres.exportTag,synapse:images.synapse.exportTag,'synapse-storage-init':images.synapse.exportTag,'synapse-config-init':images.synapse.exportTag,polytalk:images.polytalk.exportTag,'polytalk-storage-init':images.polytalk.exportTag};
 await writeFile(join(destination,'deploy/compose.images.yaml'),'services:\n'+Object.entries(mapping).map(([service,id])=>`  ${service}:\n    image: ${id}\n`).join(''),{flag:'wx'});
 const paths=[...files,'deploy/compose.images.yaml','images.tar'],inventory=[];for(const file of paths){const path=join(destination,file);inventory.push({path:file,bytes:(await lstat(path)).size,sha256:await hash(path)});}
 const manifest={schema:'polytalk.offline.v1',createdAt:new Date().toISOString(),exporterPlatform:process.platform,images,files:inventory,secretsIncluded:false};
 await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return {destination,manifest};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){try{const result=await exportOffline();console.log('Paquet hors ligne créé : '+result.destination);}catch{console.error('Export incomplet. Vérifiez les images locales et les droits. Aucun secret d’installation exporté.');process.exitCode=1;}}
