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
import {mkdtemp,readFile,rm,writeFile,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {parseEnv} from 'node:util';
import {setup} from '../scripts/setup.mjs';

// Linux exercises file symlinks; Windows file symlinks require a privilege this
// user lacks, so its actual directory-junction reparse points exercise rejection.
const linkPath=(target,path)=>symlink(process.platform==='win32'?dirname(target):target,path,process.platform==='win32'?'junction':'file');
test('signup is open by default and invitation mode can be explicitly enabled or disabled without rotating other keys',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'polytalk-signup-mode-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await setup({directory});const initial=parseEnv(await readFile(join(directory,'.env'),'utf8'));assert.equal(initial.SIGNUP_CODE,'');
 await setup({directory,signupMode:'invitation'});const invited=parseEnv(await readFile(join(directory,'.env'),'utf8'));assert.ok(invited.SIGNUP_CODE.length>=43);assert.equal(invited.POLICY_SECRET,initial.POLICY_SECRET);assert.equal(invited.REGISTRATION_SECRET,initial.REGISTRATION_SECRET);
 await setup({directory});assert.equal(parseEnv(await readFile(join(directory,'.env'),'utf8')).SIGNUP_CODE,invited.SIGNUP_CODE);
 await setup({directory,signupMode:'open'});const open=parseEnv(await readFile(join(directory,'.env'),'utf8'));assert.equal(open.SIGNUP_CODE,'');assert.equal(open.MATRIX_JWT_SECRET,initial.MATRIX_JWT_SECRET);
 await assert.rejects(setup({directory,signupMode:'invalid'}),/inscription/);
});

test('setup renders private Synapse configuration and preserves existing installation keys',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'polytalk-matrix-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const previous='POLICY_SECRET='+ 'p'.repeat(43)+'\nREGISTRATION_SECRET='+ 'r'.repeat(43)+'\nSIGNUP_CODE='+ 'c'.repeat(43)+'\n';
  await writeFile(join(directory,'.env'),previous);
  await setup({directory});
  const env=parseEnv(await readFile(join(directory,'.env'),'utf8'));
  assert.equal(env.POLICY_SECRET,'p'.repeat(43));
  assert.ok(env.POSTGRES_PASSWORD?.length>=43);
  const config=JSON.parse(await readFile(join(directory,'.local/synapse/homeserver.yaml'),'utf8'));
  assert.equal(config.database.args.password,env.POSTGRES_PASSWORD);
  assert.equal(config.modules[0].config.policy_secret,env.POLICY_SECRET);
  assert.equal(config.registration_shared_secret,env.REGISTRATION_SECRET);
  assert.equal(config.jwt_config.secret,env.MATRIX_JWT_SECRET);assert.equal(config.jwt_config.algorithm,'HS256');assert.deepEqual(config.jwt_config.audiences,['http://localhost:3210']);
  assert.equal(config.enable_registration,false);
  assert.equal(config.ui_auth.session_timeout,0);
  assert.deepEqual(config.federation_domain_whitelist,[]);
  assert.deepEqual(config.listeners[0].resources,[{names:['client'],compress:false}]);
  const content=await readFile(join(directory,'.env'),'utf8');
  await setup({directory});
  assert.equal(await readFile(join(directory,'.env'),'utf8'),content);
});

test('setup rejects a linked environment file before changing the external target',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'polytalk-linked-env-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const target=join(directory,'private-existing.env');
  const original='POLICY_SECRET='+ 'p'.repeat(43)+'\nREGISTRATION_SECRET='+ 'r'.repeat(43)+'\n';
  await writeFile(target,original);
  await linkPath(target,join(directory,'.env'));
  await assert.rejects(setup({directory}),/symbolic link/i);
  assert.equal(await readFile(target,'utf8'),original);
});

test('setup rejects linked generated configuration paths before overwriting their targets',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'polytalk-linked-config-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  await setup({directory});
  const target=join(directory,'existing-config');
  await writeFile(target,'private unchanged');
  const generated=join(directory,'.local/synapse/homeserver.yaml');
  await rm(generated);await linkPath(target,generated);
  await assert.rejects(setup({directory}),/symbolic link/i);
  assert.equal(await readFile(target,'utf8'),'private unchanged');
  await rm(generated);await rm(join(directory,'.local/synapse'),{recursive:true});
  const external=join(directory,'other-directory');await mkdir(external);
  await symlink(external,join(directory,'.local/synapse'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(setup({directory}),/symbolic link/i);
});


test('container setup targets policy service DNS without rewriting installation secrets',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'polytalk-container-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await setup({directory,containerized:true});const original=await readFile(join(directory,'.env'),'utf8');
 const config=JSON.parse(await readFile(join(directory,'.local/synapse/homeserver.yaml'),'utf8'));assert.equal(config.modules[0].config.policy_url,'http://polytalk:3210/internal/evaluate');
 await setup({directory,containerized:true});assert.equal(await readFile(join(directory,'.env'),'utf8'),original);
});


test('new deployment chooses permanent origin and Matrix name without silently migrating an existing installation',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'polytalk-domain-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await setup({directory,containerized:true,publicOrigin:'https://messagerie.internal',serverName:'messagerie.internal'});
 const env=parseEnv(await readFile(join(directory,'.env'),'utf8'));assert.equal(env.PUBLIC_ORIGIN,'https://messagerie.internal');assert.equal(env.MATRIX_SERVER_NAME,'messagerie.internal');
 await assert.rejects(setup({directory,publicOrigin:'https://other.internal'}),/migration/);
 await assert.rejects(setup({directory,serverName:'bad\nPOLICY_SECRET=attacker'}));
});
