// Copyright (C) 2026 PolyTalk contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305, XNonce,
    aead::{Aead, Payload},
};
use rusqlite::{Connection, params};
use std::path::Path;
use zeroize::Zeroizing;
pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;
pub struct Inbox {
    db: Connection,
    key: Zeroizing<[u8; 32]>,
}
#[derive(Debug)]
pub struct Message {
    pub room_id: String,
    pub event_id: String,
    pub sender: String,
    pub body: Vec<u8>,
    pub notified: bool,
}
fn aad(room: &str, event: &str, sender: &str) -> Vec<u8> {
    let mut bytes = Vec::new();
    for value in ["polytalk.inbox.v1", room, event, sender] {
        bytes.extend_from_slice(&(value.len() as u64).to_be_bytes());
        bytes.extend_from_slice(value.as_bytes());
    }
    bytes
}
fn encrypt(key: &[u8; 32], body: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| "Invalid key")?;
    let mut nonce = [0u8; 24];
    getrandom::fill(&mut nonce).map_err(|_| "Random generator unavailable")?;
    let mut result = nonce.to_vec();
    result.extend(
        cipher
            .encrypt(XNonce::from_slice(&nonce), Payload { msg: body, aad })
            .map_err(|_| "Encryption failed")?,
    );
    Ok(result)
}
fn decrypt(key: &[u8; 32], bytes: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
    if bytes.len() < 40 {
        return Err("Invalid encrypted record".into());
    }
    XChaCha20Poly1305::new_from_slice(key)
        .map_err(|_| "Invalid key")?
        .decrypt(
            XNonce::from_slice(&bytes[..24]),
            Payload {
                msg: &bytes[24..],
                aad,
            },
        )
        .map_err(|_| "Wrong password or altered store".into())
}
impl Inbox {
    pub fn open(path: &Path, password: &str) -> Result<Self> {
        if password.len() < 12 {
            return Err("Local password must contain at least 12 bytes".into());
        }
        let existed = path.exists();
        if existed && std::fs::symlink_metadata(path)?.file_type().is_symlink() {
            return Err("Linked store refused".into());
        }
        let mut db = Connection::open(path)?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        db.pragma_update(None, "synchronous", "FULL")?;
        if !existed {
            db.execute_batch("BEGIN IMMEDIATE; CREATE TABLE metadata(key TEXT PRIMARY KEY,value BLOB NOT NULL); CREATE TABLE inbox(room TEXT NOT NULL,event TEXT NOT NULL,sender TEXT NOT NULL,body BLOB NOT NULL,notified INTEGER NOT NULL DEFAULT 0,processed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room,event)); COMMIT;")?;
        }
        let salt: Vec<u8> = if existed {
            db.query_row("SELECT value FROM metadata WHERE key='salt'", [], |r| {
                r.get(0)
            })?
        } else {
            let mut salt = vec![0u8; 16];
            getrandom::fill(&mut salt).map_err(|_| "Random generator unavailable")?;
            salt
        };
        if salt.len() != 16 {
            return Err("Invalid store salt".into());
        }
        let mut key = Zeroizing::new([0u8; 32]);
        Argon2::new(
            Algorithm::Argon2id,
            Version::V0x13,
            Params::new(65536, 3, 1, Some(32)).map_err(|_| "Invalid derivation parameters")?,
        )
        .hash_password_into(password.as_bytes(), &salt, &mut *key)
        .map_err(|_| "Key derivation failed")?;
        if existed {
            let check: Vec<u8> =
                db.query_row("SELECT value FROM metadata WHERE key='check'", [], |r| {
                    r.get(0)
                })?;
            if decrypt(&key, &check, b"polytalk.store.v1")? != b"polytalk.store.v1" {
                return Err("Invalid store".into());
            }
        } else {
            let check = encrypt(&key, b"polytalk.store.v1", b"polytalk.store.v1")?;
            let tx = db.transaction()?;
            tx.execute("INSERT INTO metadata VALUES('salt',?1)", [salt])?;
            tx.execute("INSERT INTO metadata VALUES('check',?1)", [check])?;
            tx.commit()?;
        }
        db.execute_batch("CREATE TABLE IF NOT EXISTS private_knowledge(kind TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,body BLOB,PRIMARY KEY(kind,id));")?;
        let has_receipt = {
            let mut query = db.prepare("PRAGMA table_info(inbox)")?;
            query
                .query_map([], |row| row.get::<_, String>(1))?
                .collect::<std::result::Result<Vec<_>, _>>()?
                .iter()
                .any(|name| name == "receipt_sent")
        };
        if !has_receipt {
            db.execute_batch(
                "ALTER TABLE inbox ADD COLUMN receipt_sent INTEGER NOT NULL DEFAULT 0;",
            )?;
        }
        Ok(Self { db, key })
    }
    fn knowledge_identity(kind: &str, id: &str) -> Result<()> {
        if !["memory", "skill"].contains(&kind)
            || id.len() != 36
            || id.char_indices().any(|(i, c)| {
                if [8, 13, 18, 23].contains(&i) {
                    c != '-'
                } else {
                    !c.is_ascii_hexdigit()
                }
            })
        {
            return Err("Invalid private knowledge identity".into());
        }
        Ok(())
    }
    pub fn knowledge_put(
        &mut self,
        kind: &str,
        id: &str,
        version: u32,
        body: &[u8],
    ) -> Result<u32> {
        Self::knowledge_identity(kind, id)?;
        if body.is_empty() || body.len() > 16384 || std::str::from_utf8(body).is_err() {
            return Err("Invalid private knowledge content".into());
        }
        let next = version.checked_add(1).ok_or("Version exhausted")?;
        let encrypted = encrypt(
            &self.key,
            body,
            &aad(
                "polytalk.knowledge.v1",
                &format!("{kind}:{id}"),
                &next.to_string(),
            ),
        )?;
        let tx = self.db.transaction()?;
        let current: Option<u32> = {
            use rusqlite::OptionalExtension;
            tx.query_row(
                "SELECT version FROM private_knowledge WHERE kind=?1 AND id=?2",
                params![kind, id],
                |r| r.get(0),
            )
            .optional()?
        };
        if current.unwrap_or(0) != version {
            return Err("Private knowledge version changed".into());
        }
        if current.is_none()
            && tx.query_row("SELECT count(*) FROM private_knowledge", [], |r| {
                r.get::<_, u32>(0)
            })? >= 1000
        {
            return Err("Private knowledge quota reached".into());
        }
        tx.execute("INSERT INTO private_knowledge VALUES(?1,?2,?3,?4) ON CONFLICT(kind,id) DO UPDATE SET version=excluded.version,body=excluded.body",params![kind,id,next,encrypted])?;
        tx.commit()?;
        Ok(next)
    }
    pub fn knowledge_get(&self, kind: &str, id: &str) -> Result<Option<(u32, Vec<u8>)>> {
        Self::knowledge_identity(kind, id)?;
        use rusqlite::OptionalExtension;
        let row:Option<(u32,Vec<u8>)>=self.db.query_row("SELECT version,body FROM private_knowledge WHERE kind=?1 AND id=?2 AND body IS NOT NULL",params![kind,id],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        row.map(|(version, body)| {
            Ok((
                version,
                decrypt(
                    &self.key,
                    &body,
                    &aad(
                        "polytalk.knowledge.v1",
                        &format!("{kind}:{id}"),
                        &version.to_string(),
                    ),
                )?,
            ))
        })
        .transpose()
    }
    pub fn knowledge_list(&self, kind: &str) -> Result<Vec<(String, u32)>> {
        if !["memory", "skill"].contains(&kind) {
            return Err("Invalid private knowledge kind".into());
        }
        let mut statement=self.db.prepare("SELECT id,version FROM private_knowledge WHERE kind=?1 AND body IS NOT NULL ORDER BY id LIMIT 1000")?;
        Ok(statement
            .query_map([kind], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?)
    }
    pub fn knowledge_delete(&mut self, kind: &str, id: &str, version: u32) -> Result<()> {
        Self::knowledge_identity(kind, id)?;
        let next = version.checked_add(1).ok_or("Version exhausted")?;
        if self.db.execute("UPDATE private_knowledge SET body=NULL,version=?1 WHERE kind=?2 AND id=?3 AND version=?4 AND body IS NOT NULL",params![next,kind,id,version])?!=1 {return Err("Private knowledge version changed".into());}
        Ok(())
    }
    pub fn save_secret(&mut self, name: &str, value: &[u8]) -> Result<()> {
        if (!(name.starts_with("anchor:") && name.len() < 1024)
            && !["session", "cursor"].contains(&name))
            || value.len() > 65536
        {
            return Err("Invalid secret record".into());
        }
        let encrypted = encrypt(
            &self.key,
            value,
            format!("polytalk.secret.v1:{name}").as_bytes(),
        )?;
        self.db.execute("INSERT INTO metadata(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![name,encrypted])?;
        Ok(())
    }
    pub fn load_secret(&self, name: &str) -> Result<Option<Vec<u8>>> {
        use rusqlite::OptionalExtension;
        let bytes: Option<Vec<u8>> = self
            .db
            .query_row("SELECT value FROM metadata WHERE key=?1", [name], |r| {
                r.get(0)
            })
            .optional()?;
        bytes
            .map(|value| {
                decrypt(
                    &self.key,
                    &value,
                    format!("polytalk.secret.v1:{name}").as_bytes(),
                )
            })
            .transpose()
    }
    pub fn receive(&mut self, room: &str, event: &str, sender: &str, body: &[u8]) -> Result<bool> {
        if room.is_empty()
            || event.is_empty()
            || sender.is_empty()
            || room.len() > 1024
            || event.len() > 1024
            || sender.len() > 255
            || body.len() > 1048576
        {
            return Err("Invalid or oversized message".into());
        }
        let encrypted = encrypt(&self.key, body, &aad(room, event, sender))?;
        Ok(self.db.execute(
            "INSERT OR IGNORE INTO inbox(room,event,sender,body) VALUES(?1,?2,?3,?4)",
            params![room, event, sender, encrypted],
        )? == 1)
    }
    pub fn commit_history(
        &mut self,
        room: &str,
        anchor: Option<&str>,
        messages: &[(String, String, Vec<u8>)],
    ) -> Result<()> {
        let secret = format!("anchor:{room}");
        if room.is_empty()
            || secret.len() >= 1024
            || messages.len() > 10000
            || anchor.is_some_and(|id| id.is_empty() || id.len() > 1024)
        {
            return Err("Invalid history batch".into());
        }
        let mut records = Vec::new();
        let mut size = 0;
        for (id, sender, body) in messages {
            size += body.len();
            if id.is_empty()
                || id.len() > 1024
                || sender.is_empty()
                || sender.len() > 255
                || body.len() > 1048576
                || size > 16 * 1024 * 1024
            {
                return Err("Invalid history batch".into());
            }
            records.push((
                id,
                sender,
                encrypt(&self.key, body, &aad(room, id, sender))?,
            ));
        }
        let encrypted_anchor = anchor
            .map(|value| {
                encrypt(
                    &self.key,
                    value.as_bytes(),
                    format!("polytalk.secret.v1:{secret}").as_bytes(),
                )
            })
            .transpose()?;
        let tx = self.db.transaction()?;
        for (id, sender, body) in records {
            tx.execute(
                "INSERT OR IGNORE INTO inbox(room,event,sender,body) VALUES(?1,?2,?3,?4)",
                params![room, id, sender, body],
            )?;
        }
        if let Some(value) = encrypted_anchor {
            tx.execute("INSERT INTO metadata(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![secret,value])?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn receipt_pending(&self, allowed: impl Fn(&str) -> bool) -> Result<Vec<(String, String)>> {
        let mut query = self
            .db
            .prepare("SELECT room,event,sender FROM inbox WHERE receipt_sent=0 ORDER BY rowid")?;
        let mut result = Vec::new();
        for row in query.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })? {
            let (room, event, sender) = row?;
            if allowed(&sender) {
                result.push((room, event));
                if result.len() == 100 {
                    break;
                }
            }
        }
        Ok(result)
    }
    pub fn receipt_sent(&mut self, room: &str, event: &str) -> Result<()> {
        if self.db.execute(
            "UPDATE inbox SET receipt_sent=1 WHERE room=?1 AND event=?2",
            params![room, event],
        )? != 1
        {
            return Err("Unknown receipt message".into());
        }
        Ok(())
    }
    pub fn pending(&mut self, allowed: impl Fn(&str) -> bool) -> Result<Vec<Message>> {
        let mut statement = self.db.prepare(
            "SELECT room,event,sender,body,notified FROM inbox WHERE processed=0 ORDER BY rowid",
        )?;
        let records = statement.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Vec<u8>>(3)?,
                r.get::<_, bool>(4)?,
            ))
        })?;
        let mut result = Vec::new();
        let mut total_bytes = 0usize;
        for record in records {
            let (room_id, event_id, sender, body, notified) = record?;
            if !allowed(&sender) {
                continue;
            }
            let body = decrypt(&self.key, &body, &aad(&room_id, &event_id, &sender))?;
            if !result.is_empty() && total_bytes + body.len() > 1048576 {
                break;
            }
            total_bytes += body.len();
            result.push(Message {
                room_id,
                event_id,
                sender,
                body,
                notified,
            });
            if result.len() == 100 {
                break;
            }
        }
        Ok(result)
    }
    pub fn contains(&self, room: &str, event: &str) -> Result<bool> {
        Ok(self.db.query_row(
            "SELECT EXISTS(SELECT 1 FROM inbox WHERE room=?1 AND event=?2)",
            params![room, event],
            |r| r.get(0),
        )?)
    }
    pub fn notified(&mut self, room: &str, event: &str) -> Result<()> {
        self.mark(room, event, "notified")
    }
    pub fn ack(&mut self, room: &str, event: &str) -> Result<()> {
        self.mark(room, event, "processed")
    }
    fn mark(&mut self, room: &str, event: &str, column: &str) -> Result<()> {
        let sql = match column {
            "notified" => "UPDATE inbox SET notified=1 WHERE room=?1 AND event=?2",
            _ => "UPDATE inbox SET processed=1 WHERE room=?1 AND event=?2",
        };
        if self.db.execute(sql, params![room, event])? != 1 {
            return Err("Unknown message".into());
        }
        Ok(())
    }
}
