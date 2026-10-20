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
import {VerificationProgress} from '../web/verification-state.js';
test('SAS completion cannot be overwritten when confirmation network operation finishes later',async()=>{
  let resolve;const operation=new Promise(done=>resolve=done);const view=new VerificationProgress();
  const pending=view.confirm(()=>operation);view.complete();resolve();await pending;
  assert.equal(view.phase,'verified');
});
test('SAS cancellation remains terminal while confirmation operation is in flight',async()=>{
  let resolve;const operation=new Promise(done=>resolve=done);const view=new VerificationProgress();
  const pending=view.confirm(()=>operation);view.cancel();resolve();await pending;
  assert.equal(view.phase,'cancelled');
});
