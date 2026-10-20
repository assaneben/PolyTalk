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
function memoryStorage(){const values=new Map();return {getKeys:async()=>[...values.keys()],getEntries:async()=>[...values.entries()],getItem:async key=>values.get(key),setItem:async(key,value)=>{values.set(key,value);},removeItem:async key=>{values.delete(key);},clear:()=>values.clear()};}
export async function connectWalletConnect({projectId,origin,onUri,signal,init}){
 if(!/^[a-f0-9]{32}$/i.test(projectId||''))throw Error('WalletConnect doit être configuré par l’administrateur avec le Project ID de PolyTalk.');
 if(signal?.aborted)throw Error('Connexion wallet annulée.');
 const storage=memoryStorage();
 const factory=init||(async options=>{const {default:SignClient}=await import('@walletconnect/sign-client');return SignClient.init(options);});
 const client=await factory({projectId,relayUrl:'wss://relay.walletconnect.org',logger:'silent',telemetryEnabled:false,storage,customStoragePrefix:'polytalk-auth-'+crypto.randomUUID(),metadata:{name:'PolyTalk',description:'Authentification uniquement. Aucune transaction.',url:origin,icons:[]}});
 let session,closed=false,changed=false;
 const sessionChanged=event=>{if(session&&event.topic===session.topic)changed=true;};
 for(const event of ['session_update','session_event','session_delete'])client.on?.(event,sessionChanged);
 const close=async()=>{if(closed)return;closed=true;let timer;try{if(session)await Promise.race([client.disconnect({topic:session.topic,reason:{code:6000,message:'Authentication complete'}}),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}catch{}finally{clearTimeout(timer);for(const event of ['session_update','session_event','session_delete'])client.off?.(event,sessionChanged);client.core.heartbeat.stop();await client.core.relayer.transportClose().catch(()=>{});storage.clear();}};
 const wait=promise=>new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};const abort=()=>{cleanup();reject(Error('Connexion wallet annulée.'));};timer=setTimeout(()=>{cleanup();reject(Error('Délai wallet dépassé. Recommencez lorsque votre wallet est prêt.'));},120000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});});
 try{
  const pairing=await wait(client.connect({requiredNamespaces:{eip155:{chains:['eip155:1'],methods:['personal_sign'],events:['accountsChanged','chainChanged']}}}));
  if(pairing.uri)await onUri(pairing.uri);
  session=await wait(pairing.approval());
  const namespace=session.namespaces?.eip155,account=namespace?.accounts?.find(value=>/^eip155:1:0x[a-f0-9]{40}$/i.test(value));
  if(!account||!namespace.methods?.includes('personal_sign'))throw Error('Ce wallet n’autorise pas la signature Ethereum nécessaire.');
  const address=account.split(':')[2];
  return {async request({method,params}){if(closed||changed||signal?.aborted)throw Error('Connexion wallet fermée ou compte modifié.');if(method==='eth_chainId')return '0x1';if(['eth_accounts','eth_requestAccounts'].includes(method))return [address];if(method!=='personal_sign'||params?.[1]?.toLowerCase()!==address.toLowerCase())throw Error('Méthode wallet interdite.');return wait(client.request({topic:session.topic,chainId:'eip155:1',request:{method:'personal_sign',params}}));},disconnect:close};
 }catch(error){await close();throw error;}
}
