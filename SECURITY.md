# Sécurité

## Versions prises en charge

| Version | Statut |
|---|---|
| 0.1.0 en développement | Corrections au mieux ; aucune garantie de production |
| Anciennes révisions et forks | Non maintenus par ce dépôt |

## Signalement

Utiliser **Security → Advisories → Report a vulnerability** lorsque le signalement privé est activé. Ne jamais publier une preuve avec des secrets dans une issue. Si ce canal n'est pas activé, attendre un canal privé annoncé par le responsable ; aucun e-mail non confirmé n'est inventé.

Indiquer commit, composants, préconditions, impact et reproduction synthétique. Ne joindre ni .env, ni clés, codes de secours, jetons ou conversations réelles. Aucun délai de réponse ou programme de récompense n'est promis. Coordonner la divulgation avec les responsables.

Le contenu chiffré n'efface pas les métadonnées. Les agents peuvent transmettre les messages à leur modèle. Le carnet serveur n'est pas chiffré de bout en bout. Les index de contexte ne doivent pas recevoir de données privées. Voir [confidentialité](docs/confidentialite.md).

TLS, proxy, sauvegardes vérifiées et permissions d'exploitation sont requis avant exposition réseau. CodeQL et la CI ne constituent pas une certification de sécurité.
