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
import {proxyPeers,clientAddress} from './proxy.mjs';
import {createOpenApi} from './openapi.mjs';
import {Channels} from './channels.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { timingSafeEqual, createHmac, createHash,randomBytes } from 'node:crypto';
import { validMxid } from './matrix-id.mjs';
import {Coordination} from './coordination.mjs';
import {coordinationTools} from './tools.mjs';
import {WalletAuth,matrixWalletJwt} from './wallet.mjs';
import {Security} from './security.mjs';
import {Passkeys} from './passkeys.mjs';
export { validMxid } from './matrix-id.mjs';

export class HttpError extends Error { constructor(status,message){ super(message);this.status=status; } }
const text=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
function safeProxyPath(path) {
  let decoded=path;
  for(let i=0;i<8;i++) {
    if(decoded.includes('\\')||decoded.split('/').some(part=>part==='.'||part==='..'))return false;
    const next=decoded.replace(/%(2e|2f|5c|25)/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    if(next===decoded)return true;
    decoded=next;
  }
  return false;
}
export function createApp({store, upstream, serverName, origin, edition='intranet', policySecret, registrationSecret, inviteCode='', approvers=[],walletJwtSecret='',walletConnectProjectId='',trustedProxyPeers=[],staticDir='dist', fetchImpl=fetch}) {
  if(walletJwtSecret&&walletJwtSecret.length<43||walletConnectProjectId&&!/^[a-f0-9]{32}$/i.test(walletConnectProjectId))throw Error('Configuration wallet invalide.');
  const trustedProxies=proxyPeers(trustedProxyPeers);
  const wallets=new WalletAuth(store,origin),walletEnabled=Boolean(walletJwtSecret);
  const security=new Security(store,policySecret),pendingLogins=new Map();
  const passkeys=new Passkeys(store,origin,{audit:(mxid,event)=>security.audit(mxid,event)});
  if(!Array.isArray(approvers)||approvers.length>100||!approvers.every(validMxid))throw Error('Liste des opérateurs invalide.');
  const coordination=new Coordination(store,{approvers});
  const channels=new Channels(store);
  const coordinationStreams=new Map();
  let coordinationStreamCount=0;
  const base=new URL(upstream);
  if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||base.pathname!=='/') throw Error('MATRIX_UPSTREAM invalide');
  const publicUrl=new URL(origin);
  if(publicUrl.origin!==origin||publicUrl.username||publicUrl.password||
    !(publicUrl.protocol==='https:'||(publicUrl.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(publicUrl.hostname))))throw Error('PUBLIC_ORIGIN exige une origine HTTPS ou HTTP de développement sur loopback.');
  if(!policySecret || policySecret.length<32) throw Error('POLICY_SECRET doit contenir au moins 32 caractères. Exécuter npm run setup.');
  const limits=new Map();
  function rate(key,max=90,ms=60000){
    const now=Date.now(),v=limits.get(key);
    if(!v||now-v.start>ms){limits.set(key,{start:now,count:1});}
    else if(++v.count>max)throw new HttpError(429,'Trop de requêtes. Réessayez plus tard.');
    if(limits.size>10000)for(const [k,v]of limits)if(now-v.start>ms)limits.delete(k);
  }
  async function matrix(path,init={},accessCheck=false) {
    let r;
    try{r=await fetchImpl(new URL(path,base),{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}
    catch{throw new HttpError(503,'Serveur Matrix indisponible.');}
    if(!r.ok){
      if(path==='/_synapse/admin/v1/register'&&init.method==='POST'&&r.status===400){let error;try{error=await r.json();}catch{}
        if(error?.errcode==='M_USER_IN_USE')throw new HttpError(409,'Cet identifiant n’est pas disponible. Choisissez-en un autre ou connectez-vous si vous avez déjà un compte.');
      }
      throw new HttpError(r.status===401?401:r.status===429?429:accessCheck&&[403,404].includes(r.status)?403:502,r.status===401?'Session expirée.':r.status===429?'Trop de tentatives de connexion. Patientez un instant avant de réessayer.':'La requête Matrix a échoué.');
    }
    let data;try{data=await r.json();}catch{throw new HttpError(502,'Réponse Matrix invalide.');}
    if(!data||typeof data!=='object'||Array.isArray(data))throw new HttpError(502,'Réponse Matrix invalide.');
    return data;
  }
  async function authenticate(req){
    const header=req.headers.authorization;
    if(typeof header!=='string'||!header.startsWith('Bearer ')||header.length>8192)throw new HttpError(401,'Connexion requise.');
    const who=await matrix('/_matrix/client/v3/account/whoami',{headers:{Authorization:header}});
    if(!validMxid(who.user_id)||!who.user_id.endsWith(':'+serverName))throw new HttpError(403,'Compte hors de cette installation.');
    return store.ensure(who.user_id);
  }
  async function verifyAccountPassword(user,password,requireHook=false,authorization='',probe=false){
    if(!text(password,12,256))throw new HttpError(400,'Mot de passe du compte requis pour cette modification.');
    if(authorization&&!probe){
      // Standard UIA, with an empty device list: no session creation or deletion.
      // Our managed Synapse configuration fixes ui_auth.session_timeout to zero.
      try{await matrix('/_matrix/client/v3/delete_devices',{method:'POST',headers:{Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify({devices:[],auth:{type:'m.login.password',identifier:{type:'m.id.user',user:user.mxid},password}})});return;}
      catch(error){if([401,403,502].includes(error.status))throw new HttpError(403,'Confirmation refusée. Vérifiez le mot de passe du compte.');throw error;}
    }
    const device=security.grant(user.mxid);
    let session;try{session=await matrix('/_matrix/client/v3/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'m.login.password',identifier:{type:'m.id.user',user:user.mxid},password,device_id:device,initial_device_display_name:'PolyTalk security confirmation'})});}
    catch(error){if([401,403,502].includes(error.status))throw new HttpError(403,'Confirmation refusée. Vérifiez le mot de passe du compte.');throw error;}
    try{if(session.user_id!==user.mxid||typeof session.access_token!=='string')throw new HttpError(403,'Confirmation du compte refusée.');if(requireHook&&security.grants.has(device))throw new HttpError(503,'Le contrôle de connexion Synapse doit être installé avant d’activer la 2FA.');}
    finally{security.grants.delete(device);if(typeof session.access_token==='string')await matrix('/_matrix/client/v3/logout',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}'});}
  }
  async function body(req,max=65536){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>max)throw new HttpError(413,'Requête trop volumineuse.');chunks.push(chunk);}
    try{const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object')throw Error();return value;}
    catch{throw new HttpError(400,'Objet JSON attendu.');}
  }
  function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  const authCookieName=publicUrl.protocol==='https:'?'__Host-polytalk-auth':'polytalk-auth';
  function authCookie(req){const values=(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(authCookieName+'='));return values.length===1?values[0].slice(authCookieName.length+1):'';}
  function clearAuthCookie(res){res.setHeader('Set-Cookie',`${authCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${publicUrl.protocol==='https:'?'; Secure':''}`);}
  async function discardPending(id){const p=pendingLogins.get(id);if(!p)return;pendingLogins.delete(id);clearTimeout(p.timer);await matrix('/_matrix/client/v3/logout',{method:'POST',headers:{Authorization:'Bearer '+p.session.access_token,'Content-Type':'application/json'},body:'{}'}).catch(()=>{});}
  async function finishPrimary(req,res,session){
    if(!validMxid(session.user_id)||typeof session.device_id!=='string'||typeof session.access_token!=='string')throw new HttpError(502,'Session Matrix invalide.');
    if(!security.enabled(session.user_id))return send(res,200,session);
    if(pendingLogins.size>=200){await matrix('/_matrix/client/v3/logout',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:'{}'}).catch(()=>{});throw new HttpError(429,'Trop de connexions en cours.');}
    const id=randomBytes(32).toString('hex'),cookie=randomBytes(32).toString('hex');
    const timer=setTimeout(()=>discardPending(id),120000);timer.unref();pendingLogins.set(id,{session,cookie,attempts:0,timer,expires:Date.now()+120000});
    res.setHeader('Set-Cookie',`${authCookieName}=${cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=120${publicUrl.protocol==='https:'?'; Secure':''}`);
    return send(res,200,{mfaRequired:true,id,expiresIn:120});
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(self), microphone=(), geolocation=()');
    const walletConnections=walletConnectProjectId&&walletEnabled?' wss://relay.walletconnect.org https://verify.walletconnect.org https://verify.walletconnect.com':'';
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'"+walletConnections+"; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url=new URL(req.url,origin),path=url.pathname;
      if(req.headers.origin && req.headers.origin!==origin)throw new HttpError(403,'Origine non autorisée.');
      if(['POST','PUT','DELETE'].includes(req.method)&&!path.startsWith('/_matrix/')&&req.headers['content-type']?.split(';')[0]!=='application/json')throw new HttpError(415,'Content-Type application/json requis.');
      const peer=clientAddress(req,trustedProxies);
      const bearer=req.headers.authorization;
      if(path.startsWith('/_matrix/')&&typeof bearer==='string'&&bearer.length<=8192&&/^Bearer [^\s]+$/.test(bearer)){
        // Separate SDK traffic from application policy/receipts. Tokens are never retained in rate keys.
        rate('matrix-edge:'+peer,360);
        rate('matrix-session:'+peer+':'+createHash('sha256').update(bearer).digest('hex'));
      }else if(path.startsWith('/_matrix/'))rate('matrix-anonymous:'+peer);
      else if(path==='/internal/auth/check'&&equal(req.headers['x-polytalk-policy-secret'],policySecret))rate('auth-hook:'+peer);
      else if(path==='/internal/evaluate'&&equal(req.headers['x-polytalk-policy-secret'],policySecret))rate('policy-hook:'+peer);
      else rate('application:'+peer);
      if(path==='/api/openapi.json'&&req.method==='GET')return send(res,200,createOpenApi());
      if(path==='/api/config'&&req.method==='GET')return send(res,200,{edition,serverName,origin,signupRequiresCode:Boolean(inviteCode),matrixBase:origin,walletEnabled,passkeysEnabled:walletEnabled,walletConnectProjectId:walletEnabled?walletConnectProjectId:''});
      if(path.startsWith('/api/passkeys/')){
        if(!walletEnabled)throw new HttpError(503,'La connexion par clé d’accès doit être configurée sur ce serveur.');
        rate('passkeys-edge:'+peer,10);
        if(path==='/api/passkeys/options'&&req.method==='POST'){
          const binding=randomBytes(32).toString('hex');res.setHeader('Set-Cookie',`${authCookieName}=${binding}; Path=/; HttpOnly; SameSite=Strict; Max-Age=120${publicUrl.protocol==='https:'?'; Secure':''}`);
          return send(res,200,await passkeys.authentication(binding));
        }
        if(path==='/api/passkeys/login'&&req.method==='POST'){
          rate('login:'+peer,5);const b=await body(req),user=await passkeys.authenticate(b.id,authCookie(req),b.credential);
          rate('login-account:'+createHash('sha256').update(user.mxid).digest('hex'),5);
          const token=matrixWalletJwt(user.mxid,serverName,origin,walletJwtSecret),device=security.grant(user.mxid);
          const session=await matrix('/_matrix/client/v3/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'org.matrix.login.jwt',token,device_id:device,initial_device_display_name:'PolyTalk passkey'})});
          if(session.user_id!==user.mxid)throw new HttpError(403,'Connexion refusée.');return finishPrimary(req,res,session);
        }
        const user=await authenticate(req);rate('passkeys-account:'+user.id,10);
        if(path==='/api/passkeys/list'&&req.method==='GET')return send(res,200,{passkeys:passkeys.list(user)});
        const b=await body(req);
        if(path==='/api/passkeys/register/verify'&&req.method==='POST')return send(res,200,{passkeys:await passkeys.register(b.id,req.headers.authorization,b.credential)});
        rate('security-stepup:'+user.id,5);await verifyAccountPassword(user,b.password,true,req.headers.authorization);if(security.enabled(user.mxid))security.verify(user.mxid,b.code);
        if(path==='/api/passkeys/register/options'&&req.method==='POST')return send(res,200,await passkeys.registration(user,req.headers.authorization,b.name));
        if(path==='/api/passkeys/remove'&&req.method==='POST')return send(res,200,{passkeys:passkeys.remove(user,b.id)});
        throw new HttpError(404,'Action de clé d’accès introuvable.');
      }
      if(path==='/internal/auth/check'&&req.method==='POST'){
        if(!equal(req.headers['x-polytalk-policy-secret'],policySecret))throw new HttpError(403,'Accès interdit.');
        const b=await body(req);if(!validMxid(b.user_id)||b.device_id!==null&&typeof b.device_id!=='string')throw new HttpError(400,'Identité invalide.');
        return send(res,200,{allowed:security.allowLogin(b.user_id,b.device_id)});
      }
      if(path==='/api/auth/password'&&req.method==='POST'){
        rate('login:'+peer,5);const b=await body(req);if(!text(b.username,1,255)||!text(b.password,12,256))throw new HttpError(400,'Identifiant et mot de passe requis.');
        const mxid=b.username.startsWith('@')?b.username:`@${b.username}:${serverName}`;
        if(!validMxid(mxid)||!mxid.endsWith(':'+serverName))throw new HttpError(401,'Connexion refusée.');
        rate('login-account:'+createHash('sha256').update(mxid).digest('hex'),5);
        const device=security.grant(mxid);
        let session;try{session=await matrix('/_matrix/client/v3/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'m.login.password',identifier:{type:'m.id.user',user:mxid},password:b.password,device_id:device,initial_device_display_name:'PolyTalk Web'})});}
        catch(error){security.grants.delete(device);if([401,403,502].includes(error.status))throw new HttpError(401,'Identifiant ou mot de passe incorrect. Vérifiez aussi votre installation PolyTalk.');throw error;}
        if(session.user_id!==mxid)throw new HttpError(401,'Connexion refusée.');return finishPrimary(req,res,session);
      }
      if(path==='/api/auth/verify'&&req.method==='POST'){
        rate('auth-verify:'+peer,5);const b=await body(req),p=typeof b.id==='string'?pendingLogins.get(b.id):null;
        if(!p||!equal(authCookie(req),p.cookie)||p.expires<=Date.now())throw new HttpError(403,'Connexion expirée. Recommencez.');
        rate('auth-verify-account:'+createHash('sha256').update(p.session.user_id).digest('hex'),5);
        try{if(++p.attempts>5)throw new HttpError(403,'Trop de tentatives.');security.verify(p.session.user_id,b.code);}
        catch(error){if(p.attempts>=5)await discardPending(b.id);throw error;}
        pendingLogins.delete(b.id);clearTimeout(p.timer);clearAuthCookie(res);return send(res,200,p.session);
      }
      if(path==='/api/auth/cancel'&&req.method==='POST'){
        const b=await body(req),p=pendingLogins.get(b.id);if(p&&equal(authCookie(req),p.cookie))await discardPending(b.id);clearAuthCookie(res);return send(res,200,{cancelled:true});
      }
      if(path.startsWith('/api/security/')){
        const user=await authenticate(req);rate('security-account:'+user.id,10);
        async function devices(){
          const headers={Authorization:req.headers.authorization},[inventory,who]=await Promise.all([matrix('/_matrix/client/v3/devices',{headers}),matrix('/_matrix/client/v3/account/whoami',{headers})]);
          if(who.user_id!==user.mxid||typeof who.device_id!=='string'||!Array.isArray(inventory.devices)||inventory.devices.length>1000)throw new HttpError(502,'Liste des appareils indisponible.');
          const rows=inventory.devices.map(device=>{if(!text(device.device_id,1,255))throw new HttpError(502,'Appareil Matrix invalide.');return {deviceId:device.device_id,name:typeof device.display_name==='string'?device.display_name.slice(0,200):'Appareil sans nom',lastSeen:Number.isSafeInteger(device.last_seen_ts)&&device.last_seen_ts>=0?device.last_seen_ts:null};});
          return {currentDeviceId:who.device_id,devices:rows,totpEnabled:security.enabled(user.mxid)};
        }
        if(path==='/api/security/devices'&&req.method==='GET')return send(res,200,await devices());
        if(path==='/api/security/status'&&req.method==='GET')return send(res,200,security.status(user.mxid));
        if(path==='/api/security/audit'&&req.method==='GET')return send(res,200,{events:security.history(user.mxid)});
        const b=await body(req);rate('security-stepup:'+user.id,5);await verifyAccountPassword(user,b.password,true,req.headers.authorization,path==='/api/security/totp/begin');
        if(path==='/api/security/devices/revoke'&&req.method==='POST'){
          if(!text(b.deviceId,1,255))throw new HttpError(400,'Choisissez un appareil.');const inventory=await devices();
          if(b.deviceId===inventory.currentDeviceId)throw new HttpError(400,'Cet appareil est votre session actuelle. Utilisez le verrouillage local pour la protéger.');
          if(!inventory.devices.some(device=>device.deviceId===b.deviceId))throw new HttpError(404,'Appareil introuvable sur votre compte.');
          if(security.enabled(user.mxid))security.verify(user.mxid,b.code);
          await matrix('/_matrix/client/v3/delete_devices',{method:'POST',headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'},body:JSON.stringify({devices:[b.deviceId],auth:{type:'m.login.password',identifier:{type:'m.id.user',user:user.mxid},password:b.password}})});
          security.audit(user.mxid,'session.revoked');return send(res,200,{revoked:true,deviceId:b.deviceId});
        }
        if(path==='/api/security/totp/begin'&&req.method==='POST'){const {secret,uri}=security.begin(user.mxid,req.headers.authorization);return send(res,200,{secret,uri});}
        if(path==='/api/security/totp/confirm'&&req.method==='POST')return send(res,200,{backupCodes:security.confirm(user.mxid,req.headers.authorization,b.code)});
        if(path==='/api/security/totp/disable'&&req.method==='POST'){security.disable(user.mxid,b.code);return send(res,200,security.status(user.mxid));}
        if(path==='/api/security/backup-codes'&&req.method==='POST')return send(res,200,{backupCodes:security.rotateCodes(user.mxid,b.code)});
        throw new HttpError(404,'Action de sécurité introuvable.');
      }
      if(path.startsWith('/api/wallet/')){
        if(!walletEnabled)throw new HttpError(503,'La connexion wallet n’est pas activée sur cette installation.');
        if(req.method!=='GET'&&req.headers.origin!==origin)throw new HttpError(403,'Origine de la connexion wallet requise.');
        rate('wallet-edge:'+peer,30);
        if(req.method==='POST')rate((path.endsWith('/challenge')?'wallet-challenge:':'wallet-auth:')+peer,path.endsWith('/challenge')?10:5);
        const cookieName=publicUrl.protocol==='https:'?'__Host-polytalk-wallet':'polytalk-wallet';
        const cookieValues=(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));
        const cookie=cookieValues.length===1?cookieValues[0].slice(cookieName.length+1):'';
        const setCookie=(value,maxAge)=>res.setHeader('Set-Cookie',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${publicUrl.protocol==='https:'?'; Secure':''}`);
        if(path==='/api/wallet/challenge'&&req.method==='POST'){
          const b=await body(req);if(Object.keys(b).some(k=>!['address','chainId','purpose'].includes(k)))throw new HttpError(400,'Demande invalide.');
          const user=b.purpose==='link'?await authenticate(req):null,browser=/^[a-f0-9]{64}$/.test(cookie)?cookie:randomBytes(32).toString('hex');
          const challenge=wallets.challenge(b,browser,user);setCookie(browser,300);return send(res,200,challenge);
        }
        if(path==='/api/wallet/login'&&req.method==='POST'){
          const b=await body(req);if(Object.keys(b).some(k=>!['id','signature'].includes(k)))throw new HttpError(400,'Preuve invalide.');
          const proof=wallets.consume(b,cookie,'login'),user=wallets.owner(proof.address);setCookie('',0);
          if(!user)throw new HttpError(403,'Associez d’abord ce wallet depuis les réglages de votre compte PolyTalk.');
          const token=matrixWalletJwt(user.mxid,serverName,origin,walletJwtSecret);
          const device=security.grant(user.mxid);
          const session=await matrix('/_matrix/client/v3/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'org.matrix.login.jwt',token,device_id:device,initial_device_display_name:'PolyTalk wallet'})});
          if(session.user_id!==user.mxid||typeof session.device_id!=='string'||typeof session.access_token!=='string')throw new HttpError(502,'Session wallet Matrix invalide.');
          return finishPrimary(req,res,{user_id:session.user_id,device_id:session.device_id,access_token:session.access_token});
        }
        const user=await authenticate(req);
        if(path==='/api/wallet/list'&&req.method==='GET')return send(res,200,{wallets:wallets.list(user)});
        if(path==='/api/wallet/link'&&req.method==='POST'){
          const b=await body(req);if(Object.keys(b).some(k=>!['id','signature','password'].includes(k)))throw new HttpError(400,'Association invalide.');
          await verifyAccountPassword(user,b.password,false,req.headers.authorization);const proof=wallets.consume(b,cookie,'link',user);setCookie('',0);return send(res,200,{wallets:wallets.link(user,proof)});
        }
        if(path==='/api/wallet/unlink'&&req.method==='POST'){
          const b=await body(req);if(Object.keys(b).some(k=>!['address','password'].includes(k)))throw new HttpError(400,'Suppression invalide.');
          await verifyAccountPassword(user,b.password,false,req.headers.authorization);wallets.unlink(user,b.address);return send(res,200,{wallets:wallets.list(user)});
        }
        throw new HttpError(404,'Route wallet introuvable.');
      }
      if(path==='/api/health'&&req.method==='GET'){
        let available=false;try{await matrix('/_matrix/client/versions');available=true;}catch{}
        return send(res,200,{status:available?'ready':'matrix_unavailable',edition,matrix:available});
      }
      if(path==='/internal/evaluate'&&req.method==='POST'){
        if(!equal(req.headers['x-polytalk-policy-secret'],policySecret))throw new HttpError(403,'Accès interdit.');
        const b=await body(req);
        if(!validMxid(b.sender)||!Array.isArray(b.recipients)||b.recipients.length>1000||!b.recipients.every(validMxid))throw new HttpError(400,'Identités invalides.');
        return send(res,200,{allowed:b.recipients.every(recipient=>store.allowed(recipient,b.sender))});
      }
      if(path==='/api/register'&&req.method==='POST'){
        rate('signup:'+peer,5);
        const b=await body(req);
        if(inviteCode&&!equal(b.code,inviteCode))throw new HttpError(403,'Code d’invitation incorrect ou manquant. Vérifiez le code reçu ou demandez-le à votre administrateur.');
        if(typeof b.username!=='string'||!/^[a-z][a-z0-9_-]{2,31}$/.test(b.username)||['admin','root','support','system','polytalk'].includes(b.username))throw new HttpError(400,'Adresse : 3 à 32 lettres, chiffres, tirets ou underscores ; commencez par une lettre.');
        if(!text(b.password,12,256)||b.name!==undefined&&(typeof b.name!=='string'||b.name.length>80)||!['human','agent'].includes(b.kind))throw new HttpError(400,'Nom, type ou mot de passe invalide (12 caractères minimum).');
        const displayName=b.name?.trim()||b.username;
        const {nonce}=await matrix('/_synapse/admin/v1/register');
        if(typeof nonce!=='string'||!registrationSecret)throw new HttpError(503,'Inscription non configurée.');
        const mac=createHmac('sha1',registrationSecret).update([nonce,b.username,b.password,'notadmin'].join('\0')).digest('hex');
        // HMAC-SHA1 is required here by Synapse's shared-secret registration API, not used for passwords.
        const result=await matrix('/_synapse/admin/v1/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce,username:b.username,password:b.password,admin:false,mac,inhibit_login:true,displayname:displayName})});
        const mxid=result.user_id;
        if(!validMxid(mxid)||mxid!==`@${b.username}:${serverName}`)throw new HttpError(502,'Réponse d’inscription Matrix invalide.');
        store.ensure(mxid,displayName,b.kind);
        return send(res,201,{user_id:mxid});
      }
      if(path.startsWith('/api/')){
        const user=await authenticate(req);
        if(path.startsWith('/api/coordination/')){
          coordination.expire();
          const headers={Authorization:req.headers.authorization};
          async function access(task){
            const owner=store.byId(task.owner_id),assignee=store.byId(task.assignee_id),controller=store.byId(task.controller_id||task.owner_id);
            const people=[owner,assignee,controller];
            if(people.some(a=>people.some(b=>!store.allowed(a.mxid,b.mxid))))throw new HttpError(403,'Règles de réception incompatibles.');
            const joined=await matrix(`/_matrix/client/v3/rooms/${encodeURIComponent(task.room_id)}/joined_members`,{headers},true);
            if(!joined.joined||!Object.hasOwn(joined.joined,user.mxid)||people.some(p=>!Object.hasOwn(joined.joined,p.mxid)))throw new HttpError(403,'Participants absents du canal.');
          }
          async function encryptedReference(room,eventId){
            const event=await matrix(`/_matrix/client/v3/rooms/${encodeURIComponent(room)}/event/${encodeURIComponent(eventId)}`,{headers},true);
            if(event.event_id!==eventId||event.room_id!==room||event.sender!==user.mxid||event.type!=='m.room.encrypted')throw new HttpError(400,'Événement chiffré signé par le demandeur requis.');
          }
          const channelPath=path.match(/^\/api\/coordination\/channels\/([^/]+)(\/resolve)?$/);
          if(channelPath){
            const room=decodeURIComponent(channelPath[1]);
            if(!room.startsWith('!')||Buffer.byteLength(room)>255||/[\s\p{Cc}\p{Cf}\p{Cs}]/u.test(room))throw new HttpError(400,'Canal invalide.');
            const members=await matrix(`/_matrix/client/v3/rooms/${encodeURIComponent(room)}/joined_members`,{headers},true);
            if(!members.joined||!Object.hasOwn(members.joined,user.mxid))throw new HttpError(403,'Membre du canal requis.');
            const ids=Object.keys(members.joined);if(ids.length>1000)throw new HttpError(409,'Canal trop volumineux pour la coordination.');
            const levels=await matrix(`/_matrix/client/v3/rooms/${encodeURIComponent(room)}/state/m.room.power_levels/`,{headers},true);
            const level=levels.users?.[user.mxid]??levels.users_default??0;
            const threshold=Math.max(50,levels.state_default??50,levels.events?.['m.room.power_levels']??100);
            const canConfigure=Number.isFinite(level)&&Number.isFinite(threshold)&&level>=threshold;
            if(req.method==='GET'&&!channelPath[2])return send(res,200,{...channels.get(room),canConfigure});
            const roster=[];for(const mxid of ids){const profile=store.profile(mxid);if(!profile||profile.kind!=='agent')continue;const row=store.db.prepare('SELECT * FROM coordination_agents WHERE id=?').get(profile.id);if(row)roster.push(coordination.agent(row));}
            if(req.method==='PUT'&&!channelPath[2]){if(!canConfigure)throw new HttpError(403,'Administration du canal requise.');return send(res,200,channels.configure(room,await body(req),roster,user.id));}
            if(req.method==='POST'&&channelPath[2])return send(res,200,channels.resolve(user,room,roster,await body(req)));
            throw new HttpError(405,'Méthode non autorisée.');
          }
          if(path==='/api/coordination/permissions'&&req.method==='GET')return send(res,200,{operator:approvers.includes(user.mxid),defaultDelegation:'never',maxDepth:3,maxTasks:32});
          if(path==='/api/coordination/tools'&&req.method==='GET')return send(res,200,{schema:'polytalk.tools.v1',tools:coordinationTools});
          const delegationPath=path.match(/^\/api\/coordination\/tasks\/([0-9a-f-]{36})\/delegation$/);
          if(delegationPath&&req.method==='GET'){const task=coordination.get(user,delegationPath[1]);await access(task);return send(res,200,coordination.delegationPolicy(user,task.id));}
          if(delegationPath&&req.method==='PUT'){const task=coordination.get(user,delegationPath[1]),b=await body(req);if(!(b.decision==='never'&&task.controller_id===user.id))await access(task);return send(res,200,coordination.setDelegation(user,task.id,b));}
          if(path==='/api/coordination/approvals'&&req.method==='POST'){
            const b=await body(req);coordination.validateTask(b);if(!b.parentId)throw new HttpError(400,'Parent requis.');
            const parent=coordination.get(user,b.parentId),target=coordination.lookup(user,b.assigneeId);if(!target)throw new HttpError(400,'Agent enregistré requis.');
            await access(parent);await access({owner_id:user.id,assignee_id:target.id,controller_id:parent.controller_id,room_id:b.roomId});await encryptedReference(b.roomId,b.instructionEventId);
            return send(res,201,coordination.requestDelegation(user,b));
          }
          if(path==='/api/coordination/approvals'&&req.method==='GET'){
            const approvals=[];for(const approval of coordination.approvals(user)){try{await access(coordination.get(user,approval.parent_id));approvals.push({...approval,room_id:coordination.get(user,approval.parent_id).room_id});}catch(e){if(e.status!==403)throw e;}}return send(res,200,{approvals});
          }
          const approvalPath=path.match(/^\/api\/coordination\/approvals\/([0-9a-f-]{36})$/);
          if(approvalPath&&req.method==='PUT'){
            const approval=coordination.approval(user,approvalPath[1]);
            const b=await body(req);if(Object.keys(b).length!==1)throw new HttpError(400,'Décision invalide.');if(b.state!=='rejected')await access(coordination.get(user,approval.parent_id));const next=coordination.decideApproval(user,approval.id,b.state);return send(res,200,b.state==='rejected'?{id:next.id,state:next.state}:next);
          }
          if(path==='/api/coordination/agents/me/heartbeat'&&req.method==='POST'){const b=await body(req);if(Object.keys(b).length)throw new HttpError(400,'Présence sans paramètres requise.');return send(res,200,coordination.heartbeat(user));}
          if(path==='/api/coordination/agents/me'&&req.method==='PUT')return send(res,200,coordination.register(user,await body(req)));
          if(path==='/api/coordination/agents'&&req.method==='GET'){
            const room=url.searchParams.get('roomId');if(!room)return send(res,200,{agents:coordination.agents(user)});
            if(!/^![^\s\p{Cc}\p{Cf}\p{Cs}]+$/u.test(room)||Buffer.byteLength(room)>255)throw new HttpError(400,'Canal invalide.');
            const members=await matrix(`/_matrix/client/v3/rooms/${encodeURIComponent(room)}/joined_members`,{headers},true);
            if(!members.joined||!Object.hasOwn(members.joined,user.mxid))throw new HttpError(403,'Membre du canal requis.');
            const agents=[];for(const mxid of Object.keys(members.joined).slice(0,1000)){
              const profile=store.profile(mxid);if(!profile)continue;
              try{const agent=coordination.lookup(user,profile.id);if(agent)agents.push(agent);}catch(e){if(e.status!==403)throw e;}
            }return send(res,200,{agents});
          }
          const agentPath=path.match(/^\/api\/coordination\/agents\/([0-9a-f-]{36})$/);
          if(agentPath&&req.method==='GET'){const agent=coordination.lookup(user,agentPath[1]);if(!agent)throw new HttpError(404,'Agent introuvable.');return send(res,200,agent);}
          if(path==='/api/coordination/tasks'&&req.method==='POST'){
            const b=await body(req);coordination.validateTask(b);const target=coordination.lookup(user,b.assigneeId);
            if(!target||typeof b.roomId!=='string'||typeof b.instructionEventId!=='string'||b.roomId.length>255||b.instructionEventId.length>255)throw new HttpError(400,'Contrat invalide.');
            const parent=b.parentId?coordination.get(user,b.parentId):null;
            if(parent)await access(parent);
            await access({owner_id:user.id,assignee_id:target.id,controller_id:parent?.controller_id,room_id:b.roomId});await encryptedReference(b.roomId,b.instructionEventId);
            return send(res,201,coordination.create(user,b));
          }
          if(path==='/api/coordination/revocable-tasks'&&req.method==='GET')return send(res,200,coordination.revocable(user,url.searchParams.get('after')||''));
          if(path==='/api/coordination/tasks'&&req.method==='GET'){
            const page=coordination.page(user,url.searchParams.get('after')||''),tasks=[];for(const task of page.tasks){try{await access(task);tasks.push(task);}catch(e){if(e.status!==403)throw e;}}return send(res,200,{tasks,next:page.next});
          }
          const taskPath=path.match(/^\/api\/coordination\/tasks\/([0-9a-f-]{36})$/);
          if(taskPath&&req.method==='PUT'){
            const task=coordination.get(user,taskPath[1]),b=await body(req);if(b.state==='cancelled'&&(task.owner_id===user.id||task.controller_id===user.id)){const next=coordination.transition(user,task.id,b);return send(res,200,{id:next.id,state:next.state,version:next.version});}await access(task);
            if(b.resultEventId!==undefined){if(typeof b.resultEventId!=='string'||b.resultEventId.length>255||!/^\$[^\s\p{Cc}\p{Cf}\p{Cs}]+$/u.test(b.resultEventId)||Buffer.byteLength(b.resultEventId)>255)throw new HttpError(400,'Référence invalide.');await encryptedReference(task.room_id,b.resultEventId);}
            return send(res,200,coordination.transition(user,task.id,b));
          }
          if(path==='/api/coordination/events'&&req.method==='GET'){
            if(url.searchParams.get('stream')==='1'){
              let cursor=Number(url.searchParams.get('after')||0);coordination.events(user,cursor);
              if((coordinationStreams.get(user.id)||0)>=2||coordinationStreamCount>=50)throw new HttpError(429,'Limite de flux de coordination atteinte.');
              coordinationStreams.set(user.id,(coordinationStreams.get(user.id)||0)+1);
              coordinationStreamCount++;
              let closed=false;res.on('close',()=>{closed=true;});
              res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
              const deadline=Date.now()+25000;let verifiedAt=Date.now();
              try{
                while(!closed&&Date.now()<deadline){
                  if(Date.now()-verifiedAt>=5000){await authenticate(req);verifiedAt=Date.now();}
                  coordination.expire();const batch=coordination.events(user,cursor);
                  for(const event of batch){
                    if(closed)break;
                    try{await access(coordination.get(user,event.task_id));res.write(`id: ${event.sequence}\nevent: coordination\ndata: ${JSON.stringify(event)}\n\n`);}catch(e){if(e.status!==403)throw e;}
                    cursor=event.sequence;
                  }
                  if(closed)break;
                  if(res.writableLength>65536)break;
                  res.write(`event: cursor\ndata: ${JSON.stringify({next:cursor})}\n\n`);
                  await new Promise(done=>{const timer=setTimeout(finish,1000);function finish(){clearTimeout(timer);res.off('close',finish);done();}res.once('close',finish);});
                }
              }finally{coordinationStreamCount--;const count=(coordinationStreams.get(user.id)||1)-1;if(count)coordinationStreams.set(user.id,count);else coordinationStreams.delete(user.id);res.end();}
              return;
            }
            const after=Number(url.searchParams.get('after')||0),batch=coordination.events(user,after),events=[];
            for(const event of batch){try{await access(coordination.get(user,event.task_id));events.push(event);}catch(e){if(e.status!==403)throw e;}}
            return send(res,200,{events,next:batch.at(-1)?.sequence??after});
          }
          throw new HttpError(404,'Route de coordination introuvable.');
        }
        if(path==='/api/me'&&req.method==='GET')return send(res,200,{profile:user,policy:store.policy(user.mxid)});
        if(path==='/api/me'&&req.method==='PUT'){
          const b=await body(req);if(!text(b.name,1,80)||!['human','agent'].includes(b.kind))throw new HttpError(400,'Profil invalide.');
          return send(res,200,store.update(user.mxid,b.name.trim(),b.kind));
        }
        if(path==='/api/address-book'){
          if(req.method==='GET')return send(res,200,{contacts:store.contacts(user.mxid)});
          if(req.method==='POST'){
            const b=await body(req);if(Object.keys(b).some(key=>!['mxid','name','action'].includes(key))||!validMxid(b.mxid)||b.mxid===user.mxid||!['save','remove'].includes(b.action))throw new HttpError(400,'Contact invalide.');
            if(b.action==='remove'){store.removeContact(user.mxid,b.mxid);return send(res,200,{removed:true});}
            if(!text(b.name,1,80)||/[\p{Cc}\p{Cf}]/u.test(b.name))throw new HttpError(400,'Nom du contact invalide.');
            if(store.contacts(user.mxid).length>=1000&&!store.contacts(user.mxid).some(contact=>contact.mxid===b.mxid))throw new HttpError(409,'Limite de 1000 contacts atteinte.');
            return send(res,200,store.saveContact(user.mxid,b.mxid,b.name));
          }
          throw new HttpError(405,'Méthode non autorisée.');
        }
        if(path==='/api/contacts'&&req.method==='GET'){
          const q=url.searchParams.get('q')||'';if(q.length>255)throw new HttpError(400,'Adresse trop longue.');
          return send(res,200,{contacts:store.search(q,user.mxid)});
        }
        const match=path.match(/^\/api\/contacts\/([0-9a-f-]{36})$/);
        if(match&&req.method==='GET'){
          const p=store.byId(match[1]);if(!p)throw new HttpError(404,'Contact introuvable.');
          return send(res,200,{schema:'polytalk.contact.v1',id:p.id,mxid:p.mxid,name:p.name,kind:p.kind,origin,issuedBy:serverName,verification:'matrix-account',url:`${origin}/contact/${p.id}`});
        }
        if(path==='/api/policy'&&req.method==='GET')return send(res,200,store.policy(user.mxid));
        if(path==='/api/policy'&&req.method==='PUT'){
          const b=await body(req);if(!['open','allowlist'].includes(b.mode))throw new HttpError(400,'Mode invalide.');
          return send(res,200,store.setMode(user.mxid,b.mode));
        }
        if(path==='/api/policy/rules'&&req.method==='POST'){
          const b=await body(req);
          if(!validMxid(b.target)||b.target===user.mxid||!['allow','block','remove'].includes(b.action))throw new HttpError(400,'Règle invalide.');
          return send(res,200,store.setRule(user.mxid,b.target,b.action));
        }
        if(path==='/api/can-contact'&&req.method==='POST'){
          const b=await body(req);if(!validMxid(b.target))throw new HttpError(400,'Adresse invalide.');
          return send(res,200,{allowed:store.allowed(b.target,user.mxid)});
        }
        if(path==='/api/receipts'&&req.method==='POST'){
          const b=await body(req);
          if(!text(b.eventId,1,255)||!/^\$[^\s\p{Cc}\p{Cf}\p{Cs}]+$/u.test(b.eventId)||
            !text(b.roomId,1,255)||Buffer.byteLength(b.roomId,'utf8')>255||!/^![^\s\p{Cc}\p{Cf}\p{Cs}]+$/u.test(b.roomId)||
            !['received','notified','processed'].includes(b.state))throw new HttpError(400,'Accusé invalide.');
          const event=await matrix(`/_matrix/client/v3/rooms/${encodeURIComponent(b.roomId)}/event/${encodeURIComponent(b.eventId)}`,
            {headers:{Authorization:req.headers.authorization}},true);
          if(event.event_id!==b.eventId||event.room_id!==b.roomId)throw new HttpError(502,'Réponse d’événement Matrix invalide.');
          return send(res,200,store.receipt(user.mxid,b.eventId,b.state));
        }
        throw new HttpError(404,'Ressource introuvable.');
      }
      // Fixed Matrix upstream. The server never accepts arbitrary proxy destinations or redirects.
      if(path.startsWith('/_matrix/')){
        // Check decoded separators/dot segments without rewriting valid encoded IDs.
        if(!safeProxyPath(path))throw new HttpError(404,'Route Matrix indisponible.');
        if(!/^\/_matrix\/(client\/|media\/)/.test(path))throw new HttpError(404,'Route Matrix indisponible.');
        if(path.endsWith('/login'))rate('login:'+peer,5);
        const headers={'Content-Type':req.headers['content-type']||'application/json'};
        if(req.headers.authorization)headers.Authorization=req.headers.authorization;
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw new HttpError(413,'Fichier trop volumineux.');chunks.push(chunk);}
        let r;
        try{r=await fetchImpl(new URL(path+url.search,base),{method:req.method,headers,
          body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks),redirect:'error',signal:AbortSignal.timeout(45000)});}
        catch{throw new HttpError(503,'Serveur Matrix indisponible.');}
        if(r.status>=300&&r.status<400)throw new HttpError(503,'Redirection Matrix interdite.');
        res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')||'application/json','Cache-Control':'no-store'});
        if(r.body)for await(const chunk of r.body){if(res.destroyed)break;res.write(chunk);}
        return res.end();
      }
      if(req.method!=='GET'&&req.method!=='HEAD')throw new HttpError(405,'Méthode non autorisée.');
      const name=['/','/index.html'].includes(path)||path.startsWith('/contact/')?'index.html':path.slice(1);
      if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.includes('..'))throw new HttpError(404,'Fichier introuvable.');
      const file=resolve(staticDir,name);let data;try{data=await readFile(file);}catch{throw new HttpError(404,'Fichier introuvable.');}
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
      res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':['index.html','manifest.webmanifest'].includes(name)?'no-store':'public, max-age=3600'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Une erreur interne est survenue.'});else res.end();}
  });
  let authenticationCleanup;
  server.cleanupAuthentication=()=>authenticationCleanup??=Promise.all([...pendingLogins.keys()].map(discardPending));
  server.on('close',()=>server.cleanupAuthentication());
  return server;
}
