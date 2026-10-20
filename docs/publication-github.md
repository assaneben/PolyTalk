# Publier sur GitHub

## Préparation et décisions requises

Le dépôt local possède déjà un historique de travail et des fichiers non commités. Ne pas le réinitialiser ni pousser son historique sans revue. Le compte connecté observé est `assaneben`, mais propriétaire, visibilité, contact public et droits des visuels doivent encore être confirmés. Le dépôt distant assaneben/PolyTalk est maintenant créé ; vérifier son état de publication plutôt que de le recréer.

Depuis le projet, créer un export propre :

```powershell
npm run lint
npm test
npm run build
node scripts/export-public.mjs public-export
Set-Location .local/public-export
```

La destination ne doit pas déjà exister. Pour un autre essai, choisir un nouveau nom d'export ; aucune suppression automatique de données n'est effectuée. Le manifeste inclut les fichiers et leurs SHA-256. Le scanner est mécanique : inspecter aussi les données et droits avant de rendre le dépôt public.

## Premier commit dans l'export uniquement

```powershell
git init -b main
git status --short
git add .
git diff --cached --check
git commit -m "chore: prepare PolyTalk open-source development snapshot"
```

Configurer nom/email Git par vos propres réglages avant le commit si Git les demande ; ne pas recopier une identité inventée. L'export contient les sources complètes et lockfiles, sans bases/secret/historique privé.

## Création avec GitHub CLI

Après confirmation du compte et de la visibilité :

```powershell
gh auth status
$repoOwner = Read-Host "Compte ou organisation GitHub confirmé"
$repoName = "$repoOwner/PolyTalk"
gh repo create $repoName --private --source . --remote origin --push --description "Communication chiffree et coordination entre humains et agents independants"
```

Le choix privé est une étape de revue, pas la publication open source finale. Après validation des droits, secrets et responsables, rendre public explicitement :

```powershell
gh repo edit $repoName --visibility public --accept-visibility-change-consequences
```

Ne pas exécuter cette transition avant les validations. Si le dépôt existe déjà, ne pas le recréer :

```powershell
git remote add origin "https://github.com/$repoName.git"
git push -u origin main
```

## Création par l'interface web

GitHub → New repository → choisir le propriétaire confirmé, PolyTalk, description et visibilité privée. Ne pas initialiser de README/licence distant, car ils existent localement. Après création, copier l'URL HTTPS fournie et utiliser les deux commandes de liaison ci-dessus en remplaçant l'URL par celle réellement affichée. Ne pas utiliser force push pour résoudre une divergence inattendue.

## Réglages du dépôt

```powershell
gh repo edit $repoName --enable-discussions --enable-issues --delete-branch-on-merge --enable-squash-merge --enable-rebase-merge=false --enable-merge-commit=false
gh repo edit $repoName --add-topic matrix --add-topic messaging --add-topic mcp --add-topic ai-agents --add-topic gplv3
```

Dans Settings → Rules → Rulesets, créer une règle sur main : pull request obligatoire, au moins une revue, discussions résolues, aucun force push ni suppression de branche. Ajouter les checks CI seulement après avoir observé leurs noms réels sur GitHub. Ne pas configurer une règle CODEOWNERS vide comme s'il y avait des responsables ; inscrire les comptes/équipes confirmés et vérifier leurs droits.

Dans Settings → Code security, activer Dependabot alerts/security updates, secret scanning et push protection lorsque disponibles pour le plan/visibilité. Dans Security, activer private vulnerability reporting. Le workflow CodeQL analyse JS/TS et Python ; il ne promet pas une analyse Rust complète. Les capacités GitHub peuvent dépendre du plan et des permissions.

Renseigner le champ Website uniquement si un site réel maîtrisé existe. Aucun faux site n'est fourni. Les labels de `.github/labels.yml` sont un catalogue : les créer via l'interface ou des commandes `gh label create` après vérification, sans installer une action tierce de synchronisation arbitraire.

## Tags et releases

Le code courant est 0.1.0 en développement. Pour une première publication de développement :

```powershell
git tag -a v0.1.0 -m "PolyTalk 0.1.0 development snapshot"
git push origin v0.1.0
```

Le workflow valide version/tag, attend ses checks et crée une **draft prerelease**, pas une release stable automatique. Les intégrations physiques non exécutées restent dans les notes. En cas d'échec CI, ne pas présenter une release comme vérifiée.

Pour la future première stable **v1.0.0**, terminer la roadmap de qualification, passer ensemble package.json/package-lock.json, agent/Cargo.toml et références d'images PolyTalk à 1.0.0, actualiser CHANGELOG et notes, puis exécuter tous les checks de release. Une fois ce commit revu :

```powershell
git tag -a v1.0.0 -m "PolyTalk 1.0.0"
git push origin v1.0.0
```

Relire et publier manuellement le brouillon créé. Ne pas poser ce tag sur les sources 0.1.0 : le workflow le refusera. Les dépendances/images d'exploitation doivent être qualifiées séparément.

## Documentation en ligne

Les Markdown sont lisibles directement sur GitHub, sans GitHub Pages. Pages n'est donc pas activé par défaut ; cela évite de publier des rapports historiques ou de promettre un site inexistant. Un site autonome se prépare ultérieurement depuis un périmètre documentaire expurgé, avec un workflow Pages et son domaine vérifiés.
