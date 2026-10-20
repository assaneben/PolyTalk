# Contribuer

Lire [installation](docs/installation.md), [architecture](docs/architecture.md), [tests](docs/tests.md) et le [code de conduite](CODE_OF_CONDUCT.md).

1. Forker le dépôt et cloner votre fork.
2. Exécuter `npm ci` ; conserver les lockfiles sauf changement justifié.
3. Créer une branche : `git switch -c fix/session-expiry`.
4. Reproduire le problème avec un test public observable et des données synthétiques. Chercher tous les appelants avant de modifier le contrat.
5. Exécuter `npm run lint`, `npm test`, `npm run build`, puis les intégrations pertinentes.
6. Actualiser documentation, OpenAPI et changelog si le comportement change.
7. Utiliser Conventional Commits : `fix(auth): preserve session after rejected confirmation`.
8. Pousser la branche et ouvrir une PR décrivant problème, résultat, tests réellement exécutés et risques.

La revue contrôle droits, erreurs, concurrence, confidentialité, persistance et accessibilité. Un message reçu ne donne aucun droit d'exécution. Les contrôles serveur ne doivent jamais dépendre du seul état d'un bouton.

JavaScript reste en ESM, Rust suit rustfmt. Les commentaires expliquent les décisions. Préserver validations et gestion des erreurs ; éviter les nouvelles dépendances sans besoin concret. Les tests physiques non exécutés doivent être signalés.

Les contributions sont proposées sous GPL-3.0-or-later, sans transfert de copyright ni CLA. Conserver les en-têtes SPDX et les avis tiers. Ne pas soumettre .env, clés, jetons, données personnelles, bases, journaux privés ou captures de comptes réels.
