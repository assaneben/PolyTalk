"""Maintenance documentaire, Python standard. Les HTML livrés restent autonomes."""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / '05-archives/versions/2026-10-16-avant-integration-progressive'
ACTIVE = ['00-pilotage/index.html', '01-cadrage/vision.html',
          '02-architecture/decisions.html', '03-recherche/protocoles-connecteurs.html']
for rel in ACTIVE:
    dest = BACKUP / rel
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dest)

CSS = '''
:root{color-scheme:light;--ink:#172d3c;--muted:#4b6273;--line:#d4e0e9;--accent:#075b76}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f2f6f9;color:var(--ink);font:16px/1.7 system-ui,sans-serif}
main{max-width:1120px;margin:auto;padding:28px 24px 64px}header,section,nav{background:white;border:1px solid var(--line);border-radius:14px;padding:26px;margin:18px 0}
header{border-top:6px solid var(--accent)}h1{font-size:clamp(1.9rem,4vw,2.8rem);line-height:1.18;letter-spacing:-.025em}h2{font-size:1.45rem;line-height:1.35;color:#124e65}h3{font-size:1.1rem}
p,li,dd{max-width:90ch}small,.meta{color:var(--muted)}a{color:#075b76;text-underline-offset:3px;overflow-wrap:anywhere}a:focus-visible,summary:focus-visible{outline:3px solid #ac5100;outline-offset:4px}
nav{background:#e7f0f5}nav ol{columns:2;column-gap:36px}nav li{break-inside:avoid;margin-bottom:7px}section{scroll-margin-top:16px}.retour{display:block;margin-top:20px;font-size:.9rem}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.95rem}th,td{border:1px solid var(--line);padding:12px;text-align:left;vertical-align:top}th{background:#eaf2f7}
.notice{border-left:5px solid #b8650c;padding:14px 18px;background:#fff7e9}.decision{border-left:5px solid #08765e;padding:14px 18px;background:#eef9f5}
dt{font-weight:700;margin-top:14px}dd{margin:4px 0 16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#132e40;color:#edf6fa;padding:20px;border-radius:10px}code{font-family:Consolas,monospace;font-size:.92em}
.flow{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:12px;align-items:center}.flow div{padding:18px;border:1px solid var(--line);border-radius:10px;background:#edf5f8}.flow b{display:block}.flow .relay{background:#fff7e9}
footer{color:var(--muted);font-size:.9rem}summary{cursor:pointer;font-weight:650}details{margin:14px 0}.skip{display:inline-block;padding:4px 0}
@media(max-width:720px){main{padding:18px 12px}header,section,nav{padding:20px}nav ol{columns:1}.flow{grid-template-columns:1fr}.flow span{text-align:center;transform:rotate(90deg)}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{body{background:white;font-size:11pt}main{max-width:none;padding:0}nav,.skip,.retour{display:none}header,section{border-radius:0;margin:12px 0;padding:14px}h2,h3{break-after:avoid}tr,.flow{break-inside:avoid}a{color:inherit}pre{background:#eee;color:black}.table-wrap{overflow:visible}}
'''

def table(headers, rows):
    return '<div class="table-wrap"><table><thead><tr>' + ''.join('<th scope="col">'+escape(x)+'</th>' for x in headers) + '</tr></thead><tbody>' + ''.join('<tr>'+''.join('<td>'+x+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'

SOURCES = [
 ('a2a', 'A2A — spécification publiée v1.0.0', 'https://a2a-protocol.org/v1.0.0/specification/', 'Opérations et interfaces A2A ; référence de départ à figer pour le prototype.'),
 ('binding', 'A2A — binding SLIMRPC expérimental, spécification v1', 'https://github.com/a2aproject/experimental-cpb-slimrpc/blob/main/spec/v1/slimrpc.md', 'Protobuf, métadonnées de service et déclaration dans les Agent Cards ; document évolutif.'),
 ('integration', 'SLIM — intégration A2A', 'https://slim.agntcy.org/latest/slim/integrations/a2a/', 'Existence de l’intégration ; statut expérimental et implémentations proposées.'),
 ('rpc', 'SLIM — fonctionnement de SLIMRPC', 'https://slim.agntcy.org/latest/slim/components/sdk/slimrpc/', 'Multiplexage des appels et métadonnées service, method et rpc-id.'),
 ('p2p', 'SLIM — sessions point à point', 'https://slim.agntcy.org/latest/slim/architecture/sessions/session-p2p/', 'Établissement de session et activation optionnelle de MLS.'),
 ('groups', 'SLIM — sessions de groupe', 'https://slim.agntcy.org/latest/slim/architecture/sessions/group/', 'Modération, MLS optionnel, états en ligne/hors ligne et persistance.'),
 ('auth', 'SLIM — authentification', 'https://slim.agntcy.org/latest/slim/architecture/authentication/', 'Différence entre identité applicative et connexion ; contrôle de liaison identité/nom.'),
 ('draft', 'SLIM — Internet-Draft individuel, révision 02', 'https://datatracker.ietf.org/doc/html/draft-mpsb-agntcy-slim-02', 'Architecture par couches et routage ; travail en cours, pas une norme IETF adoptée.'),
 ('mls', 'IETF — RFC 9420, protocole MLS', 'https://www.rfc-editor.org/rfc/rfc9420.html', 'PrivateMessage, données authentifiées et champs visibles, notamment §6.3.'),
 ('mlsarch', 'IETF — RFC 9750, architecture MLS', 'https://www.rfc-editor.org/rfc/rfc9750.html', 'Services d’identité et livraison, groupes à deux, métadonnées et limites de sécurité.'),
]
def cite(key):
    s=next(x for x in SOURCES if x[0]==key)
    return ' <a href="'+s[2]+'">[Source : '+escape(s[1])+']</a>'
def source_section():
    return '<p>Consultation : 16 octobre 2026. Sources primaires. Les pages « latest » et les branches « main » peuvent évoluer ; aucune version de SDK n’est validée par cette revue.</p><ul>'+''.join('<li><a href="'+u+'">'+escape(n)+'</a> — '+escape(d)+'</li>' for _,n,u,d in SOURCES)+'</ul>'

GLOSSARY = '<dl>' + ''.join('<dt>'+escape(k)+'</dt><dd>'+escape(v)+'</dd>' for k,v in [
 ('API','Interface d’accès programmatique aux fonctions de Polytalk.'),('MCP','Model Context Protocol : accès d’un agent à des outils et ressources.'),('A2A','Agent2Agent : protocole d’interaction entre agents indépendants.'),('SLIM','Secure Low-Latency Interactive Messaging : infrastructure de transport et de sessions.'),('SLIMRPC','Binding RPC sur SLIM ; l’intégration A2A correspondante reste expérimentale.'),('MLS','Messaging Layer Security : protocole de chiffrement de groupe utilisable aussi pour deux clients.'),('Binding','Association des opérations d’un protocole à un transport et à une représentation sur le réseau.'),('Protobuf','Format de sérialisation structuré utilisé par le binding SLIMRPC.'),('AAD','Additional Authenticated Data : données liées cryptographiquement au message mais non chiffrées.'),('Epoch','Version de l’état cryptographique d’un groupe MLS.'),('KeyPackage','Matériel public signé destiné à l’ajout d’un client MLS ; aucune clé privée ne doit être publiée.'),('Agent Card','Description des capacités et interfaces d’un agent ; distincte de la carte de contact cryptographique Polytalk.'),('Composant local de confiance','Processus sous le contrôle du propriétaire de l’agent, chargé des clés et du chiffrement.'),('PoC','Prototype destiné à vérifier la faisabilité ; il ne prouve pas à lui seul l’aptitude à la production.'),('ADR','Décision d’architecture datée, motivée et accompagnée de conséquences.'),('TLS / mTLS','Protection des connexions réseau ; mTLS ajoute l’authentification mutuelle. Ces connexions ne remplacent pas MLS.')])+'</dl>'

def write_doc(rel,title,sections,version='1.0'):
    nav='<nav id="sommaire" aria-label="Sommaire du document"><h2>Sommaire</h2><ol>'+''.join('<li><a href="#'+i+'">'+escape(h)+'</a></li>' for i,h,_ in sections)+'</ol></nav>'
    body=''.join('<section id="'+i+'"><h2>'+escape(h)+'</h2>'+b+'<a class="retour" href="#sommaire">Retour au sommaire</a></section>' for i,h,b in sections)
    p=ROOT/rel;p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text('<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>'+escape(title)+'</title>\n<style>'+CSS+'</style>\n</head>\n<body><main><a class="skip" href="#sommaire">Aller au sommaire</a><header><small>POLYTALK · 16 OCTOBRE 2026 · VERSION '+version+'</small><h1>'+escape(title)+'</h1><p class="meta">Dossier documentaire autonome · Architecture cible et validations explicitement distinguées.</p></header>'+nav+body+'<footer>Chaque fichier se consulte hors ligne. Les références externes sont facultatives pour la lecture et nécessitent Internet pour leur ouverture.</footer></main></body>\n</html>\n',encoding='utf-8')

ROADMAP = table(['Étape','Travail prévu','Condition de passage'],[
 ('1 · API et MCP','Définir identité, contacts, enveloppes versionnées, permissions et composant local de confiance. API de dépôt/retrait de contenus opaques ; outils MCP locaux utilisant le même socle.','Deux agents échangent via API/MCP ; aucun secret dans les journaux. Tant que le profil E2EE n’est pas validé : démonstration sur données synthétiques uniquement.'),
 ('2 · A2A','Ajouter un adaptateur conservant les opérations et types de la version A2A retenue. Vérifier les capacités via Agent Card. Le traitement A2A en clair reste chez les correspondants.','Aller-retour entre deux implémentations distinctes, identités et permissions vérifiées, erreurs et événements de flux correctement préservés. Pas de revendication E2EE sur un simple transport HTTPS.'),
 ('3 · Validation SLIM et MLS','Tester A2A sur SLIMRPC expérimental, avec MLS explicitement activé. Inspecter charge utile, métadonnées, identité, reprises et groupes.','Rapport de PoC et versions figées ; les tests bloquants ci-dessous passent. Sinon, conserver l’adaptateur expérimental désactivé ; aucun repli non chiffré.'),
 ('Production · après validation','Durcir les configurations, réaliser la revue indépendante, qualifier la livraison différée et documenter les clients supportés.','Aucun défaut critique ouvert ; revue des clés, modèle de menaces, procédures d’exploitation et critères de service acceptés.')])

ARCH_SECTIONS=[
 ('decision','Décision retenue pour le dossier', '<div class="decision"><p><strong>Cible recommandée : A2A → SLIMRPC → session SLIM avec MLS activé → relais SLIM.</strong> Le destinataire réalise le chemin inverse dans son environnement de confiance. Réutiliser le binding existant plutôt que créer un encapsulage cryptographique propriétaire.</p></div><p>Statut : choix de conception retenu pour le prototype ; mise en production conditionnée aux preuves de validation. Aucune application de messagerie n’est implémentée dans ce dossier. L’expression « meilleure solution » désigne ici le meilleur compromis identifié pour les besoins exprimés, pas un classement de sécurité absolu.</p><p>L’intégration A2A/SLIMRPC est expérimentale et n’appartient pas au cœur A2A.'+cite('integration')+'</p>'),
 ('progression','Intégration progressive', '<p><strong>API et MCP, puis A2A, puis validation de SLIM et MLS.</strong> La validation précoce de la frontière de confiance commence à l’étape 1 ; la qualification du couple SLIM/MLS constitue l’étape 3. Cet ordre ne permet pas de lancer une messagerie privée sans E2EE.</p>'+ROADMAP),
 ('comparaison','Choix comparés',table(['Option','Analyse de conception','Décision'],[
 ('A2A sur SLIMRPC + MLS natif','Réutilise une intégration publiée ; garde les opérations A2A aux extrémités. Dépend du binding expérimental et de la couverture effective du chiffrement.','Cible du PoC.'),
 ('Passerelle centrale A2A HTTP → SLIM','Si elle reçoit l’A2A en clair, la passerelle connaît le contenu avant son chiffrement.','Écartée pour le mode privé. Une passerelle contrôlée par le propriétaire peut servir d’extrémité explicitement déclarée.'),
 ('Tunnel propriétaire avec second groupe MLS','Peut protéger davantage de métadonnées mais ajoute protocole, état de clés et problèmes d’interopérabilité.','Pas de double couche par défaut. Réexaminer uniquement si la pile native échoue aux critères de confidentialité.'),
 ('A2A sur HTTPS seul','Facilite une première intégration ; ne protège pas le contenu contre un relais qui termine TLS.','Acceptable entre extrémités de confiance, pas comme preuve d’E2EE à travers la plateforme.')])+ '<p>Comparaison propre à Polytalk, issue des besoins de confidentialité et d’interopérabilité ; pas un résultat de benchmark.</p>'),
 ('flux','Transport A2A sur SLIM', '<div class="flow" role="img" aria-label="Le connecteur de l’agent A chiffre ; le relais route le contenu opaque ; le connecteur de l’agent B déchiffre."><div><b>Agent A</b>A2A → SLIMRPC<br>MLS chiffre localement</div><span aria-hidden="true">→</span><div class="relay"><b>Relais SLIM</b>Adresse de transport<br>Contenu opaque</div><span aria-hidden="true">→</span><div><b>Agent B</b>MLS déchiffre localement<br>SLIMRPC → A2A</div></div><ol><li>Résoudre le contact et vérifier le lien entre identité Polytalk, identité du client MLS et interface annoncée. Le routage vers une instance ne constitue pas cette preuve.</li><li>Choisir une version A2A publiée et figer un ensemble compatible : schéma <code>a2a.proto</code>, adaptateur, SLIMRPC et SDK SLIM. Départ proposé : A2A 1.0.0 ; ne pas mélanger les opérations d’une version future avec ce profil.</li><li>Sérialiser les requêtes, réponses et événements A2A en Protobuf via le binding SLIMRPC. Déclarer l’interface expérimentale dans <code>supportedInterfaces</code>, avec le <code>protocolBinding</code> publié et l’adresse SLIM attendue par la révision épinglée.</li><li>Établir la session entre composants de confiance des agents ; exiger MLS. Le relais transporte les messages de session et les charges chiffrées ; il n’est pas membre du groupe MLS.</li><li>Chez le destinataire : vérifier la session et l’identité, déchiffrer, valider le schéma et l’autorisation, puis remettre le message à l’agent. Les réponses suivent la même protection.</li></ol><p>Le binding réutilise les types Protobuf d’A2A et prévoit les paramètres de service dans une carte de métadonnées.'+cite('binding')+'</p>'),
 ('confidentialite','Quelles parties chiffrer et quelles parties laisser accessibles',table(['Élément','Politique Polytalk','Visibilité aux relais'],[
 ('Charge utile A2A','Chiffrer le corps complet : textes, données structurées, tâches, identifiants de contexte, artefacts inclus, états, erreurs applicatives et événements de flux.','Opaque si tout est bien dans la charge protégée. Éviter les copies dans les logs et métadonnées.'),
 ('Adresse SLIM et contrôle de livraison','Conserver les champs exigés par SLIM : destinations/canaux, source ou instance selon le format, identifiants de session/paquet et contrôles nécessaires. Utiliser des noms opaques plutôt que des noms de personnes ou de tâches.','Accessibles au plan de routage ; certains champs permettent la corrélation. Ne pas modifier le format natif pour prétendre les cacher.'),
 ('Métadonnées SLIMRPC','Traiter <code>service</code>, <code>method</code>, <code>rpc-id</code>, direction et paramètres <code>A2A-*</code> comme potentiellement visibles tant que le SDK exact n’a pas été inspecté. Ne jamais y placer texte, secret, nom de document ou donnée personnelle.','Leur protection MLS n’est pas démontrée par la présente revue ; test bloquant. Le relais n’en a pas besoin pour interpréter le contenu métier.'),
 ('Champs MLS PrivateMessage','Accepter la visibilité protocolaire de <code>group_id</code>, <code>epoch</code>, <code>content_type</code> et <code>authenticated_data</code>. Ne placer aucun secret dans l’AAD.','Authentifiés mais non chiffrés pour ces champs ; les données d’expéditeur MLS sont chiffrées, sans masquer nécessairement la source du transport.'),
 ('Agent Card et annuaire','Publier uniquement les informations de découverte nécessaires ; réserver les capacités sensibles aux contacts autorisés.','Selon la politique de publication ; une Agent Card n’est pas automatiquement confidentielle.'),
 ('Pièces jointes externes','Chiffrer le fichier avant stockage avec une bibliothèque adaptée ; transmettre référence, clé de fichier et données de vérification dans le contenu E2EE. Spécification détaillée reportée hors MVP.','L’hébergeur voit taille et accès ; le fichier ne devient pas privé parce que son URL est transportée par MLS.'),
 ('Traces et métriques','Aucun contenu ou secret ; limiter les identifiants de corrélation, accès et durée de conservation.','Les horodatages, volumes et adresses réseau ne sont pas masqués par MLS.')])+ '<p>Le SDK décrit les métadonnées d’appel indépendamment du nom de destination.'+cite('rpc')+' La séparation entre champs publics et contenu chiffré est définie par MLS, notamment §6.3.'+cite('mls')+'</p>'),
 ('integrite','Intégrité du routage et négociation des capacités','<p>Politique de conception : lier au message le contexte immuable de destination et la version du profil. Si le SDK expose l’AAD MLS, y encoder seulement les identifiants opaques nécessaires, avec une représentation déterministe et versionnée. Sinon, conserver ces valeurs dans le contenu protégé et les comparer au contexte de session après déchiffrement. Le choix exact doit être figé et testé, sans modifier les primitives MLS.</p><p>Ne pas authentifier comme données immuables les éléments modifiés légitimement en transit, comme un compteur de sauts. Une expiration extérieure peut limiter la file du relais ; si sa valeur a un effet applicatif, une expiration authentifiée dans le contenu doit aussi être vérifiée par le destinataire. Une modification de destination doit échouer ou être rejetée, jamais conduire à une exécution silencieuse.</p><p>Exiger un profil de sécurité commun. En l’absence de MLS ou de capacité nécessaire, refuser le mode privé ; aucune conversion centrale vers du clair. TLS reste obligatoire sur les liens pour protéger les échanges réseau.'+cite('mlsarch')+'</p>'),
 ('identites','Identités, clés et autorisations','<p>L’identifiant stable Polytalk est distinct des clés et des noms d’instance SLIM. Le composant local vérifie les correspondances avec les identités autorisées ; un annuaire ne doit pas suffire à imposer une nouvelle clé sans contrôle. Une rotation conserve l’adresse publique, mais exige une continuité vérifiée ou une procédure de récupération explicite.</p><p>Pour le PoC : identités distinctes par agent, vérification stricte du pair et liaison identité/nom activée en mode bloquant lorsque disponible. Écarter les secrets symétriques partagés entre agents indépendants. L’authentification de connexion et l’identité applicative sont des contrôles séparés.'+cite('auth')+'</p><p>Les autorisations restent nécessaires pour chaque conversation et chaque action. Une signature valide ne rend pas une instruction reçue autorisée. En cas de révocation : couper les accès au service, retirer le client du groupe et finaliser la transition cryptographique ; l’expiration d’un jeton seule ne révoque pas les secrets de groupe déjà détenus.</p>'),
 ('groupes','Sessions, groupes et absence de service central déchiffrant','<p>Commencer par deux agents identifiés et une session MLS explicitement activée ; tester ensuite les groupes.'+cite('p2p')+'</p><p>Le modérateur de groupe doit être un composant de confiance désigné par le propriétaire ou les membres. Un Channel Manager central participant au groupe pourrait étendre la frontière de confiance : ne pas lui attribuer ce rôle pour les conversations privées sans vérification. Les relais restent hors des membres autorisés.</p><p>Les sessions SLIM ont leurs propres règles de présence, de groupe et de reprise.'+cite('groups')+' Ne pas assimiler leur fiabilité en ligne à une boîte aux lettres durable. MLS assure des fonctions cryptographiques ; les règles d’adhésion, de stockage et de livraison relèvent aussi de l’application.</p>'),
 ('differe','Livraison différée, reprises et limites','<p>Concevoir une file persistante contenant uniquement les enveloppes chiffrées, avec durée de conservation, quotas et accusé de dépôt. Un accusé de dépôt ne vaut ni déchiffrement réussi ni traitement par l’agent. L’accusé applicatif doit revenir dans le canal protégé.</p><p>Le PoC doit établir si le SDK sait délivrer à un agent hors ligne avec l’état cryptographique disponible. Si non, annoncer « session en ligne » uniquement et différer la fonction boîte aux lettres ; ne pas retirer puis réinviter un destinataire en prétendant qu’il pourra lire l’historique manqué.</p><p>Gérer doublons, ordre des événements, restauration après panne et reprise des états MLS avant de promettre une livraison différée. L’idempotence applicative doit empêcher qu’un message retransmis déclenche deux actions ; aucune garantie « exactement une fois » n’est annoncée.</p>'),
 ('menaces','Revue de sécurité de conception · SecureByDesign v1.1.0','<p>Criticité de travail : STANDARD, à réévaluer selon les données traitées. Version locale du guide : 1.1.0 ; sa dernière version en ligne n’a pas pu être vérifiée. Ce chapitre est une revue documentaire et non un audit du code ou d’un déploiement.</p>'+table(['Menace / frontière','Mesure de conception','Preuve attendue'],[
 ('Relais ou stockage compromis','Clés privées hors plateforme ; aucune adhésion MLS du relais.','Capture sur relais et recherche de marqueurs connus en clair.'),
 ('Substitution d’identité ou de destination','Vérifier le pair et le contexte de conversation ; détecter les changements de clés.','Tests négatifs avec mauvaise identité, mauvais canal et annuaire modifié.'),
 ('Agent compromis ou malveillant','Permissions par action et validation des contenus ; aucun accès automatique aux outils.','Message hostile reçu sans exécution ni fuite automatique de données.'),
 ('Réutilisation d’état et panne','Persistance protégée et cohérente des clés/états, procédure de récupération.','Arrêt brutal, restauration et contrôle d’absence de réutilisation dangereuse.'),
 ('Fuite par métadonnées / observabilité','Noms opaques, journaux minimaux, accès restreints et rétention documentée.','Inspection des paquets et traces sur la version choisie.'),
 ('Chaîne logicielle','Versions et révisions figées, licences et dépendances examinées avant installation.','Manifeste reproductible et vérification des artefacts.'),
 ('Fournisseur du modèle','Documenter le contenu transmis après déchiffrement et la politique du propriétaire.','Cartographie des flux vers les fournisseurs ; E2EE du transport ne les masque pas au modèle.')])+ '<p>Priorités : frontières des clés, identité des pairs, couverture effective du chiffrement, reprise cryptographique, puis durcissement opérationnel. La confidentialité ne protège pas contre un destinataire légitime qui copie un message ni contre la compromission de son environnement.</p>'),
 ('validation','Critères bloquants du prototype',table(['Test à exécuter','Résultat requis','État actuel'],[
 ('T01 · Versions','Figer A2A, adaptateur, SLIM, SLIMRPC et dépendances ; aucune API de développement supposée disponible.','Non exécuté'),
 ('T02 · Interopérabilité','Deux agents de fournisseurs différents ; API/MCP via composant local et A2A ; conservation des types et erreurs.','Non exécuté'),
 ('T03 · Confidentialité','Marqueurs dans textes, tâches, erreurs et flux absents des relais, stockage et journaux.','Non exécuté'),
 ('T04 · Métadonnées','Inventorier chaque champ réseau et SLIMRPC ; vérifier chiffrement et intégrité réels.','Non exécuté'),
 ('T05 · Identités / altérations','Mauvais pair, mauvaise clé, destination changée et trame corrompue refusés.','Non exécuté'),
 ('T06 · Refus du downgrade','MLS désactivé, négociation falsifiée ou profil incompatible : échec explicite.','Non exécuté'),
 ('T07 · Groupes / révocation','Modérateur autorisé ; après retrait et commit appliqué, ancien membre incapable de lire les futurs messages.','Non exécuté'),
 ('T08 · Reprise / hors ligne','Tester crash, doublons, ordre, état MLS et livraison différée ; annoncer uniquement les propriétés démontrées.','Non exécuté'),
 ('T09 · Charges / abus','Limites de taille et quotas ; aucun déclenchement d’action sur simple réception.','Non exécuté')])+ '<p>Les contrôles réellement réalisés dans ce dossier portent sur les sources et les fichiers HTML. Ils ne remplacent pas ces tests réseau et cryptographiques.</p>'),
 ('preuves','Faits vérifiés, décisions et inconnues','<p><strong>Vérifié dans les sources :</strong> binding A2A/SLIMRPC existant et expérimental ; support MLS optionnel dans SLIM ; routage sans lecture de la charge utile ; champs MLS non chiffrés. SLIM reste décrit par un Internet-Draft individuel, pas par une norme IETF adoptée.'+cite('draft')+'</p><p><strong>Décidé pour Polytalk :</strong> progression API/MCP → A2A → validation SLIM/MLS ; E2EE obligatoire pour le mode privé ; composants cryptographiques chez les agents ; enveloppe extérieure minimale ; absence de repli silencieux.</p><p><strong>À prouver :</strong> compatibilité des versions et des clients, protection exacte des métadonnées SLIMRPC, fonctionnement des clés et identités dans les SDK, reprise hors ligne, sécurité du modérateur et performances.</p><p><strong>Écarts documentaires à résoudre :</strong> le draft SLIM décrit un adressage de méthode dans le nom de service, tandis que la documentation actuelle SLIMRPC place service et méthode dans les métadonnées. Les explications de l’authentification réseau dans le binding et de l’identité applicative dans le SDK ne sont pas identiques. Il faut donc épingler les révisions et vérifier le code réellement utilisé ; ne pas fusionner les exemples de plusieurs générations.</p>'),
 ('glossaire','Glossaire',GLOSSARY),
 ('sources','Sources et portée de la vérification',source_section()+'<p>Cette analyse couvre les schémas de vulnérabilité connus dans l’architecture fournie. Elle ne remplace pas des tests d’intrusion, une modélisation formelle des menaces ni un audit de sécurité certifié pour les systèmes traitant des données sensibles ou réglementées.</p>')]
write_doc('02-architecture/transport-a2a-slim-mls.html','Polytalk — Transport A2A sur SLIM et chiffrement MLS',ARCH_SECTIONS)

write_doc('04-livrables/feuille-de-route-integration.html','Polytalk — Feuille de route d’intégration',[
 ('objectif','Objectif et décisions','<p>Messagerie universelle pour agents IA avec un socle commun, plusieurs accès et un mode privé de bout en bout. Décision du 16 octobre 2026 : <strong>API et MCP, puis A2A, puis validation de SLIM et MLS.</strong> Les capacités réellement prises en charge seront publiées par client et version.</p>'),
 ('etapes','Étapes et conditions de passage',ROADMAP),
 ('livrables','Livrables attendus', '<ol><li>Profil de messages et identité ; spécification API et outils MCP ; frontière des clés et politique d’autorisation.</li><li>Adaptateur A2A, matrice des capacités, exemples et preuves d’interopérabilité.</li><li>PoC A2A/SLIMRPC/MLS, inventaire des métadonnées, rapport des tests T01 à T09 et manifeste des versions.</li><li>Dossier d’exploitation, critères de service, procédures de révocation et de récupération, revue de sécurité avant production.</li></ol><p>Le document d’architecture décrit les tests détaillés. Aucun calendrier chiffré ni budget ne peut être fixé avant inventaire des ressources et essai technique.</p>'),
 ('etat','État réel et règle de livraison','<p>Réalisé : cadrage, revue de sources et décision documentaire. À réaliser : code de messagerie, prototype réseau, tests cryptographiques et compatibilité des clients. Aucune intégration n’est déclarée opérationnelle.</p><p>Les premières démonstrations peuvent utiliser des données synthétiques. Le mode privé n’est livré qu’après validation E2EE ; TLS seul ne remplit pas ce critère. Si SLIMRPC reste insuffisant, maintenir cette voie désactivée sans imposer tous les protocoles à tous les clients.</p>'),
 ('glossaire','Glossaire',GLOSSARY)])

# Conserver le contenu initial des documents tout en ajoutant la décision et une navigation uniforme.
def load_sections(rel):
    t=(ROOT/rel).read_text(encoding='utf-8')
    items=re.findall(r'<section id="([^"]+)"><h2>(.*?)</h2>(.*?)</section>',t,re.S)
    return [(i,h,re.sub(r'<a class="retour".*?</a>','',b,flags=re.S)) for i,h,b in items]

def put(items,new):
    items=[x for x in items if x[0]!=new[0]]
    idx=next((i for i,x in enumerate(items) if x[0]=='glossaire'),len(items))
    items.insert(idx,new)
    return items

vision=load_sections('01-cadrage/vision.html')
vision=[(i,h,b.replace('A2A, AGNTCY/SLIM et MLS sont des candidats complémentaires à évaluer ; leur assemblage n’est pas encore validé.', 'La cible de conception utilise A2A sur le binding SLIMRPC expérimental, avec MLS activé ; son intégration reste conditionnée au prototype.')) for i,h,b in vision]
vision=put(vision,('integration-progressive','Approche d’intégration progressive','<p><strong>API et MCP, puis A2A, puis validation de SLIM et MLS.</strong> Le chiffrement de bout en bout constitue une condition de livraison du mode privé, y compris pour les accès API/MCP. Les adaptations et la garde des clés restent dans l’environnement de confiance de chaque agent.</p><p>La cible A2A/SLIMRPC/MLS utilise un binding expérimental existant. Les relais routent les enveloppes sans déchiffrer leur contenu. Voir le <a href="../02-architecture/transport-a2a-slim-mls.html">dossier d’architecture détaillé</a> et la <a href="../04-livrables/feuille-de-route-integration.html">feuille de route</a>.</p>'))
write_doc('01-cadrage/vision.html','Polytalk — Vision et besoins initiaux',vision,'0.3')

decisions=load_sections('02-architecture/decisions.html')
decisions=put(decisions,('adr-003','ADR-003 · Intégration progressive · Retenue','<p>Date : 16 octobre 2026. Ordre retenu à la demande du porteur : <strong>API et MCP, puis A2A, puis validation de SLIM et MLS.</strong> Le développement des accès peut précéder la qualification du transport final. Aucun mode privé de production n’est livré sans E2EE validé.</p><p>Livrable : <a href="../04-livrables/feuille-de-route-integration.html">feuille de route avec conditions de passage</a>.</p>'))
decisions=put(decisions,('adr-004','ADR-004 · A2A sur SLIMRPC avec MLS · Cible conditionnelle','<p>Choix retenu pour le prototype : réutiliser le binding A2A/SLIMRPC expérimental et le MLS natif de SLIM, explicitement activé. Les clés et l’interprétation des messages restent dans les composants de confiance des agents. Les relais ne sont pas membres des groupes MLS.</p><p>Conserver les données nécessaires au routage à l’extérieur et le contenu A2A dans la charge chiffrée. La couverture des métadonnées SLIMRPC, les versions et la livraison différée restent à tester. Une passerelle centrale déchiffrante est écartée pour le mode privé ; aucun second groupe MLS superposé n’est prévu par défaut.</p><p>Motifs, sources, limites et tests bloquants : <a href="transport-a2a-slim-mls.html">dossier transport et chiffrement</a>.</p>'))
write_doc('02-architecture/decisions.html','Polytalk — Orientations d’architecture et sécurité',decisions,'0.2')

research=load_sections('03-recherche/protocoles-connecteurs.html')
research=[(i,h,('<p>Décision du 16 octobre 2026 : <strong>API et MCP, puis A2A, puis validation de SLIM et MLS.</strong> La revue a identifié un binding A2A/SLIMRPC expérimental existant ; la cible est de le réutiliser avec MLS activé aux extrémités. Les capacités de sécurité réelles de l’assemblage restent à tester.</p><p>Voir la <a href="../02-architecture/transport-a2a-slim-mls.html">revue détaillée, les sources et les critères de validation</a>.</p>' if i=='orientation' else b)) for i,h,b in research]
research=put(research,('verification','Vérification documentaire approfondie','<p>Le binding SLIMRPC ne doit pas être présenté comme un transport standard du cœur A2A. MLS est optionnel dans SLIM et doit être exigé par le profil Polytalk. La lecture des spécifications ne démontre pas à elle seule le chiffrement de toutes les métadonnées du SDK. Le dossier détaillé sépare faits, décisions et propriétés à prouver.</p>'))
write_doc('03-recherche/protocoles-connecteurs.html','Polytalk — Veille sur les protocoles et connecteurs',research,'0.2')

write_doc('05-archives/2026-10-16-decision-integration.html','Polytalk — Archive de la décision d’intégration',[
 ('demande','Demande enregistrée','<p>Le porteur demande d’inscrire l’intégration progressive API et MCP, puis A2A, puis validation de SLIM et MLS ; de vérifier professionnellement leur articulation ; et d’enregistrer la solution recommandée de transport et de séparation entre contenu chiffré et informations de routage.</p>'),
 ('resultat','Résultat de la revue','<p>Décision de conception : A2A sur SLIMRPC expérimental et MLS natif activé aux extrémités, sans passerelle centrale de déchiffrement. Contenu A2A chiffré ; métadonnées de routage minimisées ; couverture des métadonnées RPC et livraison différée à démontrer.</p><p>Livrés : dossier d’architecture, feuille de route et actualisation du cadrage, du registre de décisions et de la veille. Les versions antérieures sont conservées sous versions/2026-10-16-avant-integration-progressive.</p>'),
 ('glossaire','Glossaire',GLOSSARY)])

catalog=[
 ('Vision et besoins','../01-cadrage/vision.html','Périmètre confirmé, universalité et accès API/MCP.'),
 ('Registre des décisions','../02-architecture/decisions.html','Orientations E2EE, identité et décisions ADR-003/004.'),
 ('Transport A2A / SLIM / MLS','../02-architecture/transport-a2a-slim-mls.html','Architecture cible, tableau de visibilité et tests bloquants.'),
 ('Veille sur les protocoles','../03-recherche/protocoles-connecteurs.html','Comparaison et vérification documentaire.'),
 ('Feuille de route d’intégration','../04-livrables/feuille-de-route-integration.html','Étapes, livrables et conditions de passage.'),
 ('Compte rendu de vérification','verification-documentaire.html','Contrôles réalisés et limites explicites.'),
 ('Recueil initial du 15 octobre','../05-archives/2026-10-15-recueil.html','Archive historique de la première conversation.'),
 ('Compléments du 16 octobre','../05-archives/2026-10-16-complements.html','API et ambition de messagerie universelle.'),
 ('Décision d’intégration du 16 octobre','../05-archives/2026-10-16-decision-integration.html','Demande et résultat de cette revue.')]
write_doc('00-pilotage/index.html','Polytalk — Registre documentaire',[
 ('organisation','Organisation du dossier','<p>01-cadrage : besoins. 02-architecture : décisions et conception. 03-recherche : veille sourcée. 04-livrables : feuille de route. 05-archives : recueil, décisions datées et versions antérieures.</p>'),
 ('documents','Documents disponibles',table(['Document','Objet'],[('<a href="'+u+'">'+escape(n)+'</a>',escape(d)) for n,u,d in catalog])),
 ('approche','Approche retenue','<p><strong>API et MCP, puis A2A, puis validation de SLIM et MLS.</strong> Cible : A2A sur SLIMRPC expérimental, MLS activé aux extrémités ; aucune intégration exécutable n’est encore validée.</p>'),
 ('methode','Versionnement et vérification','<p>Les quatre documents actifs précédents sont conservés dans 05-archives/versions/2026-10-16-avant-integration-progressive. Les archives historiques restent inchangées. Les liens entre documents facilitent la navigation ; chaque document conserve son propre contenu, style, sommaire et glossaire pour être consultable seul.</p><p>Les propriétés des protocoles, les décisions Polytalk et les tests restant à effectuer sont distingués. Ne jamais archiver de clés privées ou jetons secrets.</p>'),
 ('glossaire','Glossaire',GLOSSARY)],'0.2')

write_doc('00-pilotage/verification-documentaire.html','Polytalk — Compte rendu de vérification documentaire',[
 ('perimetre','Périmètre de la vérification','<p>Date : 16 octobre 2026. Revue documentaire de l’architecture, sans installation de SDK ni déploiement de messagerie. Guide méthodologique local : SecureByDesign v1.1.0 ; version en ligne non vérifiable pendant cette revue.</p>'),
 ('controles','Contrôles réalisés',table(['Contrôle','Résultat'],[
 ('Sources primaires A2A, SLIM et IETF','Consultées ; références disponibles dans le dossier d’architecture.'),
 ('Statut des technologies','Binding A2A/SLIMRPC identifié comme expérimental ; SLIM Internet-Draft distingué des RFC MLS.'),
 ('Décisions et incertitudes','Séparées dans le dossier ; écarts documentaires signalés ; aucune compatibilité SDK présumée.'),
 ('HTML autonome','Contrôle automatique du français, UTF-8, styles dans le head et absence de ressources externes requises.'),
 ('Navigation','Contrôle automatique des identifiants uniques, ancres et liens locaux.'),
 ('Historique','Copies antérieures des quatre documents actifs conservées ; archives historiques inchangées.'),
 ('Affichage navigateur','Non vérifié : ouverture du fichier local refusée par la politique de sécurité du navigateur. Aucun contrôle visuel réussi n’est revendiqué.'),
 ('Réseau, cryptographie et performances','Non exécutés : les tests T01 à T09 du dossier restent à réaliser sur le prototype.') ])),
 ('limites','Limites et suite','<p>Les contrôles de structure ne garantissent pas le rendu sur tous les navigateurs Windows. La solution est appliquée aux documents comme cible de conception ; elle n’est pas présentée comme un système implémenté ou certifié. Le prototype devra vérifier les versions, la couverture des métadonnées, l’identité, la révocation et les reprises avant toute livraison privée.</p><p>Cette analyse couvre les schémas de vulnérabilité connus dans l’architecture fournie. Elle ne remplace pas des tests d’intrusion, une modélisation formelle des menaces ni un audit de sécurité certifié pour les systèmes traitant des données sensibles ou réglementées.</p>'),
 ('glossaire','Glossaire',GLOSSARY)])

class Inspector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.ids=[];self.links=[];self.errors=[];self.styles=0;self.in_head=False;self.lang=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='html':self.lang=a.get('lang')
        if tag=='head':self.in_head=True
        if tag=='style':
            self.styles+=1
            if not self.in_head:self.errors.append('style hors head')
        if 'id' in a:self.ids.append(a['id'])
        if tag=='a' and 'href' in a:self.links.append(a['href'])
        if tag in ('script','link','iframe','img','video','audio','object') and any(k in a for k in ('src','href','data')):self.errors.append('ressource externe ou dépendante')
    def handle_endtag(self,tag):
        if tag=='head':self.in_head=False

def verify():
    all_files=list(ROOT.rglob('*.html')); parsed={}
    for p in all_files:
        t=p.read_text(encoding='utf-8');i=Inspector();i.feed(t);parsed[p.resolve()]=i
        assert t.lstrip().lower().startswith('<!doctype html>'),p
        assert i.lang=='fr' and i.styles and not i.errors,(p,i.errors)
        assert len(i.ids)==len(set(i.ids)),p
        assert not re.search(r'@import|url\s*\(|\brequire\s*\(',t,re.I),p
        for href in i.links:
            if href.startswith('#'):assert href[1:] in i.ids,(p,href)
    for p,i in parsed.items():
        for href in i.links:
            if href.startswith(('http:','https:','#','mailto:')):continue
            name,_,anchor=href.partition('#');dest=(p.parent/name).resolve()
            assert dest.is_file(),(p,href)
            if anchor:assert anchor in parsed[dest].ids,(p,href)
    print(f'{len(all_files)} HTML vérifiés : UTF-8, français, styles inline, identifiants uniques, ancres et liens locaux valides, aucune ressource externe requise.')

if __name__=='__main__':
    from evaluer_socle_messagerie import appliquer
    appliquer(globals())
    from definir_identite_partage import appliquer_identite
    appliquer_identite(globals())
    verify()
