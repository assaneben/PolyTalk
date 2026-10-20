# Qualification des intégrations agents

Plan : vérifier d'abord la CLI et les profils par des tests publics sans réseau ; vérifier ensuite les serveurs MCP Graphify/XERJ réels contre un corpus de sources autorisées. Enfin, utiliser la fixture native existante pour vérifier la CLI avec Matrix. Aucun compte utilisateur réel, aucune conversation privée et aucun fournisseur de modèle ne doivent être indexés ou invoqués.

Les tests unitaires couvrent découverte, validation MCP, fermeture, erreurs, taille des entrées, confidentialité de login, corpus borné et profils de configuration. Le test `tests/context-tools.integration.mjs` exige les exécutables et graphes explicitement configurés ; leur absence est un échec, pas un succès simulé. Le test DeepSeek hôte n'est pas confondu avec un échange MCP générique : sa configuration seule ne prouve pas l'exécution du modèle.
