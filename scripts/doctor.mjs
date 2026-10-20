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
import {join,resolve,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {parseEnv} from 'node:util';

export async function diagnose({root=process.cwd(),origin,fetchImpl=fetch}={}){
 const checks=[];let configuredOrigin='http://localhost:3210';
 const check=async(id,label,action)=>{try{await action();checks.push({id,label,ok:true});}catch{checks.push({id,label,ok:false});}};
 await check('node','Node.js 24 ou ultérieur',async()=>{if(Number(process.versions.node.split('.')[0])<24)throw Error();});
 await check('configuration','Configuration locale présente',async()=>{const config=parseEnv(await readFile(join(root,'.env'),'utf8'));if(!config.POLICY_SECRET||!config.REGISTRATION_SECRET)throw Error();if(config.PUBLIC_ORIGIN)configuredOrigin=config.PUBLIC_ORIGIN;});
 await check('build','Ressources web présentes et empreintes cohérentes',async()=>{
  const directory=join(root,'dist'),html=await readFile(join(directory,'index.html'));if(!html.length)throw Error();
  const assets=JSON.parse(await readFile(join(directory,'assets.json'),'utf8'));
  const read=async name=>{if(typeof name!=='string'||name!==basename(name)||!/^[A-Za-z0-9._-]+$/.test(name))throw Error();const path=join(directory,name),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64*1024*1024)throw Error();return readFile(path);};
  for(const name of [assets.script,assets.style,assets.crypto,...[assets.logo,assets.icon].filter(Boolean)]){const expected=/\.([a-f0-9]{16})\.[^.]+$/.exec(name);if(!expected||createHash('sha256').update(await read(name)).digest('hex').slice(0,16)!==expected[1])throw Error();}
  if(!Array.isArray(assets.chunks))throw Error();for(const name of assets.chunks)await read(name);
 });
 await check('services','API PolyTalk et Matrix disponibles',async()=>{
  const base=new URL(origin||configuredOrigin);if(base.origin!==base.href.replace(/\/$/,'')||base.username||base.password||!['http:','https:'].includes(base.protocol))throw Error();
  const response=await fetchImpl(base.origin+'/api/health',{redirect:'manual',signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error();
  const text=await response.text();if(text.length>8192)throw Error();const health=JSON.parse(text);if(health.status!=='ready'||health.matrix!==true)throw Error();
 });
 return {ready:checks.every(item=>item.ok),checks,note:'Ce diagnostic ne remplace pas les tests de chiffrement, de connecteurs et d’interface.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const report=await diagnose();console.log(JSON.stringify(report,null,2));if(!report.ready)process.exitCode=1;}
