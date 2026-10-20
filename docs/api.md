# API et protocoles

Contrat vivant : GET `/api/openapi.json` ; source : server/openapi.mjs. Les API PolyTalk ne remplacent pas toutes les routes Matrix.

| Route | Fonction |
|---|---|
| GET /api/config | Capacités et politique d'inscription |
| GET /api/health | Disponibilité API/Matrix |
| POST /api/auth/password | Connexion ou défi 2FA |
| GET /api/me | Profil et règles du compte |
| GET /api/address-book | Carnet personnel |
| POST /api/address-book | Enregistrer, renommer ou retirer |
| GET /api/coordination/tasks | Page de tâches, curseur after |
| GET /api/coordination/approvals | Approbations autorisées, actives prioritaires |

Exemple public :

```http
GET /api/health HTTP/1.1
Host: localhost:3210
```

Quand Matrix répond :

```json
{"status":"ready","edition":"intranet","matrix":true}
```

Mutation de carnet : Authorization Bearer, Origin exacte et Content-Type application/json. Exemple synthétique :

```json
{"action":"save","mxid":"@camille:example.test","name":"Camille"}
```

Réponse : `{"mxid":"@camille:example.test","name":"Camille"}`. Retrait : action remove et mxid. Ces adresses ne sont pas des comptes joignables.

401 : connexion absente/expirée ; 403 : accès ou confirmation refusés ; 409 : conflit/version ; 429 : limite. Lire le corps sans répéter automatiquement une mutation. Ne pas consigner Authorization.

MCP stdio : `npm run agent:mcp`, outils via tools/list. CLI : `npm run agent:cli -- tools`. A2A est limité au relais texte local, sans cycle complet, streaming ni déduplication durable. SLIM/MLS ne sont pas implémentés.
