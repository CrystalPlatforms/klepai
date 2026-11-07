//! Conversation control (issues #8/#43/#45): regenerate/variant store
//! semantics and the per-conversation settings / model-switch request paths.
//!
//! Assumptions these tests encode:
//! - Regenerate keeps the displaced answer as the anchor's variant 1 (the
//!   first click files it, idempotently), and the fresh answer joins the
//!   ring as the next variant — the anchor row mirrors the visible variant,
//!   so the flat history path never changes shape and history length stays
//!   unchanged once the fresh reply lands.
//! - Each variant carries the model id resolved at generation time
//!   (`resolve_target`, the same mapping the real pipeline uses).
//! - A stopped generation keeps its non-empty partial answer as an aborted
//!   variant; a zero-content abort keeps nothing at all.
//! - Showing a variant moves exactly one visible marker and re-mirrors the
//!   anchor row.
//! - Editing a user message rewrites its content and drops every later
//!   message in the path (id order is the path in the Alpha).
//! - Per-conversation settings (system prompt, temperature, context length,
//!   thinking flag) travel from the conversation row into the request
//!   payload of a mock server, through the same `resolve_target` mapping the
//!   real send pipeline uses.
//! - Switching the model pin mid-conversation sends the FULL history to the
//!   new endpoint, and nothing to the old one.
//!
//! "Server" is the hand-rolled mock in `support/` — no external process.

mod support;

use std::path::PathBuf;

use klepai_lib::commands::resolve_target;
use klepai_lib::gateway::{ChatTurn, Gateway};
use klepai_lib::store::Store;
use support::{MockResponse, MockServer};

fn temp_db(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "klepai-control-tests-{}-{}",
        std::process::id(),
        name
    ));
    let _ = std::fs::remove_dir_all(&dir);
    dir.join("klepai.db")
}

fn open(name: &str) -> Store {
    Store::open(&temp_db(name)).expect("store should open")
}

fn ollama_stream() -> MockResponse {
    MockResponse::stream(
        "application/x-ndjson",
        vec![(
            "{\"message\":{\"content\":\"ok\"},\"done\":false}\n{\"done\":true}\n".into(),
            0,
        )],
    )
}

fn turns_from(store: &Store, conversation_id: i64) -> Vec<ChatTurn> {
    // Same shaping the send pipeline uses: full history, tools dropped.
    store
        .list_messages(conversation_id)
        .unwrap()
        .into_iter()
        .filter(|m| m.role != "tool")
        .map(|m| ChatTurn {
            role: m.role,
            content: m.content,
            images: m.images,
        })
        .collect()
}

// ---- Regenerate keeps variants (issues #43/#45) --------------------------------

/// Drives the store primitives exactly the way the regenerate command does:
/// file the displaced answer as variant 1, then land the fresh answer as
/// the next variant. The model id is a literal here — its resolution is the
/// model-capture test's subject, not the ring behavior's.
fn regenerate_once(store: &Store, conversation_id: i64, new_answer: &str) {
    let anchor = store
        .last_message(conversation_id)
        .unwrap()
        .expect("regenerate needs an answer to displace");
    assert_eq!(anchor.role, "assistant");
    store.ensure_anchor_variant(&anchor, Some("resolved-model")).unwrap();
    store
        .append_variant(&anchor, new_answer, None, Some("resolved-model"), false)
        .unwrap()
        .expect("a complete answer always keeps");
}

#[test]
fn regenerating_keeps_the_displaced_answer_as_the_visible_variant_ring() {
    let store = open("regen-variants");
    let conv = store.create_conversation(None).unwrap();
    store.insert_message(conv.id, "user", "question").unwrap();
    store.insert_message(conv.id, "assistant", "weak answer").unwrap();

    // First regenerate click: the displaced answer becomes variant 1, the
    // fresh one variant 2 — history length stays where it was.
    regenerate_once(&store, conv.id, "better answer");
    let history = store.list_messages(conv.id).unwrap();
    assert_eq!(history.len(), 2, "history length unchanged by regenerate");
    assert_eq!(history[1].content, "better answer");

    let variants = store.list_variants(conv.id).unwrap();
    assert_eq!(variants.len(), 2, "displaced answer kept beside its retry");
    assert_eq!(variants[0].ordinal, 1);
    assert_eq!(variants[0].content, "weak answer");
    assert_eq!(variants[1].ordinal, 2);
    assert_eq!(variants[1].content, "better answer");
    // Exactly one visible variant, and it is the fresh answer.
    let visible: Vec<_> = variants.iter().filter(|v| v.visible).collect();
    assert_eq!(visible.len(), 1, "exactly one visible variant per anchor");
    assert_eq!(visible[0].content, "better answer");
    // The context invariant: the anchor row mirrors the visible variant, so
    // the flat history path serves exactly what the bubble displays.
    assert_eq!(history[1].content, visible[0].content);

    // A second regenerate appends — the first click's conversion is
    // idempotent, the ring grows instead of re-filing variant 1.
    regenerate_once(&store, conv.id, "best answer");
    let variants = store.list_variants(conv.id).unwrap();
    assert_eq!(variants.len(), 3);
    assert_eq!(variants[0].content, "weak answer");
    assert_eq!(variants[2].content, "best answer");
    let visible: Vec<_> = variants.iter().filter(|v| v.visible).collect();
    assert_eq!(visible.len(), 1);
    assert_eq!(visible[0].content, "best answer");
    let anchor = store.last_message(conv.id).unwrap().unwrap();
    assert_eq!(anchor.content, "best answer");
}

#[test]
fn each_variant_carries_the_model_active_when_it_was_generated() {
    let store = open("regen-model-capture");
    let mock = MockServer::start(|_req| ollama_stream());
    let conv = store.create_conversation(None).unwrap();
    let server = store
        .create_server("local", "ollama", mock.base_url(), None)
        .unwrap();
    store
        .set_conversation_model(conv.id, Some(server.id), Some("llama3:8b"))
        .unwrap();
    store.insert_message(conv.id, "user", "question").unwrap();
    store.insert_message(conv.id, "assistant", "weak answer").unwrap();

    // The model id rides through resolve_target — the same mapping the real
    // send pipeline uses — into both the kept original and the fresh answer.
    let anchor = store.last_message(conv.id).unwrap().unwrap();
    let (_, model, _) = resolve_target(&store, conv.id).unwrap();
    assert_eq!(model, "llama3:8b");
    store.ensure_anchor_variant(&anchor, Some(&model)).unwrap();
    store
        .set_conversation_model(conv.id, Some(server.id), Some("qwen2.5:7b"))
        .unwrap();
    let (_, switched, _) = resolve_target(&store, conv.id).unwrap();
    assert_eq!(switched, "qwen2.5:7b");
    store
        .append_variant(&anchor, "better answer", None, Some(&switched), false)
        .unwrap();

    let variants = store.list_variants(conv.id).unwrap();
    assert_eq!(variants[0].model_id.as_deref(), Some("llama3:8b"));
    assert_eq!(variants[1].model_id.as_deref(), Some("qwen2.5:7b"));
}

#[test]
fn showing_a_variant_moves_the_visible_marker_and_remirrors_the_anchor() {
    let store = open("regen-step");
    let conv = store.create_conversation(None).unwrap();
    store.insert_message(conv.id, "user", "question").unwrap();
    store.insert_message(conv.id, "assistant", "answer one").unwrap();
    regenerate_once(&store, conv.id, "answer two");
    regenerate_once(&store, conv.id, "answer three");

    // Step back to variant 1: the marker moves, the anchor row mirrors it,
    // and the ring order stays stable.
    let variants = store.list_variants(conv.id).unwrap();
    store.show_variant(variants[0].id).unwrap();
    let variants = store.list_variants(conv.id).unwrap();
    assert_eq!(variants[0].content, "answer one");
    assert!(variants[0].visible);
    assert!(!variants[1].visible && !variants[2].visible);
    let anchor = store.last_message(conv.id).unwrap().unwrap();
    assert_eq!(anchor.content, "answer one");
    let history = store.list_messages(conv.id).unwrap();
    assert_eq!(history[1].content, "answer one");
}

#[test]
fn a_stopped_generation_keeps_its_partial_answer_as_an_aborted_variant() {
    let store = open("regen-abort");
    let conv = store.create_conversation(None).unwrap();
    store.insert_message(conv.id, "user", "question").unwrap();
    store.insert_message(conv.id, "assistant", "old answer").unwrap();
    let anchor = store.last_message(conv.id).unwrap().unwrap();

    // Stop mid-regeneration: the partial lands as evidence, marked aborted,
    // and becomes the visible variant like any other.
    store.ensure_anchor_variant(&anchor, Some("model-a")).unwrap();
    store
        .append_variant(&anchor, "partial ans", None, Some("model-b"), true)
        .unwrap()
        .expect("a non-empty abort is evidence, not garbage");

    let variants = store.list_variants(conv.id).unwrap();
    assert_eq!(variants.len(), 2);
    let aborted = variants.last().unwrap();
    assert!(aborted.aborted);
    assert!(!variants[0].aborted);
    assert_eq!(aborted.content, "partial ans");
    assert!(aborted.visible);
    let anchor = store.last_message(conv.id).unwrap().unwrap();
    assert_eq!(anchor.content, "partial ans");
}

#[test]
fn a_zero_content_abort_keeps_no_variant_row() {
    let store = open("regen-abort-empty");
    let conv = store.create_conversation(None).unwrap();
    store.insert_message(conv.id, "user", "question").unwrap();
    store.insert_message(conv.id, "assistant", "old answer").unwrap();
    let anchor = store.last_message(conv.id).unwrap().unwrap();
    store.ensure_anchor_variant(&anchor, Some("model-a")).unwrap();

    // Stop before anything streamed: nothing worth keeping exists — no
    // variant row, ring and anchor exactly as they were.
    let kept = store
        .append_variant(&anchor, "", None, Some("model-b"), true)
        .unwrap();
    assert!(kept.is_none(), "a zero-content abort creates no variant");
    let variants = store.list_variants(conv.id).unwrap();
    assert_eq!(variants.len(), 1);
    assert!(variants[0].visible);
    assert_eq!(variants[0].content, "old answer");
    let anchor = store.last_message(conv.id).unwrap().unwrap();
    assert_eq!(anchor.content, "old answer");
}

// ---- Edit semantics ----------------------------------------------------------

#[test]
fn editing_a_message_truncates_every_later_message_in_the_path() {
    let store = open("edit");
    let conv = store.create_conversation(None).unwrap();
    store.insert_message(conv.id, "user", "first question").unwrap();
    store.insert_message(conv.id, "assistant", "first answer").unwrap();
    let edited = store.insert_message(conv.id, "user", "original question").unwrap();
    store.insert_message(conv.id, "assistant", "second answer").unwrap();
    store.insert_message(conv.id, "user", "third question").unwrap();

    // Rewrite the third message, drop everything after it.
    store.update_message_content(edited, "edited question").unwrap();
    let removed = store.truncate_after(conv.id, edited).unwrap();
    assert_eq!(removed, 2, "the two messages after the edit are gone");

    let history = store.list_messages(conv.id).unwrap();
    assert_eq!(history.len(), 3);
    assert_eq!(history[2].id, edited);
    assert_eq!(history[2].content, "edited question");

    // The FTS index followed the rewrite: the new text is findable, the old
    // text is gone.
    let hits = store.search("edited question", 10).unwrap();
    assert!(hits.iter().any(|hit| hit.message_id == edited));
    let hits = store.search("original question", 10).unwrap();
    assert!(hits.iter().all(|hit| hit.message_id != edited));
}

// ---- Per-conversation settings -------------------------------------------------

#[test]
fn per_conversation_settings_round_trip_through_the_store() {
    let store = open("settings-roundtrip");
    let conv = store.create_conversation(None).unwrap();

    store
        .set_conversation_settings(conv.id, Some("Be terse."), Some(0.3), Some(2048))
        .unwrap();
    let reloaded = store.get_conversation(conv.id).unwrap();
    assert_eq!(reloaded.system_prompt.as_deref(), Some("Be terse."));
    assert_eq!(reloaded.temperature, Some(0.3));
    assert_eq!(reloaded.context_len, Some(2048));

    // Clearing means NULLs again — the request then omits the knobs.
    // Reasoning is not among the knobs: it is always on (see the payload
    // test below), so there is no thinking flag to round-trip.
    store.set_conversation_settings(conv.id, None, None, None).unwrap();
    let reloaded = store.get_conversation(conv.id).unwrap();
    assert_eq!(reloaded.system_prompt, None);
    assert_eq!(reloaded.temperature, None);
    assert_eq!(reloaded.context_len, None);
}

#[tokio::test]
async fn per_conversation_settings_are_included_in_the_request_payload() {    let mock = MockServer::start(|_request| ollama_stream());

    let store = open("settings-payload");
    let server = store
        .create_server("mock", "ollama", mock.base_url(), None)
        .unwrap();
    let conv = store.create_conversation(None).unwrap();
    store
        .set_conversation_model(conv.id, Some(server.id), Some("llama3:8b"))
        .unwrap();
    store
        .set_conversation_settings(conv.id, Some("You are terse."), Some(0.7), Some(4096))
        .unwrap();
    store.insert_message(conv.id, "user", "hello").unwrap();

    // resolve_target is the exact mapping the send pipeline uses.
    let (endpoint, model, options) = resolve_target(&store, conv.id).unwrap();
    assert_eq!(model, "llama3:8b");

    let gateway = Gateway::new().unwrap();
    gateway
        .chat(
            &endpoint,
            &model,
            &turns_from(&store, conv.id),
            &options,
            &Default::default(),
            |_| {},
        )
        .await
        .expect("chat against the mock should succeed");

    let request = mock.last_request();
    assert_eq!(request.path, "/api/chat");
    let payload = request.json();

    // System prompt from the conversation row becomes the system message.
    let messages = payload["messages"].as_array().unwrap();
    assert_eq!(messages[0]["role"], "system");
    assert_eq!(messages[0]["content"], "You are terse.");

    // Temperature and context length ride the Ollama options block…
    assert_eq!(payload["options"]["temperature"], 0.7);
    assert_eq!(payload["options"]["num_ctx"], 4096);
    // …and reasoning is always on — `think` ships with every request.
    assert_eq!(payload["think"], true);
}

// ---- Default system prompt (Settings) ------------------------------------------

#[test]
fn conversation_without_prompt_falls_back_to_the_default_system_prompt() {
    let store = open("default-prompt");
    let server = store
        .create_server("mock", "ollama", "http://127.0.0.1:11434", None)
        .unwrap();
    let conv = store.create_conversation(None).unwrap();
    store
        .set_conversation_model(conv.id, Some(server.id), Some("llama3:8b"))
        .unwrap();

    // No prompt anywhere — resolve_target must not invent one.
    let (_, _, options) = resolve_target(&store, conv.id).unwrap();
    assert_eq!(options.system_prompt, None);

    // The app-wide default kicks in for "Use default" (no conversation
    // prompt)…
    store
        .set_default_system_prompt(Some("You are Klepai. Be precise."))
        .unwrap();
    let (_, _, options) = resolve_target(&store, conv.id).unwrap();
    assert_eq!(
        options.system_prompt.as_deref(),
        Some("You are Klepai. Be precise.")
    );

    // …but an explicit conversation prompt still wins over the default.
    store
        .set_conversation_settings(conv.id, Some("Custom override."), None, None)
        .unwrap();
    let (_, _, options) = resolve_target(&store, conv.id).unwrap();
    assert_eq!(options.system_prompt.as_deref(), Some("Custom override."));

    // Clearing the default leaves conversations untouched.
    store.set_default_system_prompt(None).unwrap();
    store
        .set_conversation_settings(conv.id, None, None, None)
        .unwrap();
    let (_, _, options) = resolve_target(&store, conv.id).unwrap();
    assert_eq!(options.system_prompt, None);
}

// ---- Model switch mid-conversation ---------------------------------------------

#[tokio::test]
async fn switching_model_mid_conversation_sends_full_history_to_the_new_model() {
    let mock_a = MockServer::start(|_request| ollama_stream());
    let mock_b = MockServer::start(|_request| ollama_stream());

    let store = open("model-switch");
    let server_a = store
        .create_server("old", "ollama", mock_a.base_url(), None)
        .unwrap();
    let server_b = store
        .create_server("new", "ollama", mock_b.base_url(), None)
        .unwrap();
    let conv = store.create_conversation(None).unwrap();
    store
        .set_conversation_model(conv.id, Some(server_a.id), Some("model-a"))
        .unwrap();

    // A conversation already deep in progress.
    store.insert_message(conv.id, "user", "first question").unwrap();
    store.insert_message(conv.id, "assistant", "first answer").unwrap();
    store.insert_message(conv.id, "user", "second question").unwrap();

    // The user switches models mid-conversation…
    store
        .set_conversation_model(conv.id, Some(server_b.id), Some("model-b"))
        .unwrap();

    let (endpoint, model, options) = resolve_target(&store, conv.id).unwrap();
    assert_eq!(model, "model-b");

    let gateway = Gateway::new().unwrap();
    gateway
        .chat(
            &endpoint,
            &model,
            &turns_from(&store, conv.id),
            &options,
            &Default::default(),
            |_| {},
        )
        .await
        .expect("chat against the new model should succeed");

    // …the full history reaches the NEW model…
    let request = mock_b.last_request();
    let payload = request.json();
    assert_eq!(payload["model"], "model-b");
    let messages = payload["messages"].as_array().unwrap();
    let contents: Vec<&str> = messages
        .iter()
        .map(|m| m["content"].as_str().unwrap())
        .collect();
    assert_eq!(
        contents,
        vec!["first question", "first answer", "second question"],
        "the new model receives the entire history"
    );

    // …and the old model sees nothing of it.
    assert!(
        mock_a.requests().is_empty(),
        "the previous model must not receive requests after the switch"
    );
}

// Guard against silent drift: a turn without a matching store row (or vice
// versa) would break both control paths above.
#[test]
fn turns_shaping_keeps_full_history_in_order_and_drops_tool_messages() {
    let store = open("turns-shaping");
    let conv = store.create_conversation(None).unwrap();
    store.insert_message(conv.id, "user", "one").unwrap();
    store.insert_message(conv.id, "assistant", "two").unwrap();
    store.insert_message(conv.id, "tool", "intermediate").unwrap();
    store.insert_message(conv.id, "user", "three").unwrap();

    let turns = turns_from(&store, conv.id);
    let contents: Vec<&str> = turns.iter().map(|t| t.content.as_str()).collect();
    assert_eq!(contents, vec!["one", "two", "three"]);
}
