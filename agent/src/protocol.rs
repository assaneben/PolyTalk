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
use crate::inbox::Result;
use serde::Deserialize;
use serde_json::Value;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub v: u8,
    pub id: String,
    pub method: String,
    pub params: Value,
}
pub fn parse(line: &str) -> Result<Request> {
    if line.len() > 65536 {
        return Err("Command too large".into());
    }
    let request: Request = serde_json::from_str(line)?;
    if request.v != 1 || request.id.is_empty() || request.id.len() > 128 {
        return Err("Unsupported version or correlation id".into());
    }
    let params = request.params.as_object().ok_or("Object params required")?;
    if request.method == "knowledge" {
        let operation = params
            .get("operation")
            .and_then(Value::as_str)
            .ok_or("Missing knowledge operation")?;
        let fields: &[&str] = match operation {
            "list" => &["operation", "kind"],
            "get" => &["operation", "kind", "id"],
            "put" => &["operation", "kind", "id", "version", "text"],
            "delete" => &["operation", "kind", "id", "version"],
            _ => return Err("Unsupported knowledge operation".into()),
        };
        if params.len() != fields.len() || params.keys().any(|key| !fields.contains(&key.as_str()))
        {
            return Err("Invalid knowledge fields".into());
        }
        if !params["kind"]
            .as_str()
            .is_some_and(|s| ["memory", "skill"].contains(&s))
        {
            return Err("Private knowledge kind required".into());
        }
        if operation != "list" {
            let id = params["id"].as_str().ok_or("Missing knowledge id")?;
            if id.len() != 36
                || id.char_indices().any(|(i, c)| {
                    if [8, 13, 18, 23].contains(&i) {
                        c != '-'
                    } else {
                        !c.is_ascii_hexdigit()
                    }
                })
            {
                return Err("Invalid knowledge id".into());
            }
        }
        if ["put", "delete"].contains(&operation)
            && !params["version"]
                .as_u64()
                .is_some_and(|v| v < u32::MAX as u64)
        {
            return Err("Invalid knowledge version".into());
        }
        if operation == "put"
            && !params["text"]
                .as_str()
                .is_some_and(|s| !s.trim().is_empty() && s.len() <= 16384)
        {
            return Err("Invalid knowledge text".into());
        }
        return Ok(request);
    }
    if request.method == "coordination" {
        if params
            .keys()
            .any(|key| !["operation", "data", "id"].contains(&key.as_str()))
            || !params.get("data").is_some_and(Value::is_object)
        {
            return Err("Invalid coordination envelope".into());
        }
        let operation = params
            .get("operation")
            .and_then(Value::as_str)
            .ok_or("Missing operation")?;
        if ![
            "tasks",
            "register",
            "transition",
            "create",
            "request_approval",
            "approvals",
            "policy",
        ]
        .contains(&operation)
        {
            return Err("Unsupported coordination operation".into());
        }
        if ["transition", "policy"].contains(&operation) {
            let id = params
                .get("id")
                .and_then(Value::as_str)
                .ok_or("Missing task id")?;
            if id.len() != 36
                || id.char_indices().any(|(i, c)| {
                    if [8, 13, 18, 23].contains(&i) {
                        c != '-'
                    } else {
                        !c.is_ascii_hexdigit()
                    }
                })
            {
                return Err("Invalid task id".into());
            }
        } else if params.contains_key("id") {
            return Err("Unexpected task id".into());
        }
        if operation == "tasks" {
            let data = params["data"].as_object().unwrap();
            if data.keys().any(|key| key != "after") {
                return Err("Unknown pagination parameter".into());
            }
            if let Some(after) = data.get("after") {
                let cursor = after.as_str().ok_or("Invalid pagination cursor")?;
                if cursor.len() != 36
                    || cursor.char_indices().any(|(i, c)| {
                        if [8, 13, 18, 23].contains(&i) {
                            c != '-'
                        } else {
                            !c.is_ascii_hexdigit()
                        }
                    })
                {
                    return Err("Invalid pagination cursor".into());
                }
            }
        }
        if ["approvals", "policy"].contains(&operation)
            && !params["data"].as_object().unwrap().is_empty()
        {
            return Err("Read operation takes no data".into());
        }
        return Ok(request);
    }
    let fields: &[&str] = match request.method.as_str() {
        "login" => &["username", "password"],
        "send" => &["room_id", "text"],
        "join" => &["room_id"],
        "ack" => &["room_id", "event_id"],
        "listen" => &["timeout_ms"],
        "read" | "rooms" | "status" => &[],
        _ => return Err("Unsupported method".into()),
    };
    if params.keys().any(|key| !fields.contains(&key.as_str())) {
        return Err("Unknown parameter".into());
    }
    if request.method == "listen" {
        if params
            .get("timeout_ms")
            .and_then(Value::as_u64)
            .is_none_or(|value| value > 30000)
        {
            return Err("Timeout must be between 0 and 30000 ms".into());
        }
    } else {
        for field in fields {
            let text = params
                .get(*field)
                .and_then(Value::as_str)
                .ok_or("Missing text parameter")?;
            let max = if *field == "text" { 20000 } else { 1024 };
            if text.trim().is_empty() || text.len() > max {
                return Err("Invalid text parameter".into());
            }
        }
    }
    Ok(request)
}
