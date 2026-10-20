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
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { validMxid } from './matrix-id.mjs';

function requireMxid(value) {
  if (!validMxid(value)) {
    throw new TypeError('Identité Matrix invalide.');
  }
}
function requireText(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`${label} invalide.`);
  }
}
function requireChoice(value, choices, label) {
  if (!choices.includes(value)) throw new TypeError(`${label} invalide.`);
}

export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS profiles(
        id TEXT PRIMARY KEY, mxid TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('human','agent')), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS policies(
        owner TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('open','allowlist')));
      CREATE TABLE IF NOT EXISTS rules(
        owner TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('allow','block')),
        PRIMARY KEY(owner,target));
      CREATE TABLE IF NOT EXISTS address_book(owner TEXT NOT NULL,target TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(owner,target));
      CREATE TABLE IF NOT EXISTS receipts(
        owner TEXT NOT NULL, event_id TEXT NOT NULL, state TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(owner,event_id));`);
  }
  profile(mxid) { return this.db.prepare('SELECT * FROM profiles WHERE mxid=?').get(mxid); }
  byId(id) { return this.db.prepare('SELECT * FROM profiles WHERE id=?').get(id); }
  ensure(mxid, name, kind='human') {
    requireMxid(mxid);
    const displayName = name === undefined ? mxid.split(':')[0].slice(1) : name;
    // Matrix authentication may supply no display name; retain its bounded localpart fallback.
    if (name !== undefined) requireText(displayName, 80, 'Nom');
    requireChoice(kind, ['human','agent'], 'Type de compte');
    this.db.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?)')
      .run(randomUUID(), mxid, displayName, kind, new Date().toISOString());
    return this.profile(mxid);
  }
  update(mxid, name, kind) {
    requireMxid(mxid);
    requireText(name, 80, 'Nom');
    requireChoice(kind, ['human','agent'], 'Type de compte');
    this.db.prepare('UPDATE profiles SET name=?,kind=? WHERE mxid=?').run(name,kind,mxid);
    return this.profile(mxid);
  }
  search(q, owner) {
    // Exact address or id; named directory search is intentionally not public.
    return this.db.prepare('SELECT * FROM profiles WHERE (mxid=? OR id=?) AND mxid != ? LIMIT 1').all(q,q,owner);
  }
  contacts(owner) {
    requireMxid(owner);
    return this.db.prepare('SELECT target AS mxid,name FROM address_book WHERE owner=? ORDER BY name COLLATE NOCASE,target').all(owner);
  }
  saveContact(owner,target,name) {
    requireMxid(owner);requireMxid(target);requireText(name,80,'Nom du contact');
    if(owner===target)throw new TypeError('Choisissez un autre compte.');
    if(this.contacts(owner).length>=1000&&!this.db.prepare('SELECT 1 FROM address_book WHERE owner=? AND target=?').get(owner,target))throw new TypeError('Limite de 1000 contacts atteinte.');
    this.db.prepare('INSERT INTO address_book(owner,target,name) VALUES(?,?,?) ON CONFLICT(owner,target) DO UPDATE SET name=excluded.name').run(owner,target,name.trim());
    return {mxid:target,name:name.trim()};
  }
  removeContact(owner,target) {
    requireMxid(owner);requireMxid(target);
    this.db.prepare('DELETE FROM address_book WHERE owner=? AND target=?').run(owner,target);
  }
  policy(owner) {
    requireMxid(owner);
    return { mode:this.db.prepare('SELECT mode FROM policies WHERE owner=?').get(owner)?.mode || 'open',
      rules:this.db.prepare('SELECT target,action FROM rules WHERE owner=? ORDER BY target').all(owner) };
  }
  setMode(owner,mode) {
    requireMxid(owner);
    requireChoice(mode, ['open','allowlist'], 'Mode');
    this.db.prepare('INSERT INTO policies VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET mode=excluded.mode').run(owner,mode);
    return this.policy(owner);
  }
  setRule(owner,target,action) {
    requireMxid(owner);
    requireMxid(target);
    requireChoice(action, ['allow','block','remove'], 'Action');
    if (owner === target) throw new TypeError('Une règle doit cibler un autre compte.');
    if(action==='remove') this.db.prepare('DELETE FROM rules WHERE owner=? AND target=?').run(owner,target);
    else this.db.prepare('INSERT INTO rules VALUES(?,?,?) ON CONFLICT(owner,target) DO UPDATE SET action=excluded.action').run(owner,target,action);
    return this.policy(owner);
  }
  allowed(owner,sender) {
    requireMxid(owner);
    requireMxid(sender);
    if(owner===sender) return true;
    const p=this.policy(owner), rule=p.rules.find(r=>r.target===sender);
    if(rule?.action==='block') return false;
    return p.mode!=='allowlist' || rule?.action==='allow';
  }
  receipt(owner,eventId,state) {
    requireMxid(owner);
    requireText(eventId, 255, 'Identifiant d’événement');
    requireChoice(state, ['received','notified','processed'], 'État');
    const rank={received:1,notified:2,processed:3};
    const old=this.db.prepare('SELECT state FROM receipts WHERE owner=? AND event_id=?').get(owner,eventId);
    if(!old || rank[state]>rank[old.state]) this.db.prepare(`INSERT INTO receipts VALUES(?,?,?,?)
      ON CONFLICT(owner,event_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at`)
      .run(owner,eventId,state,new Date().toISOString());
    return this.db.prepare('SELECT event_id,state,updated_at FROM receipts WHERE owner=? AND event_id=?').get(owner,eventId);
  }
  close(){this.db.close();}
}
