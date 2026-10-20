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
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildSite} from '../scripts/build.mjs';

test('normal reload fetches current content-hashed JS CSS and WASM after rebuilding changed assets',async t=>{
  const root=await mkdtemp(join(tmpdir(),'polytalk-build-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const sourceDir=join(root,'web'),outDir=join(root,'dist'),wasmPath=join(root,'crypto.wasm');await mkdir(sourceDir);
  await writeFile(join(sourceDir,'index.html'),'<link rel="stylesheet" href="/style.css"><script type="module" src="/app.js"></script><link rel="manifest" href="/manifest.webmanifest"><img src="/brand-logo.png">');
  await mkdir(join(sourceDir,'assets'));await writeFile(join(sourceDir,'assets','polytalk-logo.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64'));
  await writeFile(join(sourceDir,'wallet.js'),'export const walletSdkMarker="lazy-only-wallet-code";');
  await writeFile(join(sourceDir,'app.js'),'export const revision=1;export const wasmUrl=__POLYTALK_CRYPTO_WASM__;export function loadWallet(){return import("./wallet.js")}');
  await writeFile(join(sourceDir,'style.css'),'body{color:teal}');
  await writeFile(wasmPath,new Uint8Array([0,97,115,109,1,0,0,0]));
  async function buildAndCheck(){
    await buildSite({sourceDir,outDir,wasmPath});
    const html=await readFile(join(outDir,'index.html'),'utf8');
    const script=html.match(/src="\/([^"]+)"/)[1],css=html.match(/href="\/([^"]+)"/)[1];
    assert.match(script,/^app\.[0-9a-f]{16}\.js$/);
    assert.match(css,/^style\.[0-9a-f]{16}\.css$/);
    const manifest=JSON.parse(await readFile(join(outDir,'manifest.webmanifest'),'utf8'));assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.icons[0].type,'image/svg+xml');assert.match(await readFile(join(outDir,manifest.icons[0].src.slice(1)),'utf8'),/data:image\/png;base64,/);
    const module=await import(pathToFileURL(join(outDir,script)).href);
    const assets=JSON.parse(await readFile(join(outDir,'assets.json'),'utf8'));assert.ok(assets.chunks.length>0);for(const chunk of assets.chunks)assert.ok((await readFile(join(outDir,chunk))).length>0);
    assert.doesNotMatch(await readFile(join(outDir,script),'utf8'),/lazy-only-wallet-code/);assert.equal((await module.loadWallet()).walletSdkMarker,'lazy-only-wallet-code');
    assert.match(module.wasmUrl,/^\/crypto\.[0-9a-f]{16}\.wasm$/);
    for(const name of [script,css,module.wasmUrl.slice(1)]){
      const bytes=await readFile(join(outDir,name));
      assert.equal(name.split('.')[1],createHash('sha256').update(bytes).digest('hex').slice(0,16));
    }
    return {script,css,wasm:module.wasmUrl,revision:module.revision};
  }
  const before=await buildAndCheck();assert.equal(before.revision,1);
  await writeFile(join(sourceDir,'app.js'),'export const revision=2;export const wasmUrl=__POLYTALK_CRYPTO_WASM__;export function loadWallet(){return import("./wallet.js")}');
  await writeFile(join(sourceDir,'style.css'),'body{color:navy}');
  await writeFile(wasmPath,new Uint8Array([0,97,115,109,1,0,0,0,0,1,0]));
  const after=await buildAndCheck();assert.equal(after.revision,2);
  assert.notEqual(after.script,before.script);assert.notEqual(after.css,before.css);assert.notEqual(after.wasm,before.wasm);
});
