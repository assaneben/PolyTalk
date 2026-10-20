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
export function missingPlatformFeatures(platform){
 const missing=[];
 if(!platform.isSecureContext)missing.push('connexion HTTPS');
 if(!platform.crypto?.subtle)missing.push('Web Crypto');
 if(!platform.indexedDB)missing.push('IndexedDB');
 if(!platform.WebAssembly)missing.push('WebAssembly');
 if(!platform.navigator?.locks)missing.push('Web Locks');
 return missing;
}
