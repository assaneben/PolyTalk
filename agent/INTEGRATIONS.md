# Intégrations agents PolyTalk

Les quatre projets demandés sont utilisés à des niveaux distincts. Ils ne remplacent ni Matrix ni les permissions PolyTalk. Aucun service de modèle externe et aucun partage des messages privés n'est activé.

| Projet | Usage réalisé | Preuve / limite |
|---|---|---|
| HKUDS/CLI-Anything | Méthode d'analyse du backend et pattern MCP Backend appliqués à une CLI JSON sur le registre MCP réel | CLI Node native au projet, pas un paquet Python Click certifié CLI-Anything ; tests unitaires et sous-processus Matrix réel réussis |
| xerj-org/xerj | Moteur local authentifié, index de sources et passerelle MCP limitée à xerj_search | Binaire Windows rc.97 vérifié par SHA-256 ; indexation et appel MCP réels réussis |
| Graphify-Labs/graphify | Graphe local de code et passerelle MCP de consultation | Graphify 0.9.92 isolé, backend de modèle désactivé ; extraction et appel MCP réels réussis |
| deepseek-ai/deepseek-harness | Générateur de profil Cordis du plugin officiel dsh-mcp-client | Format vérifié dans les sources épinglées ; runtime DeepSeek et exécution de modèle non qualifiés |

## CLI sans interface graphique

```powershell
npm run agent:cli -- --help
node agent/adapters/cli.mjs tools
'{"room_id":"!votre-salon:serveur","text":"Bonjour"}' | node agent/adapters/cli.mjs call send_message
'{"timeout_ms":30000}' | node agent/adapters/cli.mjs call wait_for_message
'{}' | node agent/adapters/cli.mjs call read_messages
```

Utiliser un salon réellement rejoint et autorisé. Les exemples ne sont pas des données préchargées. La sortie est JSON ; une erreur d'outil provoque une sortie non nulle. Le serveur MCP reste la source des arguments et règles. Ne pas réessayer automatiquement un envoi dont le résultat est incertain.

Le compte agent et le coffre natif doivent avoir été initialisés. L'opérateur fournit `POLYTALK_ORIGIN`, `POLYTALK_AGENT_STORE`, `POLYTALK_AGENT_PASSWORD`, et éventuellement `POLYTALK_AGENT_BINARY` via son environnement privé. Ne pas inscrire ces secrets dans Git ou dans les arguments de commande. La commande `login` accepte uniquement un objet username/password sur stdin et ne restitue jamais le jeton. L'exécution d'un outil reçu ne devient jamais automatique.

## Corpus autorisé

```powershell
node scripts/agent-corpus.mjs
```

Cette commande crée un nouveau snapshot sous `.local/agent-context/sources-*`. Elle copie uniquement les extensions de code autorisées de web/, server/, agent/src/, agent/adapters/ et scripts/. Elle refuse les liens symboliques, les fichiers de plus de 1 Mio et un total de plus de 20 Mio. Les clés, bases, conversations, .env, journaux, exports privés et dépendances ne sont pas parcourus. Les sources autorisées peuvent elles-mêmes contenir des secrets ajoutés par erreur : ne jamais y écrire de secret. Le snapshot n'est pas automatiquement actualisé après une modification du code.

Graphify est installé dans `.local/graphify-env`, XERJ dans `.local/xerj-tool`. Ces installations locales ne sont pas des dépendances obligatoires de la messagerie et ne sont pas embarquées implicitement dans la distribution de production. Versions et sources : voir le rapport documentaire.

Graphify : utiliser son interpréteur Python avec `-m graphify.serve` sous Windows ; le lanceur graphify-mcp.exe a échoué depuis Node sur cette machine. L'extraction de qualification utilise `GRAPHIFY_BACKEND=none`, `extract CHEMIN_CORPUS --code-only --no-cluster --max-workers 2`. Le graphe se trouve dans CHEMIN_CORPUS/graphify-out/graph.json. Aucun document ni message privé n'est envoyé à un modèle.

XERJ : serveur de qualification lié à `127.0.0.1:9320`, authentification conservée, données dans `.local/xerj-data`, feedback désactivé. Les clients utilisent `XERJ_AUTH` ou `XERJ_API_KEY` selon leur interface ; lire la clé dans l'environnement privé sans l'afficher. Ne pas utiliser `--insecure` pour partager ce service. Le CLI XERJ `autoindex CHEMIN_CORPUS --url http://127.0.0.1:9320` indexe seulement le snapshot. Le serveur n'est ni exposé sur Internet ni ouvert à d'autres comptes PolyTalk. Les personnes disposant de l'accès administrateur local peuvent accéder à cet index de sources.

## Profils MCP et DeepSeek

Configurer des chemins absolus dans l'environnement de génération :

- `POLYTALK_GRAPHIFY_BINARY` : interpréteur Python de l'environnement Graphify ; `POLYTALK_GRAPHIFY_PYTHON=1`.
- `POLYTALK_GRAPHIFY_GRAPH` : graphe JSON du snapshot.
- `POLYTALK_XERJ_BINARY` : exécutable XERJ.

```powershell
node scripts/agent-integrations.mjs mcp
node scripts/agent-integrations.mjs deepseek
```

Les sorties sont des configurations à intégrer au scope souhaité de l'hôte, pas des secrets ni une activation globale. La configuration Cordis fait référence aux variables privées avec la syntaxe officielle `!!js process.env.NOM`. Pour un autre hôte MCP, renseigner explicitement son mécanisme de passage d'environnement pour le coffre natif et `XERJ_AUTH` ; les hôtes ne les héritent pas tous. Les deux serveurs de contexte passent par `context-proxy.mjs` : XERJ ne fournit que xerj_search ; Graphify fournit query_graph, get_node, get_neighbors, get_community, god_nodes, graph_stats et shortest_path. Les fonctions de publication de feedback, modification d'index et outils de PR ne sont pas accessibles par ces passerelles.

La configuration DeepSeek se fonde sur sa révision épinglée. Une mise à jour du runtime exige une nouvelle vérification du plugin, des champs et du cycle MCP. Les instructions reçues, résultats de recherche et contenus des messages restent des données non fiables. Les permissions d'outils de l'hôte s'ajoutent à celles du serveur, elles ne les remplacent pas.

## Vérification et limites

```powershell
npm test
npm run test:context:real
node --test tests/agent-cli.integration.mjs
```

Les tests réels exigent les variables et installations ci-dessus ; leur absence échoue. Le test CLI réel utilise uniquement `.local/last-agent-fixture.json` et un binaire natif fourni par l'opérateur. Ne jamais rediriger cette fixture vers un compte utilisateur réel.

Résultats du 20 octobre 2026 : 247 tests Node réussis ; 2 tests Graphify/XERJ réels réussis ; 1 test CLI/Matrix réel réussi ; compilation web réussie. Les deux petites modifications ultérieures de délai CLI et validation de port ont leurs tests ciblés réussis. Journaux dans documentation/08-integrations-agents/.

Ce lot ne signifie pas « application 100 % accessible aux agents ». Les outils du registre couvrent messagerie texte, invitations, réception/acquittement, tâches/délégation et connaissances privées existantes. Création complète de compte, gestion complète des salons, transferts de fichiers, récupération de clés et décisions opérateur ne sont pas tous exposés dans ce registre. Les opérations humaines sensibles exigent un contrat et des permissions dédiés avant tout ajout. Le runtime DeepSeek, les autres OS, la charge et le déploiement distant restent à qualifier. Aucune clé d'API de modèle n'a été demandée ni utilisée.
