# Preuves et confidentialité

## Révision et preuves publiques

Révision de référence : `642e3bbdfc507d65017f4e4efe9a81205a07c0b3`.

- [CI de cette révision](https://github.com/assaneben/PolyTalk/actions/runs/39497344787) : succès vérifié via API GitHub le 20 octobre 2026. Workflow : Node Windows/macOS/Linux (lint, tests, build) et Rust Linux.
- [CodeQL de cette révision](https://github.com/assaneben/PolyTalk/actions/runs/39497344650) : succès vérifié ; ne vaut pas audit de sécurité exhaustif.
- Export initial : 267 fichiers source et un manifeste ; clone public vérifié sans divergence des 267 empreintes.
- Les ajouts de passation modifient le manifeste. Les contrôles de la nouvelle révision doivent être lus dans GitHub Actions ; les liens ci-dessus restent attachés à l'ancienne révision.

Les preuves locales historiques (essais MCP/A2A, diagnostic Matrix et sauvegardes) ont été relues pour cette synthèse, pas réexécutées. Elles sont décrites comme historiques. Le lot de passation ne teste pas de nouveau Docker, les appareils physiques, les wallets ni la restauration réelle.

## Politique d'expurgation appliquée

Publication de documents rédigés à neuf à partir des conclusions techniques, sans copie brute des archives locales. Sont exclus : noms et chemins de profil personnel, adresses de comptes de test ou réels, conversations, bases, journaux bruts, tokens, mots de passe, clés privées, codes de récupération, secrets TOTP et variables privées.

Les chemins relatifs des sources, noms de protocoles, liens publics, identifiants de correctifs et versions techniques sont conservés pour rendre les conclusions vérifiables. `@assaneben` est le compte public déjà propriétaire du dépôt ; aucun email n'est ajouté.

Les rapports locaux des dossiers 05-archives, 07-audit-qa, 08-integrations-agents, 09-audit-ui, 10-open-source et Logo Lab ne sont pas copiés en bloc. Les conclusions nécessaires des audits et intégrations sont synthétisées dans cette passation ; les guides agents publics fournissent les procédures reproductibles. Aucun succès ancien n'est attribué automatiquement au code courant.

## Limites explicites

Ce dossier ne remplace pas le transfert sécurisé des secrets d'exploitation, les droits de redistribution des images, la recette physique, les tests de charge et de restauration ni le registre d'exploitation propre à l'hébergeur. Le contact public de modération reste à définir par le mainteneur.

Relecture de confidentialité selon les principes SecureByDesign v1.1.0. Cette analyse des motifs connus du code et de l'architecture ne remplace ni un test d'intrusion, ni une modélisation formelle des menaces, ni un audit de sécurité certifié.
