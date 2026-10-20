/*! @license
Copyright (C) 2026 PolyTalk contributors
SPDX-License-Identifier: GPL-3.0-or-later

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
// Availability follows implemented authentication paths, never feature detection alone.
export function accessOptions({hasVault=false,walletEnabled=false,identityEnabled=false,passkeysEnabled=false,passkeySupported=false}={}){
 const option=(id,title,description,action,status='available',recommended=false)=>({id,title,description,action,status,recommended});
 return [
  ...(hasVault?[option('unlock','Retrouver cet appareil','Déverrouillez le coffre enregistré ici. Votre session et les clés de cet appareil sont conservées.','unlock','available',true)]:[]),
  option('signup','Créer un compte sans e-mail','Choisissez un pseudo et un mot de passe. Aucun numéro de téléphone demandé. Une invitation peut être nécessaire.','signup','available',!hasVault),
  option('login','Utiliser un compte existant','Sur un nouvel appareil, connectez votre compte puis importez vos clés protégées ou vérifiez un autre appareil.','login'),
  option('wallet','Utiliser un wallet associé',walletEnabled?'Connectez un wallet déjà associé à votre compte. Il ne restaure pas à lui seul votre historique chiffré.':'La connexion wallet n’est pas activée sur cette installation.',walletEnabled?'wallet':null,walletEnabled?'available':'disabled'),
  option('passkey','Empreinte, visage ou clé USB/NFC',passkeysEnabled&&passkeySupported?'Utilisez une clé d’accès déjà associée. Vous pourrez ajouter une passkey ou une clé physique dans vos paramètres.':'La connexion par clé d’accès demande un serveur configuré et un navigateur compatible.',passkeysEnabled&&passkeySupported?'passkey':null,passkeysEnabled&&passkeySupported?'available':'disabled'),
  option('totp','Validation en deux étapes','Facultative : activez une application TOTP dans vos paramètres et conservez les dix codes de secours. Lors de la connexion, PolyTalk demandera le second facteur si vous l’avez activé.','login'),
  option('identity','Générer une identité locale',identityEnabled?'Clé créée sur cet appareil, mot de passe saisi facultatif. Conservez le fichier chiffré et son code avant inscription. La sauvegarde des conversations reste distincte.':'La connexion cryptographique n’est pas configurée sur ce serveur.',identityEnabled?'identity':null,identityEnabled?'available':'planned'),
  option('cloud','Sauvegarde automatique et récupération','À intégrer : sauvegarde chiffrée, clé de récupération et connecteurs cloud facultatifs. Aujourd’hui, exportez manuellement vos clés dans les réglages.',null,'planned'),
 ];
}
