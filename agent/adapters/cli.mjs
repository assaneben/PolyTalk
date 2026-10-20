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
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createMcpServer} from './mcp.mjs';
import {NativeBridge} from './bridge.mjs';

export async function readArguments(input){
 let size=0;const chunks=[];
 for await(const chunk of input){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>65536)throw Error('INPUT_TOO_LARGE');chunks.push(bytes);}
 const text=Buffer.concat(chunks).toString('utf8');let value;
 try{value=JSON.parse(text||'{}');}catch{throw Error('INVALID_JSON');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('OBJECT_REQUIRED');
 return value;
}

// The MCP registry owns validation and permissions; the CLI never reimplements them.
export async function runCli(args,{input=process.stdin,bridgeFactory=()=>new NativeBridge()}={}){
 const argv=args.filter(arg=>arg!=='--json');
 if(!argv.length||argv.length===1&&argv[0]==='--help')return {usage:['tools','call TOOL < arguments.json','login < credentials.json'],format:'JSON',authentication:'Local encrypted native store; secrets only through stdin or operator environment.',delivery:'Never retry a send automatically after an uncertain result.'};
 if(!(argv.length===1&&['tools','login'].includes(argv[0])||argv.length===2&&argv[0]==='call'&&/^[a-z_]{1,80}$/.test(argv[1])))throw Error('INVALID_COMMAND');
 let bridge;
 if(argv[0]==='login'){
  const data=await readArguments(input);
  if(Object.keys(data).sort().join(',')!=='password,username'||!['username','password'].every(key=>typeof data[key]==='string'&&data[key].trim()&&Buffer.byteLength(data[key])<=1024))throw Error('INVALID_CREDENTIALS');
  try{bridge=bridgeFactory();await bridge.call('login',data);return {authenticated:true};}finally{data.password='';await bridge?.close();}
 }
 const data=argv[0]==='call'?await readArguments(input):null;
 const server=createMcpServer({call:(...params)=>{bridge??=bridgeFactory();return bridge.call(...params);}});
 const client=new Client({name:'polytalk-cli',version:'0.1.0'}),[a,b]=InMemoryTransport.createLinkedPair();
 try{
  await server.connect(b);await client.connect(a);
  if(argv[0]==='tools')return await client.listTools();
  return await client.callTool({name:argv[1],arguments:data},undefined,{timeout:75000});
 }finally{await client.close();await server.close();await bridge?.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{const result=await runCli(process.argv.slice(2));console.log(JSON.stringify(result));if(result.isError)process.exitCode=1;}
 catch(error){const allowed=['INPUT_TOO_LARGE','INVALID_JSON','OBJECT_REQUIRED','INVALID_COMMAND','INVALID_CREDENTIALS'];console.log(JSON.stringify({isError:true,error:allowed.includes(error.message)?error.message:'OPERATION_REFUSED_OR_UNAVAILABLE'}));process.exitCode=1;}
}
