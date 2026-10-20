# PolyTalk

![Logo PolyTalk](web/assets/polytalk-logo.png)

![Licence](https://img.shields.io/badge/license-GPL--3.0--or--later-blue) ![Version](https://img.shields.io/badge/version-0.1.0--development-orange) [![CI](https://github.com/assaneben/PolyTalk/actions/workflows/ci.yml/badge.svg)](https://github.com/assaneben/PolyTalk/actions/workflows/ci.yml) ![Contributions](https://img.shields.io/badge/contributions-welcome-brightgreen)

**Communication chiffrée et coordination entre humains et agents indépendants.** Matrix transporte les échanges ; PolyTalk contrôle les droits et suit les tâches ; les agents exécutent le travail dans leurs propres environnements.

[English](README.en.md) · [Installation](docs/installation.md) · [Utilisation](docs/utilisation.md) · [Architecture](docs/architecture.md) · [API](docs/api.md) · [Contribution](CONTRIBUTING.md)

## État réel et démo

Version **0.1.0 en développement**, pas de déclaration de disponibilité en production. La CI est définie dans `.github/workflows/ci.yml` ; aucun badge vert n'est affiché tant qu'une exécution distante n'est pas vérifiée. La démo est locale : après installation, ouvrir http://localhost:3210. Aucune capture contenant des comptes réels n'est publiée.

## Fonctions

- Messagerie Matrix chiffrée, conversations et invitations explicites.
- Carnet personnel persistant, partage d'adresse/QR, recherche et règles de blocage/autorisation.
- Connexion classique ; options passkeys, wallets, 2FA et sauvegardes selon configuration et capacités de l'appareil.
- Contrats de tâches, délégations bornées, approbations, versions et événements.
- Connecteur Rust avec persistance crypto, MCP stdio, CLI JSON et relais A2A local limité.
- Contexte de sources Graphify/XERJ et profil DeepSeek à qualifier.

Cloud automatique, routines, routage automatique, SLIM/MLS et qualification complète des appareils ne sont pas livrés. Voir [roadmap](docs/roadmap.md).

## Stack et installation

JavaScript ESM, Node **24.13.0**, npm **11.6.2**, UI vanilla JS/CSS et esbuild, SQLite, Matrix SDK/WASM, Synapse/PostgreSQL. Rust **1.99.1** pour le connecteur. Les dépendances sont verrouillées et les images fixées par digest.

```sh
npm ci
npm run setup
docker compose --env-file .env -f deploy/compose.yaml up -d
npm run build
npm start
```

Ne pas écraser une configuration existante. Setup génère les secrets et conserve les clés présentes. [Installation par OS](docs/installation.md), [variables](docs/configuration.md), [déploiement](docs/deploiement.md).

## Vérification et reproduction

```sh
npm run lint
npm test
npm run build
npm run doctor
```

Doctor exige des services démarrés. Les intégrations natives exigent Rust et leurs fixtures synthétiques ; elles ne simulent pas un succès si un prérequis manque. [Tests et limites](docs/tests.md) · [Reproduction depuis une révision exacte](docs/reproduction.md).

## FAQ

**Email ou téléphone obligatoire ?** Non. Le parcours principal utilise identifiant/mot de passe. Le code d'inscription dépend de la politique du serveur.

**Toutes les données sont-elles chiffrées de bout en bout ?** Non : les échanges utilisent les clés des participants, mais certaines métadonnées et le carnet sont côté serveur. Un agent peut transmettre un message à son modèle.

**Internet est-il obligatoire ?** Le bootstrap télécharge des dépendances. L'intranet isolé se prépare avec un paquet hors ligne ; le serveur reste nécessaire pour échanger.

**Tous les OS et wallets sont-ils certifiés ?** Non. Le web est adaptatif mais sa recette physique/visuelle reste à compléter. WalletConnect exige un Project ID réel de l'opérateur.

**Les agents démarrent-ils automatiquement ?** Pas arbitrairement. Il faut un moteur connecté et autorisé. Recevoir un message ou une tâche n'accorde pas de droit d'exécution.

## Licence et communauté

Les sources propres au projet sont sous **GPL-3.0-or-later** : utilisation, étude, modification et redistribution sont autorisées sous ses conditions. Lors de la transmission de copies couvertes, conserver les avis et fournir le code source correspondant selon les obligations de copyleft applicables. La simple utilisation privée n'impose pas de publier vos changements ; la GPL n'ajoute pas à elle seule l'obligation réseau de l'AGPL. [LICENSE](LICENSE) fait foi ; ce texte n'est qu'un résumé. Les dépendances et visuels tiers conservent leurs droits : [avis tiers](THIRD_PARTY_NOTICES.md).

[Contribuer](CONTRIBUTING.md) · [Code de conduite](CODE_OF_CONDUCT.md) · [Sécurité](SECURITY.md) · [Support](SUPPORT.md) · [Confidentialité](docs/confidentialite.md) · [Changelog](CHANGELOG.md) · [Publication GitHub](docs/publication-github.md).

Auteur collectif déclaré : PolyTalk contributors. Contact public : issues/Discussions du dépôt ; aucun email personnel non confirmé n'est inventé. Le signalement privé des vulnérabilités est activé sur GitHub.

Merci aux projets Matrix/Element, Node.js, Rust, PostgreSQL et aux bibliothèques des avis tiers. Les rapports historiques sont des photographies datées, pas une certification de la version courante.


## Distribution hors ligne — instructions exportables

Sur la machine cible, avec Node 24 et Docker Linux compatibles avec l’architecture indiquée dans le manifeste :

```powershell
node scripts/verify-offline.mjs
docker image load --input images.tar
node scripts/setup.mjs --container --origin https://messagerie.exemple.internal --server-name messagerie.exemple.internal
```

Adapter ces deux noms à votre installation avant la commande. Renseigner ensuite l’origine HTTPS, le nom Matrix permanent et les opérateurs dans le nouveau `.env`, puis relancer `node scripts/setup.mjs --container` afin de régénérer la configuration correspondante. Démarrer sans construction ni téléchargement :

```powershell
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.intranet.yaml -f deploy/compose.images.yaml config --quiet
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.intranet.yaml -f deploy/compose.images.yaml up -d --no-build --pull never
```

L’inscription est ouverte par défaut, sans code. Pour une installation privée, l’administrateur peut choisir `node scripts/setup.mjs --container --signup-mode invitation` ; `--signup-mode open` retire cette restriction. Le code n’est alors demandé que lorsque le mode sur invitation est activé.

Les images exportées sont propres à la plateforme préparée. Un paquet Linux amd64 ne qualifie pas automatiquement Linux arm64. Le connecteur natif peut être compilé séparément pour chaque OS ; aucun binaire universel n’est annoncé.

Par défaut, les quotas sont attribués au pair réseau direct. Derrière un reverse proxy, configurer `TRUSTED_PROXY_PEERS` avec ses adresses IP exactes, séparées par des virgules. Le proxy doit supprimer l’en-tête reçu du client et produire un unique `X-Forwarded-For` contenant son adresse réelle ; les chaînes de plusieurs adresses sont refusées. Aucun en-tête fourni par un pair non déclaré n’est accepté pour cette attribution. Ne pas placer de réseau entier ni une adresse cliente dans cette liste.


<!-- offline-install:end -->


[Dossier de passation développeur](docs/passation/README.md) — état réel, carte du code, travaux restants, maintenance et preuves expurgées.
