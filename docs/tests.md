# Tests

| Commande | Portée et prérequis |
|---|---|
| npm run lint | Syntaxe JavaScript et contrôles de métadonnées/licence |
| npm test | Tests Node/HTTP sur données synthétiques |
| npm run build | Ressources web compilées |
| npm run doctor | Configuration, build et disponibilité API/Matrix |
| npm run test:agent | Rust verrouillé, compilateur requis |
| npm run test:matrix | Synapse réel démarré |
| npm run verify:runtime | Rust puis MCP/A2A séquentiels ; fixture native nécessaire |
| npm run test:context:real | Graphify/XERJ installés, graphe et serveur authentifié |

Dernier résultat avant le lot de gouvernance : 258 tests Node, build et diagnostic 4/4. Ces chiffres sont historiques ; lire le rapport du lot courant pour ses nouvelles exécutions. Les anciennes preuves ne sont jamais recyclées comme nouvelles réussites.

Les intégrations créent des comptes et données QA, jamais des comptes de production. Certaines utilisent .local/last-agent-fixture.json produit par les essais natifs ; un clone neuf n'en dispose pas. Son absence doit échouer, pas déclencher un faux succès.

Rust a rencontré App Control 4551 sur Windows. Faire examiner la politique par l'administrateur. Les tests Node ne certifient ni charge, ni tous les OS, wallets, appareils ou lecteurs d'écran. Aucun taux de couverture n'est annoncé sans mesure.

## Préparer la fixture native actuelle sur Windows

Avec Matrix et PolyTalk déjà démarrés, dans un autre terminal PowerShell :

```powershell
npm run build:agent:debug
npm run test:agent:matrix
npm run test:mcp:matrix
npm run test:relay:matrix
```

Le premier test Matrix natif crée des comptes QA puis `.local/last-agent-fixture.json`. Les suivants utilisent ce magasin et la phrase synthétique de la fixture, pas vos comptes. Cette fixture de bootstrap appelle actuellement un chemin `.exe` : ces commandes d'intégration ne sont pas annoncées portables telles quelles sur macOS/Linux. Les tests Rust unitaires et l'application web ont des parcours distincts. Qualifier le bootstrap natif Unix avant de promettre la même recette sur ces OS.
