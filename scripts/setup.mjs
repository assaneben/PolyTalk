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
import { writeFile, readFile, appendFile, mkdir, lstat } from 'node:fs/promises';
import { randomBytes, createHmac } from 'node:crypto';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Import-safe for deployment tooling: no key generation or writes before setup().
export async function setup({directory=process.cwd(),containerized=false,publicOrigin,serverName,signupMode}={}) {
  if(signupMode!==undefined&&!['open','invitation'].includes(signupMode))throw Error('Mode d’inscription invalide.');
  const initialOrigin=publicOrigin||'http://localhost:3210',initialServer=serverName||'localhost';
  const url=new URL(initialOrigin),serverUrl=new URL('https://'+initialServer);
  if(url.origin!==initialOrigin||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))||url.username||url.password)throw Error('Origine de déploiement invalide');
  if(serverUrl.host!==initialServer||serverUrl.pathname!=='/'||serverUrl.username||serverUrl.password||serverUrl.search||serverUrl.hash)throw Error('Nom Matrix invalide');
  const envPath=resolve(directory,'.env');
  const configDir=resolve(directory,'.local/synapse');
  // Refuse file symlinks and directory junctions before following any generated
  // path. Installation directories are private to the local operator.
  for(const path of [envPath,resolve(directory,'.local'),configDir,
    resolve(configDir,'homeserver.yaml'),resolve(configDir,'log.config')]){
    try {if((await lstat(path)).isSymbolicLink())throw Error('Configuration path is a symbolic link');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const secret=()=>randomBytes(32).toString('base64url');
  const content=[
    '# Local installation secrets. Do not publish or commit this file.',
    'HOST=127.0.0.1','PORT=3210',`PUBLIC_ORIGIN=${initialOrigin}`,
    'MATRIX_UPSTREAM=http://127.0.0.1:8008',`MATRIX_SERVER_NAME=${initialServer}`,
    'POLYTALK_EDITION=intranet','DATA_DIR=data',
    `POLICY_SECRET=${secret()}`,`REGISTRATION_SECRET=${secret()}`,`SIGNUP_CODE=${signupMode==='invitation'?secret():''}`,'',
  ].join('\n');
  let created=false;
  try {
    // wx is atomic and refuses existing files, including symlinks; 0600 on POSIX.
    await writeFile(envPath,content,{flag:'wx',mode:0o600});
    created=true;
  } catch(error) {
    if(error.code!=='EEXIST')throw error;
  }
  const env=parseEnv(await readFile(envPath,'utf8'));
  if(publicOrigin&&env.PUBLIC_ORIGIN!==publicOrigin||serverName&&env.MATRIX_SERVER_NAME!==serverName)throw Error('Une installation existante conserve son origine et son nom Matrix. Préparer une migration explicite.');
  // Existing deployments keep their chosen policy unless explicitly changed.
  if(signupMode!==undefined){
    const code=signupMode==='invitation'?(env.SIGNUP_CODE||secret()):'';
    if(env.SIGNUP_CODE!==code){
      const current=await readFile(envPath,'utf8');
      await writeFile(envPath,/^SIGNUP_CODE=.*$/m.test(current)?current.replace(/^SIGNUP_CODE=.*$/gm,`SIGNUP_CODE=${code}`):current+`\nSIGNUP_CODE=${code}\n`,{mode:0o600});
      env.SIGNUP_CODE=code;
    }
  }
  // Upgrade an existing installation without rotating any of its keys.
  if(!env.POSTGRES_PASSWORD){env.POSTGRES_PASSWORD=secret();await appendFile(envPath,`\nPOSTGRES_PASSWORD=${env.POSTGRES_PASSWORD}\n`);}
  if(!env.MATRIX_JWT_SECRET){env.MATRIX_JWT_SECRET=secret();await appendFile(envPath,`\nMATRIX_JWT_SECRET=${env.MATRIX_JWT_SECRET}\n`);}
  if(env.MATRIX_JWT_SECRET.length<43)throw Error('Wallet JWT secret is too short');
  if(!env.POLICY_SECRET||!env.REGISTRATION_SECRET)throw Error('Installation secrets missing');
  await mkdir(configDir,{recursive:true,mode:0o700});
  const config={server_name:env.MATRIX_SERVER_NAME||'localhost',pid_file:'/data/homeserver.pid',
    public_baseurl:env.PUBLIC_ORIGIN||'http://localhost:3210',report_stats:false,
    listeners:[{port:8008,tls:false,type:'http',x_forwarded:false,bind_addresses:['0.0.0.0'],resources:[{names:['client'],compress:false}]}],
    database:{name:'psycopg2',args:{user:'synapse',password:env.POSTGRES_PASSWORD,database:'synapse',host:'postgres',port:5432,cp_min:5,cp_max:10}},
    log_config:'/config/log.config',media_store_path:'/data/media_store',signing_key_path:'/data/localhost.signing.key',
    enable_registration:false,enable_registration_without_verification:false,
    ui_auth:{session_timeout:0},
    registration_shared_secret:env.REGISTRATION_SECRET,
    jwt_config:{enabled:true,secret:env.MATRIX_JWT_SECRET,algorithm:'HS256',issuer:env.PUBLIC_ORIGIN||'http://localhost:3210',audiences:[env.PUBLIC_ORIGIN||'http://localhost:3210']},
    macaroon_secret_key:createHmac('sha256',env.REGISTRATION_SECRET).update('polytalk-synapse-macaroon-v1').digest('base64url'),
    trusted_key_servers:[],federation_domain_whitelist:[],allow_public_rooms_without_auth:false,
    allow_public_rooms_over_federation:false,enable_room_list_search:false,
    user_directory:{enabled:false},turn_uris:[],max_upload_size:'10M',
    modules:[{module:'polytalk_policy.PolytalkPolicy',config:{server_name:env.MATRIX_SERVER_NAME||'localhost',
      policy_url:containerized?'http://polytalk:3210/internal/evaluate':`http://host.docker.internal:${env.PORT||3210}/internal/evaluate`,policy_secret:env.POLICY_SECRET}}]};
  await writeFile(resolve(configDir,'homeserver.yaml'),JSON.stringify(config,null,2)+'\n',{mode:0o600});
  await writeFile(resolve(configDir,'log.config'),JSON.stringify({version:1,formatters:{basic:{format:'%(asctime)s %(levelname)s %(name)s %(message)s'}},
    handlers:{console:{class:'logging.StreamHandler',formatter:'basic'}},root:{level:'WARNING',handlers:['console']},
    loggers:{'synapse.access.http.8008':{level:'WARNING'}}},null,2)+'\n',{mode:0o600});
  return {envPath,created};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  try {
    const option=name=>{const index=process.argv.indexOf(name);if(index<0)return undefined;const value=process.argv[index+1];if(!value||value.startsWith('--'))throw Error('Option sans valeur');return value;};
    const {created}=await setup({containerized:process.argv.includes('--container'),publicOrigin:option('--origin'),serverName:option('--server-name'),signupMode:option('--signup-mode')});
    console.log(created?'Configuration locale et pile Matrix générées. Conservez .env privé.':'Clés existantes conservées ; configuration Matrix générée.');
  } catch {
    console.error('Impossible de créer la configuration locale. Vérifiez les droits du répertoire.');
    process.exitCode=1;
  }
}
