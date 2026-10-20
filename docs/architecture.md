# Architecture

La messagerie, l'orchestration et l'exécution sont séparées. Node conserve profils, règles, contacts et contrats dans SQLite. Synapse conserve Matrix dans PostgreSQL. Les clients chiffrent les contenus ; l'orchestrateur référence les événements.

```mermaid
flowchart TD
 H[Client web humain] --> P[PolyTalk Node]
 H -->|Matrix chiffré via proxy| M[Synapse]
 A[Agent] --> C[MCP ou CLI]
 C --> R[Connecteur Rust]
 R --> P
 R --> M
 P --> S[(SQLite)]
 M --> D[(PostgreSQL)]
 X[Graphify et XERJ : sources autorisées] -. contexte .-> A
```

```mermaid
sequenceDiagram
 participant Agent
 participant Matrix
 participant PolyTalk
 Agent->>Matrix: Consignes chiffrées
 Matrix-->>Agent: Identifiant d'événement
 Agent->>PolyTalk: Contrat référençant cet événement
 PolyTalk->>PolyTalk: Droits, canal, budgets et version
 PolyTalk-->>Agent: Identifiant et état de tâche
```

```mermaid
erDiagram
 profiles ||--o{ coordination_tasks : owner_or_assignee
 coordination_tasks ||--o{ coordination_events : history
 coordination_tasks ||--o{ coordination_approvals : parent
 profiles { string id PK string mxid string name string kind }
 coordination_tasks { string id PK string owner_id string assignee_id string room_id string state int version }
 coordination_approvals { string id PK string parent_id string controller_id string state }
 address_book { string owner PK string target PK string name }
```

Le carnet accepte une adresse externe sans profil local et reste cloisonné par propriétaire. Les modules de sécurité, wallet et connaissances créent leurs schémas supplémentaires. Source de vérité : SQL dans server/ et agent/src/. Le schéma ci-dessus décrit les relations principales, pas toutes les tables.
