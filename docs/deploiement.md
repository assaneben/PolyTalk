# Déploiement

La qualification de production est incomplète. Préserver volumes, secrets et clés lors des mises à jour. Ne jamais supprimer les volumes pour obtenir une installation qui démarre.

Pour une nouvelle installation conteneurisée, choisir des noms DNS maîtrisés et réellement résolus, puis :

```sh
node scripts/setup.mjs --container --origin https://polytalk.example.test --server-name matrix.example.test
docker compose --env-file .env -f deploy/compose.yaml -f deploy/compose.intranet.yaml up -d --build
```

Les domaines example.test sont des exemples réservés à remplacer. Configurer un reverse proxy TLS vers 127.0.0.1:3210 et les pairs de proxy autorisés. Ajouter `-f deploy/compose.internet.yaml` pour le profil Internet. Garder PostgreSQL interne ; ne pas exposer l'ingress de développement Synapse directement.

L'origine HTTPS doit correspondre aux URLs du navigateur, des passkeys et des preuves wallet. Changer le nom Matrix d'une installation existante nécessite une migration.

Sauvegarder .env, SQLite, volumes PostgreSQL/Synapse et clés clients par les fonctions prévues. Tester une restauration isolée. Un dump serveur ne remplace pas les clés des appareils. Conserver l'image précédente et une sauvegarde cohérente pour le retour arrière.

## Intranet isolé

`npm run export:offline` prépare les images locales attendues et les instructions ; `scripts/verify-offline.mjs` vérifie les empreintes. Le paquet n'est pas signé automatiquement. Le bootstrap Internet s'effectue sur un poste autorisé avant transfert. Les connecteurs natifs se préparent séparément par OS/architecture.

Aucun déploiement automatique de données utilisateur par la CI, aucun domaine ni hébergement officiel fourni.
