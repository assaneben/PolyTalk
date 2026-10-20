# PolyTalk — Suivi du projet

## Préparation open source — 20 octobre 2026

- [x] Licence officielle GPLv3 complète, GPL-3.0-or-later dans les métadonnées et avis sur les sources du projet.
- [x] README français/anglais, contribution, sécurité, support, conduite, citation, changelog et avis tiers.
- [x] Guides installation par OS, architecture, configuration, API, utilisation, développement, déploiement, tests, reproduction, confidentialité, glossaire et roadmap.
- [x] Formulaires GitHub, PR, Dependabot, catalogue labels, CI multi-OS, CodeQL et draft release ; actions épinglées par SHA.
- [x] Contrôle de 166 sources ; 260 tests Node réussis dans le projet et dans l'export indépendant ; builds réussis.
- [x] Export propre : 268 fichiers avec manifeste ; ZIP, arborescence et contenu intégral par fichier fournis ; secrets, données privées et anciens rapports exclus.
- [x] Syntaxe de 10 YAML et liens de 19 nouveaux guides vérifiés.
- [ ] Confirmer propriétaire/visibilité, contact public et responsables CODEOWNERS ; droits des visuels.
- [ ] Créer/pousser le dépôt GitHub puis activer réglages et observer CI/CodeQL réels ; vérifier les droits workflow du compte connecté.
- [ ] Requalifier Docker, Rust et la production ; aucun tag stable ni conformité Community Standards à 100 % annoncés.

Livraison locale : `documentation/10-open-source/livraison-open-source.html`. Le ZIP est un snapshot du travail courant, pas une publication de l'historique local ni une release stable.

## Carnet et notifications — 20 octobre 2026

- [x] Ajouter Mes contacts : persistance par compte, recherche, renommage, conversations existantes ou invitation explicite, retrait confirmé avec annulation.
- [x] Exposer le carnet authentifié en API et dans OpenAPI ; refuser noms/adresses invalides et compte propriétaire, borner à 1000 entrées.
- [x] Clarifier le périmètre : métadonnées serveur, aucune modification implicite de blocage ou autorisation.
- [x] Réduire le doublon Notifications sur PC ; conserver le raccourci quand le mobile masque la liste.
- [x] Badges de non-lus et maintien des contrôles/focus lors des actualisations du centre.
- [x] Inventorier 124 sites de boutons et 99 liaisons ; archiver leurs gestionnaires exacts dans le rapport.
- [x] Tests 258/258, compilation, redémarrage du serveur et diagnostic 4/4.
- [ ] Recette visuelle de la disposition et clics exhaustifs sur appareils : non réalisée, outil navigateur indisponible.

Preuves et limites : [contacts et notifications](../09-audit-ui/2026-10-20-contacts-notifications/contacts-notifications.html).

## Audit UI — état après corrections du 20 octobre 2026

- [x] Inventorier l'interface actuelle : 111 sites de boutons dynamiques, 54 champs dynamiques, 97 liaisons et 61 éléments HTML de contrôle/navigation.
- [x] UI-01/02 : lien d'évitement et focus dirigés vers le panneau affiché, aller/retour mobile.
- [x] UI-03/04 : focus restauré par identité de conversation et focalisation du titre après remplacement de modale.
- [x] UI-05/06 : feedback dans la modale active ; erreurs communes persistantes jusqu'à une nouvelle action ou fermeture.
- [x] UI-07 : historique sorti de la région aria-live ; annonce courte uniquement lors d'une actualisation effective de référence.
- [x] UI-08/09 : ne plus affirmer un chiffrement non confirmé ; distinguer attente de déchiffrement et échec.
- [x] UI-10 : lisibilité mobile, focus contrasté sur rail sombre et contrôles en mode couleurs forcées.
- [x] Tests : 253 Node réussis ; compilation web et inventaire sans erreur de syntaxe.
- [ ] Recette visuelle, clavier réel, lecteurs d'écran, tailles/zoom et appareils : outil navigateur bloqué à l'initialisation, chemin de runtime introuvable (OS 3).

Rapport et preuves : [audit UI](../09-audit-ui/2026-10-20/audit-ui.html). Aucune conformité visuelle ou disponibilité complète en production n'est déduite des tests de code.

## Intégrations agents — 20 octobre 2026

- [x] Examiner les quatre dépôts demandés et conserver leurs révisions exactes.
- [x] CLI JSON : réutiliser les schémas MCP et le connecteur natif ; test Matrix réel réussi.
- [x] Corpus de code borné séparé des données privées, avec tests d'exclusion.
- [x] XERJ local authentifié : indexation réelle, recherche MCP via passerelle sans outils de feedback/écriture.
- [x] Graphify local sans modèle externe : 645 nœuds, 1578 relations, requête MCP réelle réussie.
- [x] Générateur de profils MCP et DeepSeek Cordis sans secret ; guide agent SKILL.md.
- [x] Vérification : 247 tests Node, 2 intégrations MCP de contexte, 1 intégration CLI/Matrix ; compilation web réussie.
- [ ] Qualifier le runtime DeepSeek lui-même et son modèle choisi ; configuration fournie ne vaut pas exécution réussie.
- [ ] Étendre les contrats agents aux fonctions absentes du registre (salons, fichiers, récupération et opérations opérateur) avec permissions et tests dédiés.
- [ ] Qualifier les distributions OS, la charge et l'exploitation distante ; pas de déclaration « 100 % ».

Référence de maintenance : [guide d'intégration](../../agent/INTEGRATIONS.md).

## Correctifs Ponytail — état après correction

- [x] MP-B01 : distinguer refus de confirmation (403) et expiration de session (401), sans affaiblir le verrouillage sur jeton expiré.
- [x] MP-B02 : vérifier créateur, auteur du marqueur, chiffrement Megolm et correspondance unique ; conserver le marqueur en cas d'incertitude.
- [x] MP-B03 : lecture autorisée directe de l'approbation par ID, priorité aux demandes actives et contexte de canal indépendant de la page de tâches.
- [x] PT-04 : confirmations indiquant nom et identifiant de la clé, session ou invitation.
- [x] PT-05 : suppression de sendDraft et de son test sans appel de production ; chemin prepared-message conservé.
- [x] Vérification après corrections : **241/241 tests Node**, compilation web réussie. Journaux dans le dossier de revue Ponytail.
- [ ] Recette visuelle/clavier/appareils, charge et qualification de production ; Rust et intégrations natives non relancés pour ce lot JavaScript.

Les sections de revue ci-dessous conservent l'état avant correction. Le [journal des correctifs](../07-audit-qa/2026-10-20-ponytail/correctifs.md) décrit le résultat actuel et les limites restantes.

## Passe Ponytail — 20 octobre 2026

- [x] Installer et lire Ponytail et Ponytail Audit à la révision `09c434ab73ca43761c5d8b0c5d341926c2fba710`.
- [x] Cartographier les chemins critiques web, serveur, données, Matrix, natif, MCP/A2A et exploitation ; expliciter la charge supposée et les limites.
- [x] Relancer les tests Node (239 réussis), compiler le web et reproduire les trois bugs MP-B01 à MP-B03.
- [x] Livrer le [rapport Ponytail](../07-audit-qa/2026-10-20-ponytail/revue-ponytail.html), cinq constats, preuves et corrections minimales.
- [ ] Corriger les trois bugs ; préciser les cibles des confirmations ; supprimer le helper sendDraft inutilisé en production avec son test dédié.
- [ ] Qualifier les appareils, la charge, la restauration et les fonctions toujours absentes. Rust et intégrations natives non relancés dans cette passe.

L'audit Ponytail ne modifie aucun code applicatif. Les recommandations de simplicité ne retirent aucune exigence du projet.

## Revue Matt Pocock — 20 octobre 2026, état le plus récent

Cette section prime sur les résultats historiques ci-dessous. Rapport : [revue complète](../07-audit-qa/2026-10-20-mattpocock/revue-application.html). Aucune correction applicative pendant cette revue.

| Travail | Progression | Preuve / suite |
|---|---|---|
| Installer et lire les skills sélectionnés | Terminé | Six skills épinglés à `5beb35b040e3de97e54fa9e386d7e42d15c295c2` ; provenance archivée |
| Inventorier le code et revoir Standards / Spec séparément | Terminé | 231 fichiers inventoriés ; 42 exigences examinées, code identifié ne signifie pas qualification complète |
| Exécuter les contrôles actuels | Terminé avec limite | 239 tests Node et 2 intégrations MCP/A2A réussis ; relance Rust bloquée 4551 |
| MP-B01 — distinguer refus de confirmation et expiration de session (Q03) | À corriger | Session serveur valide après mauvais mot de passe, client verrouillé ; reproduction rouge archivée |
| MP-B02 — vérifier provenance et unicité de la conversation récupérée (Q05) | À corriger | Marqueur mutable accepté dans une conversation étrangère non chiffrée ; connaissance du marqueur et droits d'écriture requis |
| MP-B03 — retrouver une approbation active indépendamment des 100 dernières | À corriger | Ancienne demande valide renvoyée 403 par HTTP ; lookup autorisé direct fonctionnel ; corriger également le contexte parent paginé |
| Qualifier les confirmations destructives et réduire leur duplication | À planifier | Deux constats Standards distincts des constats Spec ; préciser cible et effet |
| Étudier les quatre candidats d'architecture | Livré pour décision | [Rapport illustré](../07-audit-qa/2026-10-20-mattpocock/architecture-review.html) ; priorité proposée aux cycles de vie des vues privées |
| Finaliser et qualifier l'ensemble du produit | Non terminé | Cloud, routage automatique, SLIM/MLS, routines et qualification appareils restent notamment ouverts |

Les 156 fichiers applicatifs suivis par empreinte sont inchangés pendant la revue. Aucun pourcentage global de finition n'est déduit des tests réussis. Les résultats Rust antérieurs ne remplacent pas la relance bloquée.

Mis à jour : **19 octobre 2026**. Source unique de progression. Ce fichier distingue la conception et les preuves de fonctionnement ; aucun pourcentage global de finition n’est estimé.

## Lot actuel : conception UI/UX complète

| ID | Travail | Statut | Livrable / preuve | Prochaine condition |
|---|---|---|---|---|
| UX-01 | Relire le cahier des charges, le code et les limites réelles | Terminé | Cahier F01–F42, modules web et README examinés | Conserver le lien avec la matrice |
| UX-02 | Analyser utilisateurs, objectifs, contextes, frustrations et hypothèses | Livré | `../06-conception-ux/01-analyse-utilisateurs.html` | Retour utilisateur sur les hypothèses |
| UX-03 | Inventorier les écrans et définir navigation et parcours d’erreur | Livré, soumis à validation | `../06-conception-ux/02-architecture-parcours.html` ; 120 contextes, 26 parcours | **Attendre le « ok » demandé avant l’étape 3** |
| UX-04 | Concevoir le design system, mesurer les contrastes WCAG AA | Non commencé, dépend de UX-03 | Aucun design system déclaré livré | Validation de l’architecture |
| UX-05 | Décrire chaque écran entièrement, ses textes, composants et états | Non commencé | Utiliser les ID de l’inventaire JSON, sans les renuméroter | UX-04 ; terminer chaque écran avant de poursuivre |
| UX-06 | Définir les micro-interactions, animations et retours | Non commencé | Contrat à associer aux composants et aux écrans | UX-05 et réduction des mouvements |
| UX-07 | Remplir la checklist finale de conception | Non commencé | Une preuve ou une référence pour chaque exigence | UX-04 à UX-06 |
| UX-08 | Mettre à jour les livrables, le registre et le README | Livré pour les étapes 1–2 | Générateur documentaire et guide de maintenance | Actualiser à chaque lot |
| DEV-UX | Mettre le client en conformité avec la conception approuvée | Réalisation partielle antérieure | Navigation humaine déjà remaniée au commit `4b98175` ; elle ne vaut pas validation de la nouvelle architecture cible | Spécification approuvée, puis code et tests par lot |
| QA-UX | Recette visuelle, clavier et appareils physiques | Non qualifié complètement | Tests structurels et comportementaux existants ; pas de certification visuelle | Environnement de test visuel autorisé et matrice d’appareils |

## Dernières preuves de développement observées

- Client : **219 tests Node réussis**, compilation web réussie, diagnostic **4/4**, lot de code `4b98175` du 19 octobre 2026.
- Les documents des étapes 1–2 ne modifient pas le runtime et ne constituent pas une nouvelle exécution de ces tests.
- Rust, MCP et A2A : preuves antérieures détaillées dans le rapport de recette. Le relais A2A reste limité.
- L’application complète n’est **pas déclarée prête pour la production**.

## Backlog de réalisation et qualification

| Travail | État réel | Critère pour le déclarer terminé |
|---|---|---|
| Authentification, messagerie, invitations, blocage et règles de réception | Implémentés avec tests ; recette physique partielle | Tests du parcours réel et accessibilité sur la matrice cible |
| Identité locale, sauvegarde et restauration Matrix | Implémentées ; preuves d’intégration existantes | Compléter la recette utilisateur et vérifier la récupération sans confusion de secrets |
| Tâches, délégations, approbations et suivi en direct | Implémentés dans le périmètre décrit | Recette des droits, erreurs et interruptions sur les écrans approuvés |
| Modèles d’équipes | Liste d’agents sur la même installation | Garder cette portée tant qu’aucune migration inter-installations n’est implémentée |
| Mémoire et procédures d’agent | Fonctions natives ; écrans web distincts absents | Contrôle d’accès privé, écrans, tests de versions et de non-divulgation |
| Sauvegardes iCloud, Google Drive et WebDAV | Connecteurs absents | Choix volontaire, stockage chiffré, restauration inter-appareils et gestion du retrait du fournisseur |
| Routines et déclencheurs externes | Absents | Activation explicite, droits, idempotence, reprises bornées, audit et annulation |
| Routage automatique | Absent | Choix explicable, coûts et délais visibles, alternative manuelle et tests d’échec |
| Isolation d’exécution | Absente | Sandbox qualifiée, quotas, permissions d’outils et de fichiers imposées côté exécution |
| API/MCP, A2A, SLIM/MLS | API/MCP présents ; A2A limité ; SLIM/MLS non implémentés | Contrats exacts, compatibilité démontrée et absence de promesse de protocole fictif |
| WalletConnect et matériels | Dépendance à un Project ID réel ; matériels non entièrement qualifiés | Configuration opérateur et essais wallet/clé physique réellement exécutés |
| Internet, intranet et distribution native | Profils existants ; qualification de production incomplète | TLS et exploitation validés, tests isolés, build optimisé autorisé et plan de mise à jour |

## Règles de mise à jour et de communication

1. Au début d’un lot : annoncer son objectif et son état.
2. Pendant le travail : signaler une décision, un résultat ou un blocage utile ; ne pas annoncer un état inchangé comme un avancement.
3. À la fin du lot : indiquer les fichiers livrés, les commandes réellement exécutées, leurs résultats, les limites et la prochaine condition.
4. Mettre ce fichier à jour dans le même lot que les documents ou le code concernés.
5. Utiliser les statuts **conçu**, **codé**, **testé**, **validé visuellement** séparément. Une ligne livrée n’est pas forcément approuvée.
6. Ne jamais attribuer un résultat passé à une nouvelle exécution ; dater et rattacher les preuves au périmètre.
7. L’accord explicite pour poursuivre l’architecture et le plan de correction a été donné le 20 octobre 2026 (« j’autorise tout »). Conserver la séparation entre autorisé, livré et vérifié.

## Références

- `../06-conception-ux/inventaire-ecrans.json` : identifiants, destinations, exigences et correspondances de code.
- `matrice-exigences-preuves.html` : état réel des fonctions.
- `../04-livrables/rapport-recette.html` : preuves et limites.
- `../../README.md` : démarrage, maintenance et commandes documentaires.

## Journal du lot documentaire du 19 octobre 2026

- Étapes 1–2 rédigées : 7 profils, 120 contextes et 26 parcours avec erreurs.
- Revue indépendante réalisée ; corrections : session révoquée vers connexion, retours aux rubriques de réglages, retour contextuel lié à la session et F42 ajouté explicitement au cahier des charges.
- Contrôles exécutés : générateur Node ; structure et autonomie de 5 HTML ; unicité des ID ; destinations ; liens ; couverture F01–F42 ; `git diff --check`.
- Résultat : contrôles documentaires réussis. Le code applicatif n’a pas changé et aucun test runtime nouveau n’est revendiqué.
- Prochaine condition : accord explicite de l’utilisateur à l’architecture avant l’étape 3. Aucune étape de conception ultérieure déclarée terminée.

## Corrections autorisées — 20 octobre 2026

Le plan Q01–Q19 est autorisé. Le rapport du 19 octobre reste un instantané ; aucune conformité globale ni mise en production n’est déclarée.

- [x] Q02 — invalider l’aperçu de contact après changement de saisie et ignorer les recherches arrivant en retard ; tests ciblés réussis.
- [x] Q03 — verrouiller la session sur un 401 authentifié courant ; ne pas révoquer sur panne réseau, 503 ou réponse d’une génération précédente ; tests ciblés réussis.
- [x] Q19 — corriger le contraste du placeholder et son opacité ; mesure automatisée réussie.
- [x] Q05 — coder le suivi persistant des créations incertaines, la corrélation serveur et la vérification après reprise ; tests de stockage, concurrence et reprise ajoutés.
- [x] Q04 — ajouter les confirmations aux refus d’invitation, retraits de clés, révocations, désactivations de protection et annulations de tâches.
- [ ] Q04 — terminer la protection des saisies abandonnées et la recette visuelle de toutes les confirmations.
- [x] Q08 — coder le changement de code sans supprimer l’ancienne sauvegarde et la suppression explicite de la version actuelle ; tests unitaires réussis.
- [ ] Q08 — terminer la recette réelle sur trois appareils : dernière exécution refusée à la connexion du deuxième appareil (HTTP 429). Aucun succès complet revendiqué ; protections de débit conservées.
- [x] Q16 — pagination serveur et interface des tâches ; test de 205 contrats réussi et contrat OpenAPI de pagination ajouté.
- [ ] Q16 — compléter les schémas de toutes les autres réponses API.
- [x] Q01 — reconstruire dans un répertoire isolé : 15 tests natifs réussis ; aucun cache ni donnée utilisateur supprimé.
- [x] Q01 — qualifier le runtime debug pour les deux parcours réels locaux MCP et A2A : 2/2 réussis avec le dernier binaire après un refus Windows initial ; aucune protection désactivée.
- [ ] Q01 — qualifier séparément le build optimisé, la signature/distribution et les autres systèmes d’exploitation ; les succès debug ne valent pas une qualification de production.
- [x] Environnement — réparer réversiblement les dossiers de sockets Docker ; services PostgreSQL/Synapse rétablis, diagnostic 4/4 positif.
- [x] Q06 — livrer le design system : `../06-conception-ux/03-design-system.html`, 22 composants et contrats de comportement ; document conçu, pas une recette visuelle de l’application.
- [ ] Q06 — livrer les écrans détaillés et aligner leur implémentation.
- [ ] Q07, Q09–Q15, Q17–Q18 — poursuivre les intégrations, fonctions manquantes et qualifications selon le plan ; aucune clôture sans preuve.
- [ ] Recette complète finale, mise à jour de la matrice et nouveau verdict.

Sources, risques et résultats détaillés : `../07-audit-qa/2026-10-20/README.md`. Statut visuel de ce lot : **non vérifié**.
