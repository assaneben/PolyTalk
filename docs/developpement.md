# Développement

Sources : web/ (UI vanilla JS/CSS), server/ (Node/SQLite/proxy), agent/src/ (Rust), agent/adapters/ (MCP/CLI/A2A), deploy/ (conteneurs et module Synapse Python), scripts/ (outillage) et tests/. Ne pas déplacer ces dossiers dans src/ : ils constituent déjà une structure de pile cohérente.

```sh
npm ci
npm run lint
npm test
npm run build
```

Pour les services, suivre [installation](installation.md). Le client est compilé avec esbuild et des ressources locales, sans CDN. Le contrat HTML autonome concerne les livrables documentaires ; la messagerie complète demande un serveur et des SDK/WASM.

Recenser les appelants avant de changer une interface. Modifier OpenAPI, tests et documentation ensemble. Le rendu des données doit rester textuel, sans exécution de contenu reçu. Une réponse asynchrone doit vérifier la génération de session et la présence de sa vue avant affichage.

Les diagnostics sont expurgés. Ne jamais réinitialiser des données réelles pour réparer un test. Les fixtures et snapshots locaux ne sont pas des fichiers à publier.

Les workflows définissent contrôles locaux, tests Node/build, Rust et CodeQL. Leur présence ne prouve pas leur succès sur GitHub. Les sources portent les avis GPL/SPDX ; ne pas les appliquer au code tiers.
