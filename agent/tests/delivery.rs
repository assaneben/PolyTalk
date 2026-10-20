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
use polytalk_agent::inbox::Inbox;
#[test]
fn crash_before_ack_replays_stable_id_and_duplicate_does_not_replace_payload() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("inbox.db");
    {
        let mut inbox = Inbox::open(&path, "a strong distinct local password").unwrap();
        assert!(
            inbox
                .receive("!room:local", "$event", "@a:local", b"hello")
                .unwrap()
        );
        assert!(
            !inbox
                .receive("!room:local", "$event", "@a:local", b"changed")
                .unwrap()
        );
    }
    let mut inbox = Inbox::open(&path, "a strong distinct local password").unwrap();
    let messages = inbox.pending(|_| true).unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].body, b"hello");
    assert_eq!(messages[0].event_id, "$event");
    inbox.ack("!room:local", "$event").unwrap();
    drop(inbox);
    assert!(
        Inbox::open(&path, "a strong distinct local password")
            .unwrap()
            .pending(|_| true)
            .unwrap()
            .is_empty()
    );
}
#[test]
fn delivery_rechecks_policy_and_wrong_password_fails_closed() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("inbox.db");
    let mut inbox = Inbox::open(&path, "a strong distinct local password").unwrap();
    inbox
        .receive(
            "!room:local",
            "$event",
            "@blocked:local",
            b"private message",
        )
        .unwrap();
    assert!(inbox.pending(|_| false).unwrap().is_empty());
    drop(inbox);
    assert!(Inbox::open(&path, "wrong password is sufficiently long").is_err());
    let bytes = std::fs::read(&path).unwrap();
    assert!(
        !bytes
            .windows(b"private message".len())
            .any(|x| x == b"private message")
    );
}
#[test]
fn notified_message_replays_until_explicit_processing_ack_and_tampering_is_detected() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("inbox.db");
    let password = "a strong distinct local password";
    let mut inbox = Inbox::open(&path, password).unwrap();
    inbox
        .receive("!r:local", "$e", "@a:local", b"payload")
        .unwrap();
    inbox.notified("!r:local", "$e").unwrap();
    drop(inbox);
    let mut inbox = Inbox::open(&path, password).unwrap();
    let pending = inbox.pending(|_| true).unwrap();
    assert_eq!(pending.len(), 1);
    assert!(pending[0].notified);
    drop(inbox);
    let db = rusqlite::Connection::open(&path).unwrap();
    db.execute("UPDATE inbox SET sender='@attacker:local'", [])
        .unwrap();
    drop(db);
    assert!(
        Inbox::open(&path, password)
            .unwrap()
            .pending(|_| true)
            .is_err()
    );
}
#[test]
fn saved_session_without_original_crypto_store_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    assert!(polytalk_agent::resume::require_crypto_store(dir.path(), true).is_err());
    assert!(polytalk_agent::resume::require_crypto_store(dir.path(), false).is_ok());
    std::fs::write(dir.path().join("matrix-sdk-state.sqlite3"), b"fixture").unwrap();
    assert!(polytalk_agent::resume::require_crypto_store(dir.path(), true).is_err());
}
#[test]
fn access_token_and_cursor_are_encrypted_and_survive_reopening() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("inbox.db");
    let password = "a strong distinct local password";
    let mut inbox = Inbox::open(&path, password).unwrap();
    inbox
        .save_secret("session", b"private-access-token")
        .unwrap();
    inbox.save_secret("cursor", b"position-1").unwrap();
    drop(inbox);
    let inbox = Inbox::open(&path, password).unwrap();
    assert_eq!(
        inbox.load_secret("session").unwrap().unwrap(),
        b"private-access-token"
    );
    assert_eq!(inbox.load_secret("cursor").unwrap().unwrap(), b"position-1");
    let bytes = std::fs::read(path).unwrap();
    assert!(
        !bytes
            .windows(20)
            .any(|value| value == b"private-access-token")
    );
}
#[test]
fn delivery_batches_are_bounded_without_dropping_the_next_message() {
    let dir = tempfile::tempdir().unwrap();
    let mut inbox = Inbox::open(
        &dir.path().join("inbox.db"),
        "a strong distinct local password",
    )
    .unwrap();
    let body = vec![b'x'; 700000];
    inbox.receive("!room", "$first", "@a:local", &body).unwrap();
    inbox.receive("!room", "$next", "@a:local", &body).unwrap();
    let messages = inbox.pending(|_| true).unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].event_id, "$first");
    inbox.ack("!room", "$first").unwrap();
    assert_eq!(inbox.pending(|_| true).unwrap()[0].event_id, "$next");
}
#[test]
fn a_backlog_larger_than_the_remote_quota_advances_locally_and_retries_only_unsent_receipts() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("backlog.sqlite");
    let password = "A long durable outbox password";
    let mut inbox = Inbox::open(&path, password).unwrap();
    let messages = (0..150)
        .map(|i| {
            (
                format!("$event-{i}"),
                "@sender:local".to_string(),
                b"payload".to_vec(),
            )
        })
        .collect::<Vec<_>>();
    inbox
        .commit_history("!room", Some("$event-149"), &messages)
        .unwrap();
    let receipts = inbox.receipt_pending(|_| true).unwrap();
    assert_eq!(receipts.len(), 100);
    for (room, event) in receipts.iter().take(90) {
        inbox.receipt_sent(room, event).unwrap();
    }
    // A simulated remote 429 and process exit must never roll back local history.
    drop(inbox);
    let mut inbox = Inbox::open(&path, password).unwrap();
    assert_eq!(
        inbox.load_secret("anchor:!room").unwrap().unwrap(),
        b"$event-149"
    );
    assert_eq!(inbox.pending(|_| true).unwrap().len(), 100);
    let pending = inbox.receipt_pending(|_| true).unwrap();
    assert_eq!(pending.len(), 60);
    assert_eq!(pending[0].1, "$event-90");
    assert!(inbox.receipt_pending(|_| false).unwrap().is_empty());
    for (room, event) in pending {
        inbox.receipt_sent(&room, &event).unwrap();
    }
    assert!(inbox.receipt_pending(|_| true).unwrap().is_empty());
}
#[test]
fn local_history_and_anchor_roll_back_together_when_metadata_cannot_commit(){
 let dir=tempfile::tempdir().unwrap();let path=dir.path().join("atomic-history.sqlite");let mut inbox=Inbox::open(&path,"A long atomic history password").unwrap();
 let db=rusqlite::Connection::open(&path).unwrap();db.execute_batch("CREATE TRIGGER reject_anchor BEFORE INSERT ON metadata WHEN NEW.key='anchor:!atomic' BEGIN SELECT RAISE(ABORT,'anchor unavailable'); END;").unwrap();drop(db);
 assert!(inbox.commit_history("!atomic",Some("$event"),&[("$event".into(),"@sender:local".into(),b"message".to_vec())]).is_err());
 assert!(!inbox.contains("!atomic","$event").unwrap());assert!(inbox.load_secret("anchor:!atomic").unwrap().is_none());
}
