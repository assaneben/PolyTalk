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
use polytalk_agent::protocol::parse;
#[test]
fn task_pagination_accepts_only_a_uuid_cursor_not_paths_or_http_options() {
    assert!(parse(r#"{"v":1,"id":"1","method":"coordination","params":{"operation":"tasks","data":{"after":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}}}"#).is_ok());
    for data in [
        r#"{"after":"?url=https://evil.invalid"}"#,
        r#"{"after":3}"#,
        r#"{"url":"https://evil.invalid"}"#,
        r#"{"after":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","method":"POST"}"#,
    ] {
        let request = format!(
            r#"{{"v":1,"id":"1","method":"coordination","params":{{"operation":"tasks","data":{data}}}}}"#
        );
        assert!(parse(&request).is_err());
    }
}
#[test]
fn malformed_unknown_and_oversized_commands_are_refused() {
    for line in [
        r#"{"v":2,"id":"1","method":"read","params":{}}"#,
        r#"{"v":1,"id":"1","method":"exec","params":{}}"#,
        r#"{"v":1,"id":"1","method":"read","params":{"token":"secret"}}"#,
    ] {
        assert!(parse(line).is_err());
    }
    assert!(parse(&"x".repeat(65537)).is_err());
}
#[test]
fn bounded_listen_and_text_send_have_versioned_correlations() {
    let request =
        parse(r#"{"v":1,"id":"req-1","method":"listen","params":{"timeout_ms":1000}}"#).unwrap();
    assert_eq!(request.id, "req-1");
    assert!(parse(r#"{"v":1,"id":"1","method":"listen","params":{"timeout_ms":31000}}"#).is_err());
    assert!(
        parse(r#"{"v":1,"id":"1","method":"send","params":{"room_id":"!r:local","text":"hello"}}"#)
            .is_ok()
    );
}
#[test]
fn coordination_cannot_choose_urls_methods_or_operator_approvals() {
    assert!(
        parse(
            r#"{"v":1,"id":"1","method":"coordination","params":{"operation":"tasks","data":{}}}"#
        )
        .is_ok()
    );
    for params in [
        r#"{"operation":"https://evil.invalid","data":{}}"#,
        r#"{"operation":"approve","data":{}}"#,
        r#"{"operation":"tasks","data":{},"url":"https://evil.invalid"}"#,
        r#"{"operation":"transition","data":{},"id":"../../admin"}"#,
    ] {
        assert!(
            parse(&format!(
                r#"{{"v":1,"id":"1","method":"coordination","params":{params}}}"#
            ))
            .is_err()
        );
    }
}

#[test]
fn private_knowledge_refuses_shared_scopes_and_unknown_fields() {
    assert!(
        parse(
            r#"{"v":1,"id":"1","method":"knowledge","params":{"operation":"list","kind":"memory"}}"#
        )
        .is_ok()
    );
    assert!(parse(r#"{"v":1,"id":"1","method":"knowledge","params":{"operation":"list","kind":"channel"}}"#).is_err());
    assert!(parse(r#"{"v":1,"id":"1","method":"knowledge","params":{"operation":"list","kind":"skill","room":"!r"}}"#).is_err());
}
