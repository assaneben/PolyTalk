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
#[test]
fn private_knowledge_is_encrypted_versioned_and_separate_from_messages() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("knowledge.sqlite");
    let mut inbox =
        polytalk_agent::inbox::Inbox::open(&path, "A long local knowledge password").unwrap();
    let id = "12345678-1234-4234-8234-123456789abc";
    assert_eq!(
        inbox
            .knowledge_put("memory", id, 0, b"private-fact-unique")
            .unwrap(),
        1
    );
    assert!(inbox.knowledge_get("skill", id).unwrap().is_none());
    assert!(inbox.knowledge_put("memory", id, 0, b"overwrite").is_err());
    assert_eq!(
        inbox.knowledge_get("memory", id).unwrap().unwrap().1,
        b"private-fact-unique"
    );
    assert!(inbox.knowledge_put("channel", id, 0, b"no").is_err());
    assert_eq!(inbox.knowledge_list("memory").unwrap().len(), 1);
    drop(inbox);
    let raw = std::fs::read(&path).unwrap();
    assert!(
        !raw.windows(b"private-fact-unique".len())
            .any(|part| part == b"private-fact-unique")
    );
    let mut inbox =
        polytalk_agent::inbox::Inbox::open(&path, "A long local knowledge password").unwrap();
    assert_eq!(inbox.knowledge_get("memory", id).unwrap().unwrap().0, 1);
    assert!(inbox.knowledge_delete("memory", id, 2).is_err());
    inbox.knowledge_delete("memory", id, 1).unwrap();
    assert!(inbox.knowledge_get("memory", id).unwrap().is_none());
    assert!(
        inbox
            .knowledge_put("memory", id, 0, b"stale recreate")
            .is_err()
    );
}

#[test]
fn swapping_ciphertext_between_private_scopes_fails_authentication() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("knowledge.sqlite");
    let id = "12345678-1234-4234-8234-123456789abc";
    let mut inbox =
        polytalk_agent::inbox::Inbox::open(&path, "Long private knowledge passphrase").unwrap();
    inbox
        .knowledge_put("memory", id, 0, b"private memory")
        .unwrap();
    inbox
        .knowledge_put("skill", id, 0, b"private procedure")
        .unwrap();
    drop(inbox);
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute("UPDATE private_knowledge SET body=(SELECT body FROM private_knowledge WHERE kind='memory') WHERE kind='skill'",[]).unwrap();
    drop(db);
    let inbox =
        polytalk_agent::inbox::Inbox::open(&path, "Long private knowledge passphrase").unwrap();
    assert!(inbox.knowledge_get("skill", id).is_err());
    assert!(inbox.knowledge_get("memory", id).is_ok());
}
