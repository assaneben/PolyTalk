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
use matrix_sdk::{
    Client, RoomMemberships, RoomState,
    authentication::matrix::MatrixSession,
    config::{RequestConfig, SyncSettings},
    deserialized_responses::TimelineEventKind,
    room::MessagesOptions,
    ruma::{RoomId, events::room::message::RoomMessageEventContent},
};
use polytalk_agent::{
    inbox::{Inbox, Result},
    protocol::{self, Request},
    resume::{prepare_directory, require_crypto_store},
};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    fs::OpenOptions,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use zeroize::Zeroizing;
struct PhaseSubscriber;
impl tracing::Subscriber for PhaseSubscriber {
    fn enabled(&self, metadata: &tracing::Metadata<'_>) -> bool {
        let target = metadata.target();
        target.starts_with("matrix_sdk::room")
            || target.starts_with("matrix_sdk::encryption")
            || target.starts_with("matrix_sdk::http_client")
    }
    fn new_span(&self, _: &tracing::span::Attributes<'_>) -> tracing::span::Id {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        tracing::span::Id::from_u64(NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed))
    }
    fn record(&self, _: &tracing::span::Id, _: &tracing::span::Record<'_>) {}
    fn record_follows_from(&self, _: &tracing::span::Id, _: &tracing::span::Id) {}
    fn event(&self, event: &tracing::Event<'_>) {
        let metadata = event.metadata();
        eprintln!(
            "NATIVE_PHASE {}:{}",
            metadata.target(),
            metadata.line().unwrap_or(0)
        );
    }
    fn enter(&self, _: &tracing::span::Id) {}
    fn exit(&self, _: &tracing::span::Id) {}
}
#[derive(Serialize, Deserialize)]
struct SavedSession {
    origin: String,
    session: MatrixSession,
    identity: String,
}
#[derive(Clone)]
struct Agent {
    client: Client,
    http: reqwest::Client,
    origin: String,
    inbox: Arc<Mutex<Inbox>>,
    started: Arc<AtomicBool>,
    synced: Arc<AtomicBool>,
    complete: Arc<AtomicBool>,
    history_issues: Arc<Mutex<Vec<Value>>>,
    ready: bool,
}
impl Agent {
    async fn open(path: &Path, origin: String, password: &str) -> Result<Self> {
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(20))
            .build()?;
        let inbox = Inbox::open(&path.join("inbox.sqlite3"), password)?;
        let saved = inbox
            .load_secret("session")?
            .map(|bytes| serde_json::from_slice::<SavedSession>(&bytes))
            .transpose()?;
        let crypto = path.join("matrix");
        prepare_directory(&crypto)?;
        require_crypto_store(&crypto, saved.is_some())?;
        if saved.as_ref().is_some_and(|saved| saved.origin != origin) {
            return Err("This store belongs to another installation".into());
        }
        let client = Client::builder()
            .homeserver_url(&origin)
            .cross_process_store_config(
                matrix_sdk::cross_process_lock::CrossProcessLockConfig::SingleProcess,
            )
            .http_client(http.clone())
            .request_config(
                RequestConfig::default()
                    .disable_retry()
                    .timeout(Duration::from_secs(15)),
            )
            .sqlite_store(&crypto, Some(password))
            .build()
            .await?;
        let mut agent = Self {
            client,
            http,
            origin,
            inbox: Arc::new(Mutex::new(inbox)),
            started: Arc::new(AtomicBool::new(false)),
            synced: Arc::new(AtomicBool::new(false)),
            complete: Arc::new(AtomicBool::new(false)),
            history_issues: Arc::new(Mutex::new(Vec::new())),
            ready: false,
        };
        if let Some(saved) = saved {
            agent.client.restore_session(saved.session).await?;
            if agent.identity().await? != saved.identity {
                return Err("Device identity changed; restore original store".into());
            }
            agent.ready = true;
        }
        if agent.ready {
            agent.start_worker();
        }
        Ok(agent)
    }
    async fn identity(&self) -> Result<String> {
        let device = self
            .client
            .encryption()
            .get_own_device()
            .await?
            .ok_or("Device unavailable")?;
        Ok(device
            .curve25519_key()
            .ok_or("Missing device key")?
            .to_base64())
    }
    async fn api(&self, path: &str, body: Option<Value>) -> Result<Value> {
        let method = if body.is_some() {
            reqwest::Method::POST
        } else {
            reqwest::Method::GET
        };
        self.api_method(path, body, method).await
    }
    async fn api_method(
        &self,
        path: &str,
        body: Option<Value>,
        method: reqwest::Method,
    ) -> Result<Value> {
        let token = self.client.access_token().ok_or("Login required")?;
        let request = self
            .http
            .request(method, format!("{}/api{path}", self.origin));
        let request = if let Some(body) = body {
            request.json(&body)
        } else {
            request
        };
        let response = request
            .bearer_auth(token)
            .header("Origin", &self.origin)
            .send()
            .await?;
        if !response.status().is_success() {
            return Err(match response.status().as_u16() {
                429 => "RATE_LIMITED",
                401 => "AUTH_REQUIRED",
                403 => "ACCESS_DENIED",
                _ => "API_UNAVAILABLE",
            }
            .into());
        }
        Ok(response.json().await?)
    }
    async fn receipt(&self, room: &str, event: &str, state: &str) -> Result<()> {
        self.api(
            "/receipts",
            Some(json!({"roomId":room,"eventId":event,"state":state})),
        )
        .await?;
        Ok(())
    }
    async fn login(&mut self, username: &str, password: &str) -> Result<Value> {
        if self.ready {
            return Err("Existing account: use a separate store for another identity".into());
        }
        self.client
            .matrix_auth()
            .login_username(username, password)
            .initial_device_display_name("PolyTalk Agent")
            .send()
            .await?;
        let session = self
            .client
            .matrix_auth()
            .session()
            .ok_or("Missing session")?;
        let saved = SavedSession {
            origin: self.origin.clone(),
            session,
            identity: self.identity().await?,
        };
        self.inbox
            .lock()
            .map_err(|_| "Local journal lock unavailable")?
            .save_secret("session", &serde_json::to_vec(&saved)?)?;
        self.ready = true;
        self.start_worker();
        Ok(self.status())
    }
    fn status(&self) -> Value {
        json!({"protocol_version":1,"store_mode":"exclusive-process","sdk":"matrix-rust/0.19.1","authenticated":self.ready,"catch_up_complete":self.complete.load(Ordering::SeqCst),"history_issues":self.history_issues.lock().map(|issues|issues.clone()).unwrap_or_default(),"user_id":self.client.user_id().map(|id|id.as_str()),"device_id":self.client.device_id().map(|id|id.as_str())})
    }
    fn start_worker(&self) {
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }
        let presence = self.clone();
        tokio::spawn(async move {
            loop {
                let _ = presence
                    .api("/coordination/agents/me/heartbeat", Some(json!({})))
                    .await;
                tokio::time::sleep(Duration::from_secs(45)).await;
            }
        });
        let mut worker = self.clone();
        tokio::spawn(async move {
            let mut announced = std::collections::HashSet::new();
            loop {
                let complete = worker.catch_up().await.is_ok();
                worker.complete.store(complete, Ordering::SeqCst);
                let _ = worker.flush_receipts().await;
                if let Ok(messages) = worker.pending().await {
                    let current: std::collections::HashSet<_> = messages
                        .iter()
                        .map(|message| {
                            (
                                message["room_id"].as_str().unwrap().to_owned(),
                                message["event_id"].as_str().unwrap().to_owned(),
                            )
                        })
                        .collect();
                    announced.retain(|id| current.contains(id));
                    for message in messages {
                        let room = message["room_id"].as_str().unwrap();
                        let event = message["event_id"].as_str().unwrap();
                        let key = (room.to_owned(), event.to_owned());
                        if announced.contains(&key) {
                            continue;
                        }
                        let Ok(policy) = worker.api("/policy", None).await else {
                            break;
                        };
                        if !allowed(&policy, message["sender"].as_str().unwrap_or("")) {
                            continue;
                        }
                        if output(&json!({"v":1,"event":"message.available","room_id":room,"event_id":event,"sender":message["sender"]})).is_err(){return;}
                        let marked = worker
                            .inbox
                            .lock()
                            .map_err(|_| "Local journal lock unavailable")
                            .and_then(|mut inbox| {
                                inbox
                                    .notified(room, event)
                                    .map_err(|_| "Journal update failed")
                            });
                        if marked.is_err() {
                            break;
                        }
                        if worker.receipt(room, event, "notified").await.is_err() {
                            break;
                        }
                        let _ = worker
                            .inbox
                            .lock()
                            .map(|mut inbox| inbox.receipt_sent(room, event));
                        announced.insert(key);
                    }
                }
                if !complete {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        });
    }
    async fn initial_sync(&self) {
        while !self.synced.load(Ordering::SeqCst) {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
    async fn catch_up(&mut self) -> Result<()> {
        self.client
            .sync_once(SyncSettings::default().timeout(Duration::from_secs(20)))
            .await?;
        self.complete.store(false, Ordering::SeqCst);
        self.synced.store(true, Ordering::SeqCst);
        let rooms = self.client.joined_rooms();
        let mut issues = Vec::new();
        for room in rooms {
            if let Err(error) = self.catch_up_room(&room).await {
                let code = if error.to_string() == "HISTORY_KEYS_PENDING" {
                    "keys_pending"
                } else {
                    "history_unavailable"
                };
                if issues.len() < 100 {
                    issues.push(json!({"room_id":room.room_id(),"state":code}));
                }
            }
        }
        let complete = issues.is_empty();
        *self
            .history_issues
            .lock()
            .map_err(|_| "History status unavailable")? = issues;
        if complete {
            Ok(())
        } else {
            Err("HISTORY_KEYS_PENDING".into())
        }
    }
    async fn catch_up_room(&self, room: &matrix_sdk::Room) -> Result<()> {
        if !room.latest_encryption_state().await?.is_encrypted() {
            return Ok(());
        }
        let room_id = room.room_id().to_string();
        let secret = format!("anchor:{room_id}");
        let previous = self
            .inbox
            .lock()
            .map_err(|_| "Local journal lock unavailable")?
            .load_secret(&secret)?
            .map(String::from_utf8)
            .transpose()?;
        let mut from: Option<String> = None;
        let mut newest = None;
        let mut complete = false;
        let mut collected = Vec::new();
        let mut collected_size = 0usize;
        // Independent history anchors protect delivery even if the SDK persists its sync token before this journal.
        for _ in 0..100 {
            let mut options = MessagesOptions::backward().from(from.as_deref());
            options.limit = 100u32.into();
            let page = room.messages(options).await?;
            for event in &page.chunk {
                let raw: Value = serde_json::from_str(event.kind.raw().json().get())?;
                let id = raw
                    .get("event_id")
                    .and_then(Value::as_str)
                    .ok_or("Missing event id")?;
                if newest.is_none() {
                    newest = Some(id.to_owned());
                }
                if previous.as_deref() == Some(id) {
                    complete = true;
                    break;
                }
                if matches!(event.kind, TimelineEventKind::UnableToDecrypt { .. }) {
                    collected.reverse();
                    self.inbox
                        .lock()
                        .map_err(|_| "Local journal lock unavailable")?
                        .commit_history(&room_id, None, &collected)?;
                    return Err("HISTORY_KEYS_PENDING".into());
                }
                if raw["type"] != "m.room.message" {
                    continue;
                }
                if !matches!(event.kind, TimelineEventKind::Decrypted(_)) {
                    return Err("Plaintext message refused".into());
                }
                let sender = raw["sender"].as_str().ok_or("Missing sender")?;
                if Some(sender) == self.client.user_id().map(|id| id.as_str()) {
                    continue;
                }
                let content = serde_json::to_vec(&raw["content"])?;
                collected_size += content.len();
                if content.len() > 1048576 || collected_size > 16 * 1024 * 1024 {
                    return Err("History batch too large; anchor retained".into());
                }
                collected.push((id.to_owned(), sender.to_owned(), content));
            }
            if complete || page.chunk.is_empty() || page.end.is_none() {
                complete = true;
                break;
            }
            if page.end == from {
                return Err("History pagination did not advance".into());
            }
            from = page.end;
        }
        if !complete {
            return Err("History exceeds bounded catch-up; anchor retained".into());
        }
        collected.reverse();
        self.inbox
            .lock()
            .map_err(|_| "Local journal lock unavailable")?
            .commit_history(&room_id, newest.as_deref(), &collected)?;
        Ok(())
    }
    async fn flush_receipts(&self) -> Result<()> {
        let policy = self.api("/policy", None).await?;
        let receipts = self
            .inbox
            .lock()
            .map_err(|_| "Local journal lock unavailable")?
            .receipt_pending(|sender| allowed(&policy, sender))?;
        for (room, event) in receipts.into_iter().take(8) {
            match self.receipt(&room, &event, "received").await {
                Ok(()) => self
                    .inbox
                    .lock()
                    .map_err(|_| "Local journal lock unavailable")?
                    .receipt_sent(&room, &event)?,
                Err(error) if error.to_string() == "ACCESS_DENIED" => continue,
                Err(_) => break,
            }
        }
        Ok(())
    }
    async fn pending(&mut self) -> Result<Vec<Value>> {
        let policy = self.api("/policy", None).await?;
        let messages = self
            .inbox
            .lock()
            .map_err(|_| "Local journal lock unavailable")?
            .pending(|sender| allowed(&policy, sender))?;
        messages.into_iter().map(|message|Ok(json!({"room_id":message.room_id,"event_id":message.event_id,"sender":message.sender,"content":serde_json::from_slice::<Value>(&message.body)?,"notified":message.notified}))).collect()
    }
    async fn command(&mut self, request: &Request) -> Result<Value> {
        let p = &request.params;
        let text = |key: &str| p[key].as_str().unwrap_or("");
        if request.method == "status" {
            return Ok(self.status());
        }
        if request.method == "login" {
            return self.login(text("username"), text("password")).await;
        }
        if !self.ready {
            return Err("Login required".into());
        }
        if request.method == "knowledge" {
            let mut inbox = self
                .inbox
                .lock()
                .map_err(|_| "Local journal lock unavailable")?;
            let kind = text("kind");
            let id = text("id");
            let version = p["version"].as_u64().unwrap_or(0) as u32;
            return match text("operation") {
                "list" => Ok(
                    json!({"kind":kind,"entries":inbox.knowledge_list(kind)?.into_iter().map(|(id,version)|json!({"id":id,"version":version})).collect::<Vec<_>>()}),
                ),
                "get" => Ok(match inbox.knowledge_get(kind, id)? {
                    Some((version, body)) => {
                        json!({"kind":kind,"id":id,"version":version,"text":String::from_utf8(body)?})
                    }
                    None => json!({"entry":null}),
                }),
                "put" => Ok(
                    json!({"kind":kind,"id":id,"version":inbox.knowledge_put(kind,id,version,text("text").as_bytes())?}),
                ),
                "delete" => {
                    inbox.knowledge_delete(kind, id, version)?;
                    Ok(json!({"deleted":true}))
                }
                _ => Err("Unsupported knowledge operation".into()),
            };
        }
        if request.method == "coordination" {
            let id = text("id");
            let (path, method) = match text("operation") {
                "tasks" => {
                    let path = match p["data"].get("after").and_then(serde_json::Value::as_str) {
                        Some(after) => {
                            format!("/coordination/tasks?after={}", after.to_ascii_lowercase())
                        }
                        None => "/coordination/tasks".to_string(),
                    };
                    (path, reqwest::Method::GET)
                }
                "approvals" => ("/coordination/approvals".to_string(), reqwest::Method::GET),
                "register" => ("/coordination/agents/me".to_string(), reqwest::Method::PUT),
                "create" => ("/coordination/tasks".to_string(), reqwest::Method::POST),
                "request_approval" => {
                    ("/coordination/approvals".to_string(), reqwest::Method::POST)
                }
                "transition" => (format!("/coordination/tasks/{id}"), reqwest::Method::PUT),
                "policy" => (
                    format!("/coordination/tasks/{id}/delegation"),
                    reqwest::Method::GET,
                ),
                _ => return Err("Unsupported operation".into()),
            };
            let body = if method == reqwest::Method::GET {
                None
            } else {
                Some(p["data"].clone())
            };
            return self.api_method(&path, body, method).await;
        }
        match request.method.as_str() {
            "rooms" => {
                self.initial_sync().await;
                Ok(
                    json!({"rooms":self.client.rooms().iter().map(|room|json!({"room_id":room.room_id(),"state":format!("{:?}",room.state())})).collect::<Vec<_>>()}),
                )
            }
            "join" => {
                let id = RoomId::parse(text("room_id"))?;
                let room = self.client.get_room(&id).ok_or("Unknown invitation")?;
                if room.state() != RoomState::Invited {
                    return Err("Invitation required".into());
                }
                room.join().await?;
                Ok(json!({"joined":id}))
            }
            "send" => {
                self.initial_sync().await;
                let id = RoomId::parse(text("room_id"))?;
                let room = self.client.get_room(&id).ok_or("Unknown room")?;
                if room.state() != RoomState::Joined
                    || !room.latest_encryption_state().await?.is_encrypted()
                {
                    return Err("Joined encrypted room required".into());
                }
                for member in room.members(RoomMemberships::ACTIVE).await? {
                    if Some(member.user_id()) == self.client.user_id() {
                        continue;
                    }
                    let policy = self
                        .api("/can-contact", Some(json!({"target":member.user_id()})))
                        .await?;
                    if policy["allowed"] != true {
                        return Err("ACCESS_DENIED".into());
                    }
                }
                let result = room
                    .send(RoomMessageEventContent::text_plain(text("text")))
                    .with_request_config(
                        RequestConfig::default()
                            .disable_retry()
                            .timeout(Duration::from_secs(15)),
                    )
                    .await?;
                Ok(json!({"event_id":result.response.event_id}))
            }
            "read" => {
                let complete = self.complete.load(Ordering::SeqCst);
                Ok(json!({"messages":self.pending().await?,"catch_up_complete":complete}))
            }
            "listen" => {
                let duration = Duration::from_millis(p["timeout_ms"].as_u64().unwrap_or(0));
                let deadline = tokio::time::Instant::now() + duration;
                loop {
                    let messages = self.pending().await?;
                    if !messages.is_empty() {
                        for message in &messages {
                            output(
                                &json!({"v":1,"event":"message.available","room_id":message["room_id"],"event_id":message["event_id"],"sender":message["sender"]}),
                            )?;
                            self.inbox
                                .lock()
                                .map_err(|_| "Local journal lock unavailable")?
                                .notified(
                                    message["room_id"].as_str().unwrap(),
                                    message["event_id"].as_str().unwrap(),
                                )?;
                            self.receipt(
                                message["room_id"].as_str().unwrap(),
                                message["event_id"].as_str().unwrap(),
                                "notified",
                            )
                            .await?;
                        }
                        return Ok(json!({"available":messages.len()}));
                    }
                    if tokio::time::Instant::now() >= deadline {
                        return Ok(json!({"available":0}));
                    }
                    tokio::time::sleep(
                        Duration::from_millis(1000)
                            .min(deadline.saturating_duration_since(tokio::time::Instant::now())),
                    )
                    .await;
                }
            }
            "ack" => {
                let room = text("room_id");
                let event = text("event_id");
                if !self
                    .inbox
                    .lock()
                    .map_err(|_| "Local journal lock unavailable")?
                    .contains(room, event)?
                {
                    return Err("Unknown local message".into());
                }
                self.receipt(room, event, "processed").await?;
                self.inbox
                    .lock()
                    .map_err(|_| "Local journal lock unavailable")?
                    .ack(room, event)?;
                Ok(json!({"processed":true}))
            }
            _ => Err("Unsupported method".into()),
        }
    }
}
fn allowed(policy: &Value, sender: &str) -> bool {
    let Some(mode) = policy["mode"].as_str() else {
        return false;
    };
    let Some(rules) = policy["rules"].as_array() else {
        return false;
    };
    if rules
        .iter()
        .any(|r| r["target"] == sender && r["action"] == "block")
    {
        return false;
    }
    mode == "open"
        || (mode == "allowlist"
            && rules
                .iter()
                .any(|r| r["target"] == sender && r["action"] == "allow"))
}
fn safe_error_code(error: &(dyn std::error::Error + Send + Sync)) -> &'static str {
    match error.to_string().as_str() {
        "OPERATION_TIMEOUT" => "OPERATION_TIMEOUT",
        "RATE_LIMITED" => "RATE_LIMITED",
        "AUTH_REQUIRED" => "AUTH_REQUIRED",
        "ACCESS_DENIED" => "ACCESS_DENIED",
        "API_UNAVAILABLE" => "API_UNAVAILABLE",
        "Encrypted history awaits device keys; anchor retained" => "HISTORY_KEYS_PENDING",
        "History pagination did not advance"
        | "History exceeds bounded catch-up; anchor retained"
        | "History batch too large; anchor retained" => "HISTORY_INCOMPLETE",
        "Plaintext message refused" => "PLAINTEXT_REFUSED",
        "Unknown message" => "UNKNOWN_MESSAGE",
        _ => "OPERATION_FAILED",
    }
}
fn output(value: &Value) -> Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, value)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}
fn validated_origin(value: &str) -> Result<String> {
    let url = Url::parse(value)?;
    if url.origin().ascii_serialization() != value
        || url.username() != ""
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !(url.scheme() == "https"
            || (url.scheme() == "http"
                && matches!(
                    url.host_str(),
                    Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
                )))
    {
        return Err("HTTPS origin or loopback development required".into());
    }
    Ok(value.to_owned())
}
fn main() {
    // SDK debug futures exceed the small Windows executable default stack during restore/encryption.
    let worker = std::thread::Builder::new()
        .name("polytalk-runtime".into())
        .stack_size(16 * 1024 * 1024)
        .spawn(|| -> Result<()> {
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .max_blocking_threads(16)
                .thread_stack_size(16 * 1024 * 1024)
                .enable_all()
                .build()?;
            runtime.block_on(Box::pin(run()))
        });
    let success = match worker {
        Ok(worker) => matches!(worker.join(), Ok(Ok(()))),
        Err(_) => false,
    };
    if !success {
        eprintln!(
            "PolyTalk Agent : demarrage ou protocole interrompu. Verifiez la configuration et le coffre local."
        );
        std::process::exit(1);
    }
}
async fn run() -> Result<()> {
    if std::env::var("POLYTALK_AGENT_TRACE").as_deref() == Ok("1") {
        let _ = tracing::subscriber::set_global_default(PhaseSubscriber);
    }
    let origin = validated_origin(
        &std::env::var("POLYTALK_ORIGIN").unwrap_or_else(|_| "http://localhost:3210".into()),
    )?;
    let password = Zeroizing::new(
        std::env::var("POLYTALK_AGENT_PASSWORD")
            .map_err(|_| "Local password environment required")?,
    );
    let path = PathBuf::from(
        std::env::var_os("POLYTALK_AGENT_STORE").unwrap_or_else(|| ".local/agent".into()),
    );
    prepare_directory(&path)?;
    let lock_path = path.join("agent.lock");
    if lock_path.exists()
        && std::fs::symlink_metadata(&lock_path)?
            .file_type()
            .is_symlink()
    {
        return Err("Linked lock refused".into());
    }
    if std::fs::symlink_metadata(&path)?.file_type().is_symlink() {
        return Err("Linked store refused".into());
    }
    let lock = OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(path.join("agent.lock"))?;
    lock.try_lock()?;
    let mut agent = Agent::open(&path, origin, &password).await?;
    let mut input = BufReader::new(tokio::io::stdin());
    loop {
        let mut line = Zeroizing::new(Vec::new());
        let count = (&mut input)
            .take(65537)
            .read_until(b'\n', &mut line)
            .await?;
        if count == 0 {
            break;
        }
        if count > 65536 {
            return Err("Command too large".into());
        }
        let request = match std::str::from_utf8(&line)
            .ok()
            .and_then(|line| protocol::parse(line).ok())
        {
            Some(request) => request,
            None => {
                output(
                    &json!({"v":1,"id":null,"error":{"code":"INVALID_REQUEST","message":"Commande invalide."}}),
                )?;
                continue;
            }
        };
        let result = if request.method == "listen" {
            let timeout = request.params["timeout_ms"].as_u64().unwrap_or(0);
            match tokio::time::timeout(
                Duration::from_millis(timeout.max(1)),
                agent.command(&request),
            )
            .await
            {
                Ok(result) => result,
                Err(_) => Ok(json!({"available":0,"timeout":true})),
            }
        } else {
            match tokio::time::timeout(Duration::from_secs(45), agent.command(&request)).await {
                Ok(result) => result,
                Err(_) => Err("OPERATION_TIMEOUT".into()),
            }
        };
        let fatal = result
            .as_ref()
            .is_err_and(|error| error.to_string() == "OPERATION_TIMEOUT")
            && ["send", "join", "login"].contains(&request.method.as_str());
        match result {
            Ok(result) => output(&json!({"v":1,"id":request.id,"result":result}))?,
            Err(error) => output(
                &json!({"v":1,"id":request.id,"error":{"code":safe_error_code(error.as_ref()),"message":"Opération refusée, clés indisponibles ou service inaccessible. Aucun lancement de modèle effectué."}}),
            )?,
        }
        if fatal {
            return Err("Stateful operation timed out; restart required".into());
        }
    }
    Ok(())
}
