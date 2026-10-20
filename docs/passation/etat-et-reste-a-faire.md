# État réel et travaux restants

État documentaire au 20 octobre 2026 ; références de code dans la prise en main. « Implémenté » ne signifie pas « certifié sur chaque appareil ».

| Domaine | État transmis | Prochain critère de clôture |
|---|---|---|
| Messages Matrix, invitations, carnet, blocage/autorisation | Implémentations et tests présents | Recette humaine sur services réels, droits et reconnexions |
| Identifiant/mot de passe, reprise locale | Implémentations et tests présents | Tester actualisation, expiration, révocation, comptes multiples |
| Passkeys, TOTP, codes de secours, wallets | Options selon configuration | Appareils physiques ; WalletConnect nécessite un Project ID opérateur réel |
| Sauvegarde Matrix et phrase de protection facultative | Code et tests unitaires présents | Recette complète multi-appareils ; dernier essai historique bloqué par 429 |
| Contrats, délégation, approbations et événements | Implémentés avec permissions | Recette des annulations, erreurs et charges réelles |
| MCP, CLI et persistance crypto Rust | Code et tests présents ; essais locaux historiques | Distribution signée et recette par OS |
| A2A | Relais local texte limité | Définir et tester cycle complet, streaming, déduplication durable avant extension |
| Graphify/XERJ | Passerelle de contexte de sources autorisées | Reproduire installation et tests avec exécutables configurés |
| DeepSeek | Profil de configuration | Runtime réel non qualifié |
| SLIM et MLS | Non implémentés | Étude de protocole et modèle de routage/chiffrement avant développement |
| iCloud/Drive/WebDAV automatiques | Non livrés | Connecteurs, consentement, gestion des conflits et restauration |
| Google Invite, mémoire/skills UI, routines/webhooks, routage IA, exécution isolée | Non déclarés terminés | Contrats, permissions, développement et tests dédiés |
| Mobile/tablette/PC | Web adaptatif | Recette physique et accessibilité ; aucune app native universelle certifiée |

## Priorités de reprise

1. **Avant exploitation réelle** : restauration isolée, TLS, droits opérateurs, secrets, charge, droits des visuels et licences tiers. Ne pas annoncer une version stable avant qualification.
2. **Q04/Q05** : terminer protection des saisies abandonnées et recette visuelle des confirmations ; tester une coupure réelle pendant création de salon et sa reprise sans doublon.
3. **Q08** : recette de rotation/suppression/restauration sur trois appareils. Conserver les limites de débit ; ne pas les affaiblir pour faire passer un test.
4. **Q16** : compléter les schémas des réponses API ; la pagination des tâches possède déjà code et tests.
5. **Q01** : build optimisé, signature/distribution et qualification des plateformes ; le succès debug local ne les remplace pas.
6. **Q06** : terminer les écrans détaillés et l'alignement UI ; design system documentaire ne signifie pas recette de toute l'interface.
7. Requalifier Q07, Q09–Q15, Q17–Q18 à partir du cahier des charges et du TODO public. La correspondance détaillée de chaque ancien numéro n'est pas reconstruite sans preuve ; créer des issues explicites plutôt que supposer leur clôture.

## Correctifs historiques à préserver

- Q02 : ignorer les recherches de contacts tardives et invalider les aperçus après saisie.
- Q03 : verrouiller sur un 401 de session courant, sans révoquer sur panne réseau/503 ni réponse d'une ancienne génération.
- Q05 : marqueur de création incertaine et verrou inter-onglets ; ne pas contourner en effaçant le marqueur.
- Q08 : restaurer les clés avant rotation ; ne pas supprimer l'ancienne version avant succès.
- Q16 : pagination bornée et isolation ; test synthétique de 205 contrats, pas une preuve de charge réelle.
- Q19 : contraste des placeholders corrigé ; pas de certification générale WCAG.

Les rapports historiques annonçaient 239 puis 258 tests Node suivant les lots. La préparation publique a vérifié 260 tests. Ne pas additionner ces chiffres : ce sont des suites à des dates différentes.
