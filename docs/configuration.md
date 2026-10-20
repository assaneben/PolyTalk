# Configuration

`npm run setup` génère `.env` et `.local/synapse/`. `.env.example` documente les variables sans secrets utilisables. Les adaptateurs agents reçoivent leur propre environnement privé et ne chargent pas implicitement celui du serveur.

- HOST/PORT/PUBLIC_ORIGIN : écoute et origine publique ; HTTPS et proxy hors loopback.
- MATRIX_UPSTREAM/MATRIX_SERVER_NAME : amont et nom du homeserver. Changer le nom après création des comptes exige une migration.
- POLICY_SECRET, REGISTRATION_SECRET, POSTGRES_PASSWORD, MATRIX_JWT_SECRET : secrets distincts générés par setup, à conserver et sauvegarder.
- SIGNUP_CODE vide : inscription ouverte ; une valeur active la restriction. Ce code n'est pas une invitation à un salon.
- DATA_DIR : données SQLite ; POLYTALK_EDITION : intranet ou internet.
- TRUSTED_PROXY_PEERS : adresses des seuls proxies autorisés.
- POLYTALK_APPROVERS : adresses Matrix exactes des opérateurs ; les capacités déclarées ne donnent aucun droit opérateur.
- WALLETCONNECT_PROJECT_ID : identifiant fourni par l'opérateur chez Reown ; aucun faux ID n'est inclus.

Variables agents et contexte : voir [guide](../agent/INTEGRATIONS.md). Passkeys, 2FA et sauvegardes disponibles sont facultatives. L'authentification wallet n'envoie aucune transaction financière.
