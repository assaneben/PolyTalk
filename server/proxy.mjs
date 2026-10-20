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
import {isIP} from 'node:net';
const normalize=value=>typeof value==='string'&&value.startsWith('::ffff:')&&isIP(value.slice(7))===4?value.slice(7):value;
export function proxyPeers(values){if(!Array.isArray(values)||values.length>16||values.some(value=>!isIP(value)))throw Error('Trusted proxy peers must be explicit IP addresses');return new Set(values.map(normalize));}
export function clientAddress(request,trusted){const peer=normalize(request.socket.remoteAddress)||'unknown';if(!trusted.has(peer))return peer;const forwarded=request.headers['x-forwarded-for'];if(forwarded===undefined)return peer;if(typeof forwarded!=='string'||!isIP(forwarded.trim())){const error=Error('Adresse de proxy invalide.');error.status=400;throw error;}return normalize(forwarded.trim());}
