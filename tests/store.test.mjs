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
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store.mjs';

const alice = '@alice:polytalk.test';
const bob = '@bob:polytalk.test';
const carol = '@carol:polytalk.test';

function database(t) {
  const directory = mkdtempSync(join(tmpdir(), 'polytalk-store-'));
  const path = join(directory, 'registry.sqlite');
  let store = new Store(path);
  t.after(() => {
    try { store.close(); } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  return {
    get store() { return store; },
    reopen() { store.close(); store = new Store(path); return store; },
  };
}

// Characterization of code written before Superpowers: these passed on first run.
test('a Matrix account retains its UUIDv4 and original profile after reopening', t => {
  const db = database(t);
  const first = db.store.ensure(alice, 'Alice', 'agent');
  assert.match(first.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const second = db.store.ensure(bob);
  assert.notEqual(first.id, second.id);
  assert.equal(second.name, 'bob');
  assert.equal(second.kind, 'human');
  db.reopen();
  assert.deepEqual(db.store.ensure(alice, 'Another name', 'human'), first);
  assert.deepEqual(db.store.byId(first.id), first);
});

test('profile edits preserve the permanent identity and survive reopening', t => {
  const db = database(t);
  const original = db.store.ensure(alice);
  db.store.update(alice, 'Alice Agent', 'agent');
  db.reopen();
  assert.deepEqual({ ...db.store.profile(alice) }, {
    ...original, name: 'Alice Agent', kind: 'agent',
  });
});

test('contact lookup uses an exact address or UUID and excludes the owner', t => {
  const { store } = database(t);
  store.ensure(alice, 'Alice');
  const contact = store.ensure(bob, 'Bob');
  assert.deepEqual(store.search(bob, alice), [contact]);
  assert.deepEqual(store.search(contact.id, alice), [contact]);
  for (const query of ['Bob', '@bo', '%', alice, store.profile(alice).id]) {
    assert.deepEqual(store.search(query, alice), []);
  }
});

test('an allowlist rejects unknown senders and accepts explicitly allowed senders', t => {
  const { store } = database(t);
  assert.equal(store.allowed(alice, bob), true);
  store.setMode(alice, 'allowlist');
  assert.equal(store.allowed(alice, bob), false);
  store.setRule(alice, bob, 'allow');
  assert.equal(store.allowed(alice, bob), true);
  assert.equal(store.allowed(alice, carol), false);
});

test('a block supersedes a previous allowance in either reception mode', t => {
  const { store } = database(t);
  for (const mode of ['open', 'allowlist']) {
    store.setMode(alice, mode);
    store.setRule(alice, bob, 'allow');
    store.setRule(alice, bob, 'block');
    assert.equal(store.allowed(alice, bob), false);
    assert.deepEqual(store.policy(alice).rules.map(rule => ({ ...rule })), [
      { target: bob, action: 'block' },
    ]);
  }
});

test('policies persist independently for each owner and rule removal restores the mode default', t => {
  const db = database(t);
  db.store.setMode(alice, 'allowlist');
  db.store.setRule(alice, carol, 'allow');
  db.store.setRule(bob, carol, 'block');
  db.reopen();
  assert.equal(db.store.allowed(alice, carol), true);
  assert.equal(db.store.allowed(bob, carol), false);
  assert.equal(db.store.policy(bob).mode, 'open');
  db.store.setRule(alice, carol, 'remove');
  assert.equal(db.store.allowed(alice, carol), false);
  assert.equal(db.store.allowed(bob, carol), false);
  db.store.setRule(bob, carol, 'remove');
  assert.equal(db.store.allowed(bob, carol), true);
});

test('receipts advance through delivery states and ignore duplicate or older states', t => {
  const { store } = database(t);
  assert.equal(store.receipt(alice, '$event', 'received').state, 'received');
  assert.equal(store.receipt(alice, '$event', 'notified').state, 'notified');
  const processed = store.receipt(alice, '$event', 'processed');
  for (const state of ['received', 'notified', 'processed']) {
    assert.deepEqual(store.receipt(alice, '$event', state), processed);
  }
});

test('receipt state survives reopening without affecting another owner or event', t => {
  const db = database(t);
  const processed = db.store.receipt(alice, '$shared', 'processed');
  db.store.receipt(bob, '$shared', 'received');
  db.store.receipt(alice, '$other', 'notified');
  db.reopen();
  assert.deepEqual(db.store.receipt(alice, '$shared', 'received'), processed);
  assert.equal(db.store.receipt(bob, '$shared', 'received').state, 'received');
  assert.equal(db.store.receipt(alice, '$other', 'received').state, 'notified');
});

// Regression tests: each must fail before its corresponding store validation exists.
test('registration rejects malformed Matrix identities before persisting a profile', t => {
  const { store } = database(t);
  for (const mxid of ['alice', '@alice:', '@alice:polytalk.test\n', '', null, '@' + 'a'.repeat(256) + ':test']) {
    assert.throws(() => store.ensure(mxid, 'Alice'), TypeError);
  }
  assert.equal(store.ensure(alice).mxid, alice);
});

test('authentication can still ensure a valid Matrix account with a long default display name', t => {
  const { store } = database(t);
  const mxid = '@' + 'a'.repeat(81) + ':polytalk.test';
  const profile = store.ensure(mxid);
  assert.equal(profile.mxid, mxid);
  assert.equal(profile.name, 'a'.repeat(81));
  assert.equal(store.ensure(mxid).id, profile.id);
});

test('invalid profile fields are rejected without changing the existing identity', t => {
  const { store } = database(t);
  const original = store.ensure(alice, 'Alice');
  for (const name of ['', '   ', 'a'.repeat(81), null, 42]) {
    assert.throws(() => store.update(alice, name, 'human'), TypeError);
    assert.throws(() => store.ensure(bob, name), TypeError);
  }
  for (const kind of ['robot', '', null, 42]) {
    assert.throws(() => store.ensure(bob, 'Bob', kind), TypeError);
    assert.throws(() => store.ensure(alice, 'Changed', kind), TypeError);
    assert.throws(() => store.update(alice, 'Changed', kind), TypeError);
  }
  assert.deepEqual(store.profile(alice), original);
  assert.equal(store.profile(bob), undefined);
});

test('policy operations reject invalid identities before evaluating or mutating access', t => {
  const { store } = database(t);
  for (const bad of ['', 'Alice', '@alice:test\n', null]) {
    assert.throws(() => store.policy(bad), TypeError);
    assert.throws(() => store.setMode(bad, 'open'), TypeError);
    assert.throws(() => store.setRule(bad, bob, 'block'), TypeError);
    assert.throws(() => store.setRule(alice, bad, 'block'), TypeError);
    assert.throws(() => store.allowed(bad, bad), TypeError);
    assert.throws(() => store.allowed(alice, bad), TypeError);
  }
  assert.equal(store.allowed(alice, bob), true);
});

test('policy enums and self rules are rejected without replacing valid access settings', t => {
  const { store } = database(t);
  store.setMode(alice, 'allowlist');
  store.setRule(alice, bob, 'block');
  for (const mode of ['unknown', '', null, 42]) {
    assert.throws(() => store.setMode(alice, mode), TypeError);
  }
  for (const action of ['unknown', '', null, 42]) {
    assert.throws(() => store.setRule(alice, bob, action), TypeError);
  }
  assert.throws(() => store.setRule(alice, alice, 'allow'), TypeError);
  assert.throws(() => store.setRule(alice, alice, 'block'), TypeError);
  assert.equal(store.policy(alice).mode, 'allowlist');
  assert.equal(store.allowed(alice, bob), false);
});

test('invalid receipt states cannot poison later valid delivery progress', t => {
  const { store } = database(t);
  for (const state of ['delivered', '__proto__', 'constructor', '', null, 42]) {
    assert.throws(() => store.receipt(alice, '$event', state), TypeError);
  }
  assert.equal(store.receipt(alice, '$event', 'received').state, 'received');
  const processed = store.receipt(alice, '$event', 'processed');
  assert.throws(() => store.receipt(alice, '$event', 'delivered'), TypeError);
  assert.deepEqual(store.receipt(alice, '$event', 'received'), processed);
});

test('receipt owner and event boundaries reject invalid records', t => {
  const { store } = database(t);
  for (const owner of ['', 'Alice', '@alice:test\n', null]) {
    assert.throws(() => store.receipt(owner, '$event', 'received'), TypeError);
  }
  for (const eventId of ['', '   ', 'e'.repeat(256), null, 42]) {
    assert.throws(() => store.receipt(alice, eventId, 'received'), TypeError);
  }
  assert.equal(store.receipt(alice, '$valid', 'received').event_id, '$valid');
});

test('a plus localpart retains its identity and access policy after reopening', t => {
  const db = database(t);
  const mxid = '@alice+bot:polytalk.test';
  const profile = db.store.ensure(mxid, 'Alice Bot', 'agent');
  db.store.setMode(alice, 'allowlist');
  db.store.setRule(alice, mxid, 'allow');
  db.reopen();
  assert.deepEqual(db.store.ensure(mxid), profile);
  assert.equal(db.store.allowed(alice, mxid), true);
  db.store.setRule(alice, mxid, 'block');
  assert.equal(db.store.allowed(alice, mxid), false);
});

test('bracketed IPv6 Matrix identities work with and without an explicit port', t => {
  const db = database(t);
  const addresses = ['@alice:[::1]', '@alice:[2001:db8::abcd]:8448', '@alice:[::ffff:192.0.2.1]:443'];
  const profiles = addresses.map(mxid => db.store.ensure(mxid));
  db.reopen();
  for (let index = 0; index < addresses.length; index++) {
    const mxid = addresses[index];
    assert.deepEqual(db.store.ensure(mxid), profiles[index]);
    db.store.setMode(mxid, 'allowlist');
    db.store.setRule(mxid, bob, 'allow');
    assert.equal(db.store.allowed(mxid, bob), true);
    assert.equal(db.store.receipt(mxid, '$ipv6', 'received').state, 'received');
  }
});

test('malformed Matrix server syntax cannot become an identity or policy target', t => {
  const { store } = database(t);
  for (const host of [
    '::1', 'server:', 'server:http', 'server:123456', 'server:80:90',
    '.', 'bad..test', '-bad.test', 'bad-.test', '999.1.2.3',
    '[::1', '::1]', '[::gg]', '[127.0.0.1]', '[1:2:3]',
    '[::1]extra', '[::1]:', '[::1]:https', '[::1]:123456',
  ]) {
    const mxid = '@alice:' + host;
    assert.throws(() => store.ensure(mxid), TypeError, host);
    assert.throws(() => store.setRule(alice, mxid, 'allow'), TypeError, host);
    assert.throws(() => store.allowed(alice, mxid), TypeError, host);
    assert.equal(store.profile(mxid), undefined);
  }
  assert.deepEqual(store.policy(alice).rules, []);
});

test('DNS and IPv4 server names retain their exact spelling and optional ports', t => {
  const { store } = database(t);
  for (const mxid of [
    '@alice:polytalk', '@alice:Matrix.Example:8448', '@alice:polytalk.test.',
    '@alice:127.0.0.1', '@alice:192.0.2.1:8448',
  ]) {
    assert.equal(store.ensure(mxid).mxid, mxid);
  }
  assert.notEqual(store.ensure('@alice:Matrix.Example').id, store.ensure('@alice:matrix.example').id);
});

test('printable historical Matrix localparts keep their exact identity after reopening', t => {
  const db = database(t);
  const mxids = ['@Legacy.User:polytalk.test', '@legacy~user:polytalk.test', '@élise:polytalk.test'];
  const profiles = mxids.map(mxid => db.store.ensure(mxid));
  db.reopen();
  for (let index = 0; index < mxids.length; index++) {
    assert.deepEqual(db.store.ensure(mxids[index]), profiles[index]);
  }
  const boundaryMxid = '@' + 'é'.repeat(120) + ':polytalk.test';
  assert.equal(db.store.ensure(boundaryMxid).mxid, boundaryMxid);
  assert.notEqual(db.store.ensure('@legacy.user:polytalk.test').id, profiles[0].id);
});

test('historical Matrix localparts still reject whitespace controls and oversized UTF-8 IDs', t => {
  const { store } = database(t);
  for (const mxid of [
    '@alice bob:polytalk.test', '@alice\nbob:polytalk.test', '@alice\0bob:polytalk.test',
    '@alice\u0085bob:polytalk.test', '@alice\u200bbob:polytalk.test',
    '@alice\ud800bob:polytalk.test', '@' + 'é'.repeat(121) + ':polytalk.test',
  ]) {
    assert.throws(() => store.ensure(mxid), TypeError);
    assert.throws(() => store.allowed(alice, mxid), TypeError);
  }
});
