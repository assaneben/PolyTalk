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
import {resolve,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
const path=value=>{if(typeof value!=='string'||!isAbsolute(value)||/[\r\n\0]/.test(value))throw Error('Absolute executable path required');return value;};
export function integrationConfig({root=process.cwd(),node=process.execPath,graphify,graph,graphifyPython=false,xerj,xerjUrl='http://127.0.0.1:9320',target='mcp'}={}){
 root=path(resolve(root));const servers={polytalk:{command:path(node),args:[resolve(root,'agent/adapters/mcp.mjs')],env:{}}};
 if(Boolean(graphify)!==Boolean(graph))throw Error('Graphify executable and graph must be provided together');
 if(graphify)servers.graphify={command:path(node),args:[resolve(root,'agent/adapters/context-proxy.mjs'),'graphify'],env:{POLYTALK_GRAPHIFY_BINARY:path(graphify),POLYTALK_GRAPHIFY_GRAPH:path(graph),POLYTALK_GRAPHIFY_PYTHON:graphifyPython?'1':'0',GRAPHIFY_BACKEND:'none'}};
 if(xerj){const url=new URL(xerjUrl);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.origin!=='http://127.0.0.1:9320')throw Error('Local authenticated XERJ URL required');servers.xerj={command:path(node),args:[resolve(root,'agent/adapters/context-proxy.mjs'),'xerj'],env:{POLYTALK_XERJ_BINARY:path(xerj),XERJ_URL:url.origin,XERJ_DISABLE_FEEDBACK:'true'}};}
 if(target==='mcp')return {mcpServers:servers};
 if(target!=='deepseek')throw Error('Unknown target');
 // Cordis consumes YAML. JSON quoting prevents paths from becoming YAML code.
 return Object.entries(servers).map(([name,server])=>[
  '- id: '+name+'-polytalk-integration',"  name: '@deepseek-ai/dsh-mcp-client'",'  config:','    serverName: '+name,'    transport: stdio','    command: '+JSON.stringify(server.command),'    args: '+JSON.stringify(server.args),'    cwd: '+JSON.stringify(root),'    toolCallTimeoutMs: 75000','    env:',
  ...Object.entries(server.env).map(([key,value])=>'      '+key+': '+JSON.stringify(value)),
  ...(name==='polytalk'?['      POLYTALK_AGENT_PASSWORD: !!js process.env.POLYTALK_AGENT_PASSWORD','      POLYTALK_AGENT_STORE: !!js process.env.POLYTALK_AGENT_STORE','      POLYTALK_AGENT_BINARY: !!js process.env.POLYTALK_AGENT_BINARY','      POLYTALK_ORIGIN: !!js process.env.POLYTALK_ORIGIN']:[]),
  ...(name==='xerj'?['      XERJ_AUTH: !!js process.env.XERJ_AUTH']:[])
 ].join('\n')).join('\n\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const args=process.argv.slice(2);if(args.length>1)throw Error('Expected mcp or deepseek');const result=integrationConfig({target:args[0]||'mcp',graphify:process.env.POLYTALK_GRAPHIFY_BINARY,graph:process.env.POLYTALK_GRAPHIFY_GRAPH,graphifyPython:process.env.POLYTALK_GRAPHIFY_PYTHON==='1',xerj:process.env.POLYTALK_XERJ_BINARY});console.log(typeof result==='string'?result:JSON.stringify(result,null,2));}
 catch{console.error('Configuration refusée : cible, chemins absolus et paires de paramètres requis. Aucun secret affiché.');process.exitCode=1;}
}
