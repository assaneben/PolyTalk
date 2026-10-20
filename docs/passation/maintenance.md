# Maintenance et exploitation

## Données et secrets à préserver

| Élément | Rôle et règle |
|---|---|
| `.env` | Secrets et configuration opérateur ; hors Git, accès restreint |
| `DATA_DIR` / SQLite | Profils, politiques, carnet et coordination ; inclure les données cohérentes et journaux WAL si copie à froid |
| Volumes PostgreSQL/Synapse | Comptes et données Matrix ; sauvegarde cohérente avec les outils de la base |
| Configuration et clés Synapse | Identité du serveur ; ne pas régénérer arbitrairement |
| Magasins crypto et clés clients | Nécessaires au déchiffrement ; un dump serveur ne les remplace pas |
| `.local/` agents et fixtures | Mélange possible de magasins privés et données QA ; ne pas publier ni transférer sans tri |

Les schémas sont initialisés dans les modules serveur (notamment store, coordination, security, passkeys et wallet). Il n'existe pas ici de procédure universelle de migration/retour arrière certifiée pour toute évolution de schéma. Avant un changement, identifier les SQL concernés et tester une copie isolée.

## Mise à jour d'une installation existante

1. Noter la révision, les digests d'images, la configuration expurgée et les versions d'outils.
2. Planifier l'interruption ; produire une sauvegarde cohérente des bases, secrets et clés. Une copie SQLite pendant écriture sans mécanisme de snapshot n'est pas une preuve de sauvegarde.
3. Restaurer cette copie dans un environnement isolé ; interdire l'envoi de messages réels et toute fédération indésirable durant l'essai.
4. Installer la nouvelle révision et ses dépendances verrouillées, construire et exécuter les tests appropriés.
5. Contrôler connexion, reprise après actualisation, invitations, envoi/réception, déchiffrement, contacts et droits, tâches et approbations.
6. En cas d'échec, arrêter les écritures et appliquer le plan validé sur la copie. Ne pas lancer une ancienne version sur un nouveau schéma sans vérifier sa compatibilité ; restaurer les données cohérentes si nécessaire.

Cette procédure est un cadre de recette : les commandes de dump, rétention, stockage chiffré et calendrier doivent être définis par l'opérateur selon ses volumes. Elles n'ont pas été qualifiées de bout en bout dans ce lot.

## Diagnostic sans destruction

- API indisponible : `npm run doctor`, état du service et origine/port ; inspecter les logs expurgés.
- Matrix indisponible : `docker compose --env-file .env -f deploy/compose.yaml ps` et diagnostic du moteur. Ne pas supprimer les volumes.
- Déconnexion après rechargement : vérifier reprise de session, origine, stockage navigateur et 401 courant ; ne jamais demander à publier un jeton.
- Message non déchiffré : vérifier appareil, clés et sauvegarde ; ne pas supprimer le magasin crypto pour « réparer ».
- Création incertaine : utiliser la recherche de création précédente ; la corrélation est une métadonnée, pas une garantie globale entre navigateurs.
- Sauvegarde : la rotation conserve les versions antérieures ; leur code reste lié à leur version. Supprimer une sauvegarde ne détruit pas les clés déjà présentes sur un appareil. Les suppressions globales sont bornées et peuvent demander une reprise.
- 429 : attendre la durée indiquée et diagnostiquer les appels ; préserver les limites de sécurité.
- Binaire Windows refusé : faire examiner App Control par l'administrateur. Aucun contournement ou certificat auto-signé recommandé.
- Défaut de socket Docker Windows : un rétablissement local historique existe, sans réparation générale prouvée. Consulter les diagnostics officiels et sauvegarder avant intervention ; aucun chemin privé ni manipulation automatique n'est transmis ici.

## Sécurité et intranet

HTTPS, origine exacte, proxy explicitement déclaré, bases internes et privilèges minimaux sont requis hors développement local. Ne jamais changer le nom Matrix d'une installation existante sans migration préparée. Voir les guides déploiement/configuration.

Un paquet hors ligne doit être préparé puis vérifié pour son OS/architecture. Il n'est pas automatiquement signé ; son export ne qualifie ni tous les appareils ni la restauration.

En incident : limiter les accès concernés, préserver les preuves expurgées, révoquer les sessions/identifiants compromis selon le périmètre et utiliser le signalement privé décrit dans SECURITY.md. Ne pas publier les conversations pour diagnostiquer un défaut.
