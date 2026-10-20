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
export class ClientState {
  status = 'locked';
  transition(status) { this.status = status; }
  assertSend() { if(this.status !== 'ready') throw Error('Connexion et chiffrement prêts requis avant envoi.'); }
}
export function validateResume(saved, exists, identity) {
  if (!exists) throw Error('Stockage des clés introuvable. Reprise refusée : restaurez le stockage ou connectez un nouvel appareil.');
  if (!saved.identity || saved.identity !== identity) throw Error('L’identité cryptographique de cet appareil a changé. Reprise refusée.');
}
export function acceptsSender(policy,sender,pending=false) {
  if(pending || !policy || !Array.isArray(policy.rules))return false;
  const rules=policy.rules.filter(r=>r.target===sender);
  return !rules.some(r=>r.action==='block') && (policy.mode==='open'||rules.some(r=>r.action==='allow'));
}

