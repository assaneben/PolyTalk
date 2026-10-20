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
import {build} from 'esbuild';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
const fingerprint=(name,extension,bytes)=>`${name}.${createHash('sha256').update(bytes).digest('hex').slice(0,16)}.${extension}`;
export async function buildSite({sourceDir='web',outDir='dist',wasmPath='node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm'}={}){
  await mkdir(outDir,{recursive:true});
  const [wasm,style,template]=await Promise.all([readFile(wasmPath),readFile(join(sourceDir,'style.css')),readFile(join(sourceDir,'index.html'),'utf8')]);
  const crypto=fingerprint('crypto','wasm',wasm),css=fingerprint('style','css',style);
  const result=await build({entryPoints:[join(sourceDir,'app.js')],outdir:outDir,entryNames:'app',chunkNames:'chunk.[hash]',splitting:true,bundle:true,write:false,format:'esm',platform:'browser',target:['es2022'],sourcemap:false,logLevel:'silent',define:{__POLYTALK_CRYPTO_WASM__:JSON.stringify('/'+crypto)}});
  const javascript=result.outputFiles.find(file=>resolve(file.path)===resolve(join(outDir,'app.js'))).contents;
  const script=fingerprint('app','js',javascript);
  // Persist lazy local chunks before publishing their importing entry point.
  await Promise.all(result.outputFiles.filter(file=>!file.path.endsWith('/app.js')&&!file.path.endsWith('\\app.js')).map(file=>writeFile(file.path,file.contents)));
  let logo,appIcon;
  if(template.includes('/brand-logo.png')){const bytes=await readFile(join(sourceDir,'assets','polytalk-logo.png'));logo=fingerprint('brand','png',bytes);await writeFile(join(outDir,logo),bytes);}
  if(template.includes('/manifest.webmanifest')){
    const source=await readFile(join(sourceDir,'assets','polytalk-logo.png'));
    // Square vector container embeds the unmodified supplied logo, with no remote dependency.
    const icon=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#153f3d"/><image x="48" y="88" width="416" height="336" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${source.toString('base64')}"/></svg>`);
    const iconName=fingerprint('app-icon','svg',icon);await writeFile(join(outDir,iconName),icon);
    appIcon=iconName;
    await writeFile(join(outDir,'manifest.webmanifest'),JSON.stringify({id:'/',name:'PolyTalk',short_name:'PolyTalk',description:'Communication et coordination entre humains et agents IA',lang:'fr',start_url:'/',scope:'/',display:'standalone',background_color:'#153f3d',theme_color:'#174d4c',prefer_related_applications:false,icons:[{src:'/'+iconName,sizes:'any',type:'image/svg+xml',purpose:'any'}]},null,2)+'\n');
  }
  const html=template.replaceAll('/brand-logo.png','/'+logo).replaceAll('/app.js','/'+script).replaceAll('/style.css','/'+css);
  await Promise.all([writeFile(join(outDir,script),javascript),writeFile(join(outDir,css),style),writeFile(join(outDir,crypto),wasm)]);
  const chunks=result.outputFiles.filter(file=>basename(file.path)!=='app.js').map(file=>basename(file.path));
  await writeFile(join(outDir,'assets.json'),JSON.stringify({script,style:css,crypto,chunks,...(logo?{logo}:{}),...(appIcon?{manifest:'manifest.webmanifest',icon:appIcon}:{})},null,2)+'\n');
  // Publish HTML last: every referenced content-addressed asset already exists.
  await writeFile(join(outDir,'.index.html.tmp'),html);
  await rename(join(outDir,'.index.html.tmp'),join(outDir,'index.html'));
  return {script,style:css,crypto};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){await buildSite();console.log('Polytalk : ressources locales versionnées prêtes.');}
