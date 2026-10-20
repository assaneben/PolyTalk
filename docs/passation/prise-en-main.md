# Prise en main développeur

## Premier démarrage sur un environnement neuf

Prérequis : Git, Node 24.13.0, npm 11.6.2, Docker Linux et Compose v2. Le connecteur natif exige Rust 1.99.1 et les outils C/C++/CMake adaptés à l'OS.

```sh
git clone https://github.com/assaneben/PolyTalk.git
cd PolyTalk
npm ci
npm run setup
docker compose --env-file .env -f deploy/compose.yaml up -d
npm run build
npm start
```

Dans un autre terminal : `npm run doctor`. Ouvrir http://localhost:3210. Créer uniquement des comptes de test sur cette instance. Les instructions ci-dessus ne sont pas une procédure de migration d'une installation existante. Voir les variantes par OS dans le guide d'installation.

## Carte du code et points d'entrée

| Zone | Sources à lire | Contrôle associé |
|---|---|---|
| Démarrage HTTP et routage | `server/index.mjs`, `server/app.mjs`, `server/proxy.mjs` | `tests/api.test.mjs`, `tests/proxy.test.mjs` |
| Profils, contacts et règles | `server/store.mjs`, `server/matrix-id.mjs` | `tests/store.test.mjs`, `tests/address-book.test.mjs` |
| Orchestration et canaux | `server/coordination.mjs`, `server/channels.mjs` | `tests/coordination.test.mjs`, `tests/channels.test.mjs` |
| Authentification et facteurs | `server/security.mjs`, `server/passkeys.mjs`, `server/wallet.mjs` | suites security, passkeys et wallet |
| Interface et session Matrix | `web/app.js`, `web/matrix-client.js`, `web/session-resume.js` | `tests/session-resume.test.mjs`, `tests/human-interface.test.mjs` |
| Notifications et contacts | `web/notifications-ui.js`, `web/contact-list-ui.js` | `tests/notification-refresh.test.mjs`, `tests/contact-list-ui.test.mjs` |
| Sauvegarde et restauration | `web/automatic-backup.js`, `web/backup-ui.js`, `web/recovery-phrase.js` | `tests/automatic-backup.test.mjs`, intégration backup |
| Connecteur natif | `agent/src/main.rs`, `agent/src/protocol.rs`, `agent/src/inbox.rs` | `agent/tests/` |
| Adaptateurs | `agent/adapters/mcp.mjs`, `cli.mjs`, `a2a.mjs`, `bridge.mjs` | suites adapters, bridge, CLI, A2A |
| Contrat API | `server/openapi.mjs` | `tests/openapi.test.mjs` |
| Livraison | `scripts/setup.mjs`, `build.mjs`, `export-offline.mjs`, `deploy/` | suites setup, build, offline |

Matrix transporte les messages chiffrés ; PolyTalk conserve les profils, droits et contrats ; un runtime d'agent distinct exécute les tâches. Un message reçu ne confère pas de droit d'exécution. Les métadonnées d'orchestration et les contacts ne bénéficient pas tous du chiffrement de bout en bout.

## Vérifier avant toute contribution

```sh
npm run lint
npm test
npm run build
npm run test:agent
```

Avec services lancés : `npm run doctor`, puis `npm run test:matrix`. Pour les fixtures natives Windows : `npm run build:agent:debug`, `npm run test:agent:matrix`, `npm run test:mcp:matrix`, `npm run test:relay:matrix`, dans cet ordre. Ces essais créent des comptes QA et des fichiers privés locaux. Le bootstrap natif utilise actuellement un chemin .exe : ne pas annoncer ce parcours qualifié sur Unix.

Modifier ensemble implémentation, appelants, tests, contrat API et guides. Lire les scripts de package.json pour les autres recettes ; un prérequis absent ne vaut jamais un test réussi.
