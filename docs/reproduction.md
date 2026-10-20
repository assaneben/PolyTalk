# Reproduire depuis zéro

La source de vérité est une révision Git avec ses lockfiles, pas un collage manuel d'extraits.

1. Installer Git, Node **24.13.0** et npm **11.6.2**. Vérifier `node --version` et `npm --version`.
2. Cloner l'URL réelle du dépôt, extraire son commit/tag audité avec `git checkout`, puis vérifier `git rev-parse HEAD`. Les commandes de création du dépôt sont dans [publication](publication-github.md).
3. Conserver package-lock.json et agent/Cargo.lock. Comparer les empreintes au manifeste d'export fourni pour cette version, lorsqu'il existe.
4. Exécuter `npm ci`, `npm run lint`, `npm test`, `npm run build`. À chaque échec, arrêter et lire le diagnostic ; ne pas supprimer les lockfiles pour le masquer.
5. Installer les outils C/C++ et CMake, puis `rustup toolchain install 1.99.1 --profile minimal` et `cargo +1.99.1 test --manifest-path agent/Cargo.toml --locked`.
6. Installer un moteur Docker Linux avec Compose v2. Exécuter `npm run setup`, puis la commande Compose de [installation](installation.md).
7. Démarrer `npm start`, ouvrir http://localhost:3210 et exécuter `npm run doctor`. Créer uniquement des comptes synthétiques pour vérifier invitation, messages et verrouillage.
8. Préparer les fixtures natives, puis les intégrations de [tests](tests.md). Les composants de contexte sont facultatifs.

## Ordre des fichiers

Métadonnées et lockfiles d'abord ; web/, server/, scripts/, deploy/ et agent/ ensuite ; tests, exemples, docs et workflows complètent le contrat. L'arborescence complète et les fichiers intégraux sont exportables par le script de publication. Extraire les sources complètes du dépôt : ce guide ne prétend pas les régénérer à partir d'une description.

## Limites exactes

Les dépendances applicatives et images sont verrouillées. OS, compilateurs système, architecture, certificats, date et secrets restent des entrées externes. Setup génère volontairement des secrets neufs : une autre installation ne doit pas avoir les mêmes clés. L'équivalence binaire bit à bit entre tous les OS n'est pas revendiquée. Le bootstrap nécessite les registres ; le paquet hors ligne se prépare séparément. La reproductibilité des sources n'est pas une qualification de production.
