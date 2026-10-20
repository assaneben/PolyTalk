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
export function discoverWallets(host){
 const providers=new Map();
 host.addEventListener('eip6963:announceProvider',event=>{const value=event.detail;if(value?.provider&&typeof value.provider.request==='function'&&typeof value.info?.uuid==='string')providers.set(value.info.uuid.slice(0,128),{name:String(value.info.name||'Wallet').slice(0,80),provider:value.provider});});
 host.dispatchEvent(new Event('eip6963:requestProvider'));
 return ()=>{if(providers.size)return [...providers.values()];const legacy=host.ethereum?.providers||[host.ethereum];return legacy.filter(p=>typeof p?.request==='function').map((provider,index)=>({name:legacy.length>1?'Wallet du navigateur '+(index+1):'Wallet du navigateur (MetaMask / compatible)',provider}));};
}
export async function signWalletChallenge(provider,api,purpose,check=()=>{},timeoutMs=120000){
 const rpc=request=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Le wallet ne répond pas. Déverrouillez-le puis recommencez.')),timeoutMs);Promise.resolve().then(()=>provider.request(request)).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
 let changed=false;const onChange=()=>{changed=true;};provider.on?.('accountsChanged',onChange);provider.on?.('chainChanged',onChange);
 try{
  check();const accounts=await rpc({method:'eth_requestAccounts'});check();const address=accounts?.[0];if(typeof address!=='string'||!/^0x[a-f0-9]{40}$/i.test(address))throw Error('Sélectionnez une adresse Ethereum compatible.');
  const rawChain=await rpc({method:'eth_chainId'});check();const chainId=Number(rawChain);if(!Number.isSafeInteger(chainId)||chainId<1)throw Error('Réseau wallet non pris en charge.');
  const challenge=await api('/wallet/challenge','POST',{address,chainId,purpose});check();
  const hex='0x'+[...new TextEncoder().encode(challenge.message)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  const signature=await rpc({method:'personal_sign',params:[hex,address]});check();
  const current=await rpc({method:'eth_accounts'}),currentChain=await rpc({method:'eth_chainId'});check();
  if(changed||current?.[0]?.toLowerCase()!==address.toLowerCase()||Number(currentChain)!==chainId)throw Error('Le compte ou le réseau a changé. Recommencez la connexion.');
  return {id:challenge.id,signature};
 }catch(error){if(error?.code===4001)throw Error('Signature annulée. Aucun compte ni fonds n’a été modifié.');throw error;}
 finally{provider.removeListener?.('accountsChanged',onChange);provider.removeListener?.('chainChanged',onChange);}
}
