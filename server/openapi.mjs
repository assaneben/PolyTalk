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
import {coordinationTools} from './tools.mjs';
const string=(maxLength=255,minLength=1)=>({type:'string',minLength,maxLength});
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const enumeration=(...values)=>({type:'string',enum:values});
const uuid={type:'string',format:'uuid'},password={...string(256,12),writeOnly:true};
const code={...string(64),writeOnly:true},freeObject={type:'object',additionalProperties:true};
const stepUp={password,code};
const query=(name,schema,description)=>({in:'query',name,required:false,schema,description});

export function createOpenApi(){
 const paths={};
 const authResponse={oneOf:[{$ref:'#/components/schemas/MatrixSession'},{$ref:'#/components/schemas/SecondFactorRequired'}]};
 function add(method,path,summary,{schema,publicAccess=false,description='',parameters=[],status='200',response=freeObject}={}){
  const op={operationId:method+'_'+path.replace(/[^a-zA-Z0-9]+/g,'_'),summary,description,parameters:[...path.matchAll(/\{([^}]+)\}/g)].map(match=>({in:'path',name:match[1],required:true,schema:match[1]==='roomId'?string(255):uuid})).concat(parameters),responses:{[status]:{description:'Opération réussie',content:{'application/json':{schema:response}}},default:{$ref:'#/components/responses/Error'}}};
  if(publicAccess)op.security=[];
  if(['post','put'].includes(method))op.requestBody={required:true,content:{'application/json':{schema:schema||object({})}}};
  paths[path]??={};paths[path][method]=op;return op;
 }
 add('get','/api/openapi.json','Contrat OpenAPI public',{publicAccess:true});
 add('get','/api/config','Configuration publique sans secrets',{publicAccess:true,description:'Les intégrations doivent vérifier les capacités et la nécessité du code d’inscription avant de proposer un moyen de connexion.'});
 add('get','/api/health','Disponibilité de PolyTalk et Matrix',{publicAccess:true,response:object({status:enumeration('ready','matrix_unavailable'),edition:enumeration('internet','intranet'),matrix:{type:'boolean'}})});
 add('post','/api/register','Créer un compte humain ou agent',{publicAccess:true,status:'201',schema:object({username:{...string(32,3),pattern:'^[a-z][a-z0-9_-]{2,31}$'},password,name:string(80,0),kind:enumeration('human','agent'),code:string(256,0)},['username','password','kind']),description:'Aucun e-mail ni téléphone requis. Le code est exigé seulement si signupRequiresCode est vrai. Certains identifiants sont réservés. Ne crée pas automatiquement une session.'});
 add('post','/api/auth/password','Connexion par identifiant et mot de passe',{publicAccess:true,schema:object({username:string(255),password}),response:authResponse,description:'Si la 2FA est active, aucun jeton Matrix n’est retourné avant validation. Un cookie HttpOnly lie alors le défi au navigateur.'});
 add('post','/api/auth/verify','Valider le second facteur',{publicAccess:true,schema:object({id:string(128),code}),response:{$ref:'#/components/schemas/MatrixSession'},description:'Exige le cookie HttpOnly reçu lors de la connexion primaire. Envoyer les cookies de la même origine. Le défi expire et le code de secours est à usage unique.'});
 add('post','/api/auth/cancel','Annuler une connexion en attente',{publicAccess:true,schema:object({id:string(128)}),description:'Le cookie du défi est nécessaire pour annuler la session correspondante.'});
 for(const [path,summary] of [['status','État de ma 2FA'],['audit','Mes événements de sécurité'],['devices','Mes appareils et ma session actuelle']])add('get','/api/security/'+path,summary);
 add('post','/api/security/devices/revoke','Révoquer une autre session',{schema:object({...stepUp,deviceId:string(255)},['password','deviceId']),description:'Mot de passe vérifié par UIA Matrix ; second facteur exigé s’il est actif. La session actuelle ne peut pas être révoquée ici. Ne supprime pas les clés déjà téléchargées.'});
 for(const [path,summary,required]of [['totp/begin','Préparer une inscription TOTP',['password']],['totp/confirm','Confirmer TOTP et obtenir dix codes de secours',['password','code']],['totp/disable','Désactiver TOTP',['password','code']],['backup-codes','Renouveler les codes de secours',['password','code']]])add('post','/api/security/'+path,summary,{schema:object(stepUp,required)});
 add('post','/api/passkeys/options','Préparer une connexion WebAuthn',{publicAccess:true,description:'Retourne un défi et ses options ; conserver le cookie HttpOnly dans ce parcours.'});
 add('post','/api/passkeys/login','Vérifier une assertion WebAuthn',{publicAccess:true,schema:object({id:string(128),credential:freeObject}),response:authResponse,description:'credential suit AuthenticationResponseJSON WebAuthn. Exige le cookie du défi. La 2FA active reste requise après la preuve WebAuthn.'});
 add('get','/api/passkeys/list','Lister mes clés d’accès');
 add('post','/api/passkeys/register/options','Préparer l’ajout d’une clé d’accès',{schema:object({...stepUp,name:string(80)},['password','name']),description:'Second facteur exigé s’il est actif.'});
 add('post','/api/passkeys/register/verify','Vérifier et enregistrer une nouvelle clé d’accès',{schema:object({id:string(128),credential:freeObject}),description:'credential suit RegistrationResponseJSON WebAuthn ; défi lié au jeton de session.'});
 add('post','/api/passkeys/remove','Supprimer ma clé d’accès',{schema:object({...stepUp,id:string(1024)},['password','id']),description:'Second facteur exigé s’il est actif. Les sessions déjà ouvertes ne sont pas révoquées.'});
 add('post','/api/wallet/challenge','Préparer une signature SIWE',{publicAccess:true,schema:object({address:{...string(42),pattern:'^0x[a-fA-F0-9]{40}$'},chainId:{type:'integer',minimum:1},purpose:enumeration('login','link')}),description:'purpose=link exige en plus une session Matrix authentifiée. Conserver le cookie de liaison du défi. Aucun transfert de fonds.'});
 add('post','/api/wallet/login','Connexion par wallet associé',{publicAccess:true,schema:object({id:string(128),signature:{...string(1024),writeOnly:true}}),response:authResponse,description:'Cookie du défi requis. Le wallet doit être associé au préalable ; la 2FA active reste requise.'});
 add('get','/api/wallet/list','Lister mes wallets associés');
 add('post','/api/wallet/link','Associer une preuve wallet à mon compte',{schema:object({id:string(128),signature:{...string(1024),writeOnly:true},password}),description:'Défi purpose=link lié à la session et au cookie, avec confirmation du mot de passe.'});
 add('post','/api/wallet/unlink','Retirer un wallet de mon compte',{schema:object({address:string(42),password})});
 add('get','/api/me','Mon profil et mes règles de réception');
 add('put','/api/me','Modifier mon nom affiché et mon type déclaré',{schema:object({name:string(80),kind:enumeration('human','agent')}),description:'Le type déclaré ne confère aucun pouvoir d’administration.'});
 add('get','/api/address-book','Lister mes contacts enregistrés',{description:'Carnet privé du compte, limité à 1000 contacts ; ne modifie pas les règles de réception.'});
 add('post','/api/address-book','Enregistrer, renommer ou retirer un contact',{schema:object({mxid:string(255),name:string(80),action:enumeration('save','remove')},['mxid','action'])});
 add('get','/api/contacts','Rechercher un contact autorisé',{parameters:[query('q',string(255,0),'Identifiant ou adresse recherchée')]});
 add('get','/api/contacts/{contactId}','Carte de contact publique du compte accessible');
 add('get','/api/policy','Mes règles de réception');
 add('put','/api/policy','Définir mon mode de réception',{schema:object({mode:enumeration('open','allowlist')})});
 add('post','/api/policy/rules','Autoriser, bloquer ou retirer une règle',{schema:object({target:string(255),action:enumeration('allow','block','remove')}),description:'Le blocage prime. Dans un groupe, un refus de réception peut empêcher la livraison pour tout le salon.'});
 add('post','/api/can-contact','Vérifier si un compte peut recevoir mon invitation',{schema:object({target:string(255)})});
 add('post','/api/receipts','Enregistrer un accusé de réception applicatif',{schema:object({eventId:{...string(255),pattern:'^\\$'},roomId:{...string(255),pattern:'^!'},state:enumeration('received','notified','processed')}),description:'L’événement référencé est vérifié dans Matrix avec les droits du demandeur. Distinct d’un reçu de lecture Matrix.'});
 add('get','/api/coordination/permissions','Mes permissions de coordination');
 add('get','/api/coordination/tools','Contrats d’outils appartenant au serveur');
 add('get','/api/coordination/channels/{roomId}','Mode de coordination de mon canal');
 add('put','/api/coordination/channels/{roomId}','Configurer un canal administré',{schema:object({mode:enumeration('manual','principal','all'),principalId:{type:['string','null'],format:'uuid'},version:{type:'integer',minimum:0}}),description:'Pouvoirs Matrix du canal requis. principalId doit être null hors mode principal. Version optimiste obligatoire.'});
 add('post','/api/coordination/channels/{roomId}/resolve','Résoudre les mentions selon le mode du canal',{schema:object({mentions:{type:'array',items:uuid,maxItems:32,uniqueItems:true}}),description:'Ne lance aucun modèle ; les capacités sont déclarées.'});
 add('put','/api/coordination/agents/me','Déclarer mes capacités d’agent',{schema:object({provider:string(80),capabilities:{type:'array',items:string(48),maxItems:32},protocols:{type:'array',items:string(48),maxItems:32}})});
 add('post','/api/coordination/agents/me/heartbeat','Maintenir ma présence d’agent');
 add('get','/api/coordination/agents','Lister les agents accessibles',{parameters:[query('roomId',string(255),'Canal auquel le demandeur participe')]});
 add('get','/api/coordination/agents/{agentId}','Consulter un agent accessible');
 add('get','/api/coordination/tasks','Lister mes tâches accessibles',{parameters:[query('after',uuid,'Curseur next de la page précédente ; ordre stable par identifiant, 100 candidats maximum par page. Une page peut être vide après filtrage des permissions tout en fournissant next.')],response:object({tasks:{type:'array',maxItems:100,items:freeObject},next:{oneOf:[uuid,{type:'null'}]}})});
 add('get','/api/coordination/revocable-tasks','Lister les contrats que je peux révoquer',{parameters:[query('after',string(128,0),'Curseur opaque retourné par le serveur')]});
 add('get','/api/coordination/tasks/{taskId}/delegation','Consulter la politique de délégation');
 add('put','/api/coordination/tasks/{taskId}/delegation','Configurer la délégation de mon contrat racine',{schema:object({decision:enumeration('allow','ask','never'),maxDepth:{type:'integer',minimum:1,maximum:3},maxTasks:{type:'integer',minimum:1,maximum:32}})});
 add('get','/api/coordination/approvals','Lister mes demandes de validation');
 for(const tool of coordinationTools)add(tool.method.toLowerCase(),tool.path,tool.id,{schema:structuredClone(tool.inputSchema),status:tool.method==='POST'?'201':'200',description:tool.effect+' Permission : '+tool.permission});
 const events=add('get','/api/coordination/events','Événements de coordination autorisés',{parameters:[query('after',{type:'integer',minimum:0},'Dernière séquence reçue'),query('stream',enumeration('1'),'Demander un flux SSE plutôt que JSON')],description:'Deux flux simultanés par compte au maximum. Reprise par curseur after ; les droits sont revérifiés.'});
 events.responses['200'].content['text/event-stream']={schema:{type:'string'}};
 return {openapi:'3.1.0',info:{title:'PolyTalk — API applicative',version:'0.1.0',description:'API de contrôle et coordination. Les contenus de messages chiffrés utilisent l’API Matrix séparée. Les cookies de défis doivent rester dans le même navigateur/origine ; les entrées reçues d’agents ne sont jamais des autorisations d’exécution. Les réponses métier restent extensibles ; leurs schémas détaillés sont progressivement affinés.'},servers:[{url:'/'}],security:[{MatrixBearer:[]}],paths,components:{securitySchemes:{MatrixBearer:{type:'http',scheme:'bearer',description:'Jeton de session Matrix obtenu après authentification et second facteur éventuel.'}},schemas:{Error:object({error:string(2048)}),MatrixSession:{type:'object',required:['user_id','device_id','access_token'],properties:{user_id:string(255),device_id:string(255),access_token:{...string(8192),description:'Jeton sensible de session, à conserver hors des journaux.'}},additionalProperties:true},SecondFactorRequired:{type:'object',required:['mfaRequired','id'],properties:{mfaRequired:{const:true},id:string(128)},additionalProperties:true}},responses:{Error:{description:'Erreur de validation, authentification, permission, conflit, quota ou dépendance indisponible. Aucun nouvel essai automatique d’envoi.',content:{'application/json':{schema:{$ref:'#/components/schemas/Error'}}}}}}};
}
