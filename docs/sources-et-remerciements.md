# Sources et projets ayant contribué à PolyTalk

Relevé du 20 octobre 2026 fondé sur package.json/package-lock.json, agent/Cargo.toml/Cargo.lock, les imports, les configurations de déploiement et les journaux de développement. Cette attribution distingue les dépendances exécutées, les outils locaux, les méthodes et les références de conception. Elle ne revendique aucun partenariat ni certification des projets cités.

## 1. Composants effectivement utilisés

| Projet amont | Apport concret | Preuve dans PolyTalk |
|---|---|---|
| [Matrix JS SDK](https://github.com/matrix-org/matrix-js-sdk) | Client Matrix web et chiffrement côté client | matrix-js-sdk 44.0.0, web/matrix-client.js |
| [Matrix Rust SDK](https://github.com/matrix-org/matrix-rust-sdk) | Client agent et persistance crypto | matrix-sdk 0.19.1, agent/Cargo.toml et agent/src/ |
| [Synapse](https://github.com/element-hq/synapse) | Serveur Matrix auto-hébergé | deploy/compose.yaml, deploy/synapse/polytalk_policy.py |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | Serveurs/adaptateurs MCP et appels d'outils | @modelcontextprotocol/sdk 1.32.1, agent/adapters/ |
| [SimpleWebAuthn](https://github.com/MasterKale/SimpleWebAuthn) | Passkeys/WebAuthn | browser 14.0.0 et server 14.0.3, server/passkeys.mjs, web/passkey-ui.js |
| [WalletConnect](https://github.com/WalletConnect/walletconnect-monorepo) / Reown | Connexion wallet par session WalletConnect | sign-client 2.26.0, web/walletconnect.js ; Project ID opérateur nécessaire |
| [ethers](https://github.com/ethers-io/ethers.js) | Adresses Ethereum et preuves wallet | 6.17.0, server/wallet.mjs et client wallet |
| [node-qrcode](https://github.com/soldair/node-qrcode) | Génération des QR codes de partage | qrcode 1.5.4, web/contact-qr.js |
| [jsQR](https://github.com/cozmo/jsQR) | Décodage des QR codes | jsqr 1.4.0, web/contact-qr.js |
| [Zod](https://github.com/colinhacks/zod) | Schémas et validation d'entrées des outils | 4.6.7, adaptateurs agents |
| [esbuild](https://github.com/evanw/esbuild) | Construction des ressources web | 0.25.12, scripts/build.mjs |
| [Node.js](https://github.com/nodejs/node) | Serveur, tests et module node:sqlite | .nvmrc, server/, scripts/, tests/ |
| [PostgreSQL](https://github.com/postgres/postgres) | Base du serveur Synapse | deploy/compose.yaml |
| [SQLite](https://sqlite.org/) | Stockage applicatif et magasins locaux | server/store.mjs, rusqlite et Matrix Rust SDK |
| [Rust](https://github.com/rust-lang/rust) | Connecteur natif agent | agent/rust-toolchain.toml, agent/src/ |
| [Tokio](https://github.com/tokio-rs/tokio) | Exécution asynchrone du connecteur | agent/Cargo.toml |
| [Serde](https://github.com/serde-rs/serde) et [serde_json](https://github.com/serde-rs/json) | Sérialisation des échanges natifs | agent/Cargo.toml et agent/src/protocol.rs |
| [rusqlite](https://github.com/rusqlite/rusqlite) | Accès SQLite natif | agent/Cargo.toml |
| [RustCrypto](https://github.com/RustCrypto) | Crates argon2 et chacha20poly1305 du coffre agent | agent/Cargo.toml ; getrandom et zeroize sont aussi déclarés |
| [reqwest](https://github.com/seanmonstar/reqwest) | Appels HTTP natifs | agent/Cargo.toml |
| [tracing](https://github.com/tokio-rs/tracing) | Instrumentation native | agent/Cargo.toml |

Cette liste met en avant les composants directs. L'ensemble des dépendances transitives est identifié par les fichiers de verrouillage ; l'inventaire npm complémentaire est [licences-npm.json](licences-npm.json). Le rôle d'une dépendance ne constitue pas une preuve de qualification de chaque fonctionnalité sur tous les appareils.

## 2. Outils de contexte et intégrations réellement travaillées

| Dépôt | Contribution attestée | Limite |
|---|---|---|
| [HKUDS/CLI-Anything](https://github.com/HKUDS/CLI-Anything) | Méthode d'analyse du backend et pattern MCP Backend utilisés pour la CLI JSON PolyTalk | Implémentation Node propre au projet ; pas intégration complète ni certification du framework CLI-Anything |
| [xerj-org/xerj](https://github.com/xerj-org/xerj) | Indexation locale du corpus de sources autorisées ; recherche via une passerelle MCP limitée | Outil local optionnel ; pas un composant obligatoire de la messagerie |
| [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) | Graphe du code et consultation MCP, extraction locale sans modèle | Outil local optionnel ; les comptes et messages privés sont exclus du corpus |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | Sources du plugin dsh-mcp-client étudiées et générateur de profil Cordis créé | Aucun runtime DeepSeek ni appel réel au modèle qualifié |

Preuves : [guide agents](../agent/INTEGRATIONS.md), scripts/agent-corpus.mjs, scripts/agent-integrations.mjs, agent/adapters/context-proxy.mjs, tests/context-tools.integration.mjs, tests/agent-cli.integration.mjs. Les essais historiques du 20 octobre ont réussi pour Graphify/XERJ et la CLI/Matrix ; ils ne sont pas réexécutés par cette attribution.

### Révisions des sources examinées

- CLI-Anything : `34f519533bc175d2fe287ab8316b0dd99bb9cc43`.
- XERJ : `fed7415c4257075d2bacd6712acba433ea6c8d37`, binaire local 1.0.0-rc.97.
- Graphify : `86c57be8204673c2a1b9849a3292a7dd3ab373d8`, version locale 0.9.92.
- DeepSeek Harness : `687f282e8625c6b8d11ff58211a90524be2e4317`.

Les révisions consultées ne sont pas nécessairement la version du binaire installé ; elles sont distinguées explicitement.

## 3. Méthodes ayant servi au développement et aux revues

- [obra/superpowers](https://github.com/obra/superpowers) : planification, développement guidé par tests et vérification avant déclaration de réussite. Utilisation documentée dans le plan applicatif du 16 octobre ; les skills restent des outils de développement, sans dépendance d'exécution du produit.
- [mattpocock/skills](https://github.com/mattpocock/skills) : revue du code et des exigences, conception des modules, diagnostic et TDD. La revue du 20 octobre atteste la lecture des instructions de six skills, révision `5beb35b040e3de97e54fa9e386d7e42d15c295c2`. Leur installation ne prouve pas l'achèvement de toutes leurs procédures.
- [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) : approche de correction minimale complète et revue des risques ; un rapport et un journal de correctifs locaux existent, révision PolyTalk auditée `09c434ab73ca43761c5d8b0c5d341926c2fba710` (pas une révision du dépôt Ponytail). Pas un module embarqué.
- SecureByDesign v1.1.0 : consignes de conception/relecture sécurité effectivement lues. La provenance publique de ce skill n'a pas été validée indépendamment dans ce relevé ; aucune certification de sécurité n'en découle.

Les journaux bruts de revue ne sont pas publiés en bloc ; leurs conclusions utiles et limites sont dans [la passation](passation/README.md).

## 4. Références de conception, sans reprise de code attestée

- [milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot) : contrat d'exécution, cycle des tâches, coordination, canaux et événements étudiés. Le livrable public du 17 octobre indique explicitement une comparaison architecturale sans reprise de code.
- [composio-community/open-dot](https://github.com/composio-community/open-dot) : consultation/délégation et priorité des règles never/ask/allow étudiées. Le livrable du 18 octobre indique une inspiration de principes sans reprise de code. Cela ne livre pas automatiquement ses mémoires, skills ou environnements isolés dans PolyTalk.
- [Spécification Matrix](https://spec.matrix.org/) et [spécification MCP](https://modelcontextprotocol.io/specification/) : contrats de protocole associés aux SDK. Les versions effectivement utilisées restent celles des verrous du projet.
- [MDN — PWA installables](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) : référence documentaire pour l'installation web et les différences des navigateurs.

A2A est actuellement un relais local limité. SLIM et MLS ont été envisagés mais ne sont pas implémentés : ils ne sont pas présentés comme des fondations déjà intégrées.

## 5. Automatisation et documents communautaires

GitHub Actions utilise actions/checkout et actions/setup-node ; github/codeql-action apporte l'analyse CodeQL. Leurs révisions sont dans les workflows et [action-pins.json](action-pins.json). Dependabot est configuré pour suivre les dépendances.

Le texte de licence provient de la [GNU GPLv3 officielle](https://www.gnu.org/licenses/gpl-3.0.txt) et le code de conduite du [Contributor Covenant 2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Ce sont des sources documentaires, pas des contributions au moteur de messagerie.

## Attribution et licences

Lire [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Les composants conservent leurs propres licences ; citer un dépôt n'autorise pas à le relicencier. Synapse, les dépendances et les visuels nécessitent leurs propres vérifications de distribution. Cette page n'est ni une liste de contributeurs individuels ni une validation juridique exhaustive.
