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
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Store } from './store.mjs';
import { createApp } from './app.mjs';
if(existsSync('.env'))process.loadEnvFile('.env');
const port=Number(process.env.PORT||3210),host=process.env.HOST||'127.0.0.1';
const origin=process.env.PUBLIC_ORIGIN||`http://localhost:${port}`;
if(!['127.0.0.1','::1','localhost'].includes(host) && new URL(origin).protocol!=='https:')throw Error('Une exposition réseau exige PUBLIC_ORIGIN en HTTPS et un reverse proxy TLS.');
const dir=resolve(process.env.DATA_DIR||'data');mkdirSync(dir,{recursive:true});
const store=new Store(resolve(dir,'polytalk.sqlite'));
const server=createApp({store,upstream:process.env.MATRIX_UPSTREAM||'http://127.0.0.1:8008',serverName:process.env.MATRIX_SERVER_NAME||'localhost',origin,
 trustedProxyPeers:(process.env.TRUSTED_PROXY_PEERS||'').split(',').map(s=>s.trim()).filter(Boolean),edition:process.env.POLYTALK_EDITION||'intranet',policySecret:process.env.POLICY_SECRET,registrationSecret:process.env.REGISTRATION_SECRET,inviteCode:process.env.SIGNUP_CODE||'',walletJwtSecret:process.env.MATRIX_JWT_SECRET||'',walletConnectProjectId:process.env.WALLETCONNECT_PROJECT_ID||'',approvers:(process.env.POLYTALK_APPROVERS||'').split(',').map(s=>s.trim()).filter(Boolean)});
server.listen(port,host,()=>console.log(`Polytalk : ${origin}`));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(async()=>{await server.cleanupAuthentication();store.close();process.exit(0);}));
