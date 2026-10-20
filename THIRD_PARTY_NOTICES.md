# Composants et droits tiers

La GPL du projet ne remplace pas les licences des dépendances. Les versions sont verrouillées dans package-lock.json, agent/Cargo.lock et les digests des images de deploy/.

Synapse est annoncé en amont sous AGPLv3 ou licence commerciale, avec les fichiers LICENSE-AGPL-3.0 et LICENSE-COMMERCIAL. Les obligations du composant effectivement distribué restent applicables, notamment lors d'une modification de ce serveur. Le résumé de la GPL PolyTalk ne doit pas être lu comme une suppression des obligations réseau de l'AGPL. Avant distribution d'images, relier chaque digest à son code source correspondant et conserver ses avis ; cette correspondance n'a pas été requalifiée pendant ce lot, Docker étant arrêté.

Composants principaux : Matrix JS SDK et Rust SDK, Synapse, PostgreSQL, Node.js, esbuild, MCP SDK, SimpleWebAuthn, Reown/WalletConnect, ethers, jsQR, qrcode et zod. Conserver les avis LICENSE/NOTICE livrés avec chaque version. Le dossier node_modules n'est pas du code propre à PolyTalk.

Graphify, XERJ, CLI-Anything et DeepSeek Harness restent des projets indépendants ; leurs révisions et rôles sont documentés dans agent/INTEGRATIONS.md. Leur utilisation ne les réétiquette pas sous GPL.

Les logos fournis ne sont pas modifiés pour y inscrire un en-tête binaire. Le titulaire doit confirmer ses droits de redistribution avant publication publique. Aucun droit de marque ni de visuel tiers n'est accordé implicitement.

L'inventaire automatisé des licences est une aide, pas une analyse juridique complète. Une licence absente ou ambiguë empêche de déclarer la revue de distribution achevée.

L'inventaire npm observé est dans docs/licences-npm.json. Il reflète les métadonnées des paquets installés, pas une validation juridique des fichiers ni un audit complet des crates Rust et images système.
