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
import test from 'node:test';
import assert from 'node:assert/strict';
import {saveRecoveryPhrase,readRecoveryPhrase} from '../web/recovery-phrase.js';
import {SessionScope} from '../web/session-scope.js';
test('optional phrase transfers an encrypted recovery key to another authenticated device',async()=>{
 let envelope;const scope=new SessionScope();scope.begin();
 const client={getUserId:()=> '@alice:local',setAccountData:async(type,data)=>{envelope=data;},getAccountDataFromServer:async()=>envelope};
 const args={client,scope,phrase:'a private recovery phrase',version:'1'};
 await saveRecoveryPhrase({...args,code:'recovery-key'});
 assert.equal(JSON.stringify(envelope).includes('recovery-key'),false);
 assert.equal(JSON.stringify(envelope).includes(args.phrase),false);
 assert.equal(await readRecoveryPhrase(args),'recovery-key');
 await assert.rejects(readRecoveryPhrase({...args,phrase:'wrong recovery phrase'}),/incorrecte/);
 await assert.rejects(readRecoveryPhrase({...args,version:'2'}),/sauvegarde/);
 client.getUserId=()=> '@bob:local';await assert.rejects(readRecoveryPhrase(args),/compte/);
});
