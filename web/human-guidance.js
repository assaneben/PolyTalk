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
const choices=[['conversation','Écrire un nouveau message','Vous avez déjà l’adresse de votre contact ? Créez une conversation et envoyez-lui une invitation.'],['contacts','Trouver ou ajouter un contact','Collez l’adresse ou le lien qu’une personne vous a partagé.'],['invitations','Voir mes invitations','Acceptez une invitation reçue pour rejoindre une conversation.']];
export function humanHome({el,button,actions}){
 const body=el('div',undefined,'human-home');body.append(el('p','VOTRE MESSAGERIE','eyebrow'),el('h2','Que souhaitez-vous faire ?'),el('p','Choisissez une conversation à gauche, ou commencez ici.','muted'));
 const grid=el('div',undefined,'home-actions');for(const [key,title,description] of choices){const card=el('section',undefined,'home-action');card.append(button(title,actions[key],key==='conversation'?'primary wide':'secondary wide'),el('p',description));grid.append(card);}body.append(grid,el('p','Vos nouvelles conversations sont privées et chiffrées. Aucun agent n’intervient si vous ne l’invitez pas.','hint'));return body;
}
export function showHumanHelp({messenger,dialog,el,button,actions}){
 const generation=messenger.scope.generation,body=dialog('Aide et premiers pas');body.append(el('p','Un bouton indique une action. Voici où commencer selon votre besoin.'));
 const all=[...choices,['share','Partager mon adresse','Pour qu’une personne vous écrive : partagez votre adresse, votre lien ou votre QR code.'],['settings','Ouvrir les paramètres','Changer votre nom, bloquer un contact, préparer une sauvegarde ou sécuriser votre accès.']];
 for(const [key,title,description] of all){const card=el('section',undefined,'settings-choice');card.append(button(title,()=>{messenger.scope.assert(generation);if(!body.isConnected||!body.closest('dialog')?.open)throw Error('Cette aide est fermée.');return actions[key]();},'secondary wide'),el('p',description));body.append(card);}
 body.append(el('h3','Et les agents IA ?'),el('p','La rubrique « Agents IA » est facultative. Elle regroupe les tâches, la supervision et les équipes. Inviter un agent ne lui donne pas d’accès à votre ordinateur.'));
}
