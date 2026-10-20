# Installation

Baseline Node vérifiée : **24.13.0**, npm **11.6.2**. Utiliser `.nvmrc` et `npm ci`. Le connecteur demande Rust **1.99.1**, un compilateur C/C++ et CMake. Docker avec moteur Linux et Compose v2 est nécessaire pour Matrix ; les images sont verrouillées par digest.

## Windows

Installer Git, Node, Docker Desktop avec moteur Linux/WSL2 selon votre machine. Pour Rust : rustup, outils Visual Studio C++ et CMake. Utiliser PowerShell dans le clone. App Control peut bloquer les binaires ; faire examiner la règle par l'administrateur, sans contourner la protection.

## macOS

Installer Git, Node 24.13.0, Docker avec Compose v2 et outils de compilation Xcode. Rustup fournit la toolchain du dépôt. Choisir des images et binaires adaptés à Intel ou Apple Silicon. Recette physique macOS non qualifiée.

## Linux

Installer Git, Node 24.13.0, Docker Engine/Compose v2. Pour Rust : rustup, compilateur C/C++, CMake et pkg-config. L'accès au socket Docker confère des privilèges importants. Les paquets système dépendent de la distribution ; aucun build bit à bit identique entre OS n'est promis.

## Première exécution

Depuis le clone :

```sh
npm ci
npm run setup
docker compose --env-file .env -f deploy/compose.yaml up -d
npm run build
npm start
```

Ouvrir http://localhost:3210 ; dans un second terminal, `npm run doctor`. Setup génère les secrets et conserve ceux déjà présents. Ne pas écraser une installation existante avec un exemple. Le bootstrap demande Internet.

Si le port est occupé, identifier le processus plutôt que d'arrêter tous les processus Node. Si Docker ne répond pas, démarrer son moteur avant de relancer Compose. Docker n'a pas pu être requalifié pendant le lot de gouvernance : son moteur était arrêté.
