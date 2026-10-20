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
import { isIP } from 'node:net';

export function validServerName(value) {
  if (typeof value !== 'string') return false;
  const ipv6 = /^\[([0-9a-fA-F:.]+)\](?::[0-9]{1,5})?$/.exec(value);
  if (ipv6) return isIP(ipv6[1]) === 6;
  const dns = /^([a-zA-Z0-9.-]+)(?::[0-9]{1,5})?$/.exec(value);
  if (!dns) return false;
  const host = dns[1];
  if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(host)) {
    return host.split('.').every(part => part.length <= 3 && Number(part) <= 255);
  }
  const labels = host.endsWith('.') ? host.slice(0, -1).split('.') : host.split('.');
  return labels.every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
}

export function validMxid(value) {
  // Historical server-returned localparts are broader than new account signup names.
  const parts = typeof value === 'string' && /^@([^:\s\p{Cc}\p{Cf}\p{Cs}]+):(.+)$/u.exec(value);
  return Boolean(parts && Buffer.byteLength(value, 'utf8') <= 255 && value === value.trim() && validServerName(parts[2]));
}
