//! The `conversation-lifecycle` event payload (v0.1.1, issue #48).
//!
//! Assumptions these tests encode:
//! - The event name the frontend listens for is exactly
//!   `conversation-lifecycle` — a rename on either side silently kills
//!   every notification, so the constant IS the contract.
//! - The payload serializes into the exact shape the frontend's
//!   `LifecyclePayload` type parses: snake_case fields, the kind as a bare
//!   string (`finished` / `error` / `needs_input` / `needs_input_cleared`),
//!   and `message` present only on kind `error`.
//!
//! The emission SITES themselves (finish vs aborted silence, needs-input
//! on pending-permission insert, background observability) need a live
//! Tauri app handle to observe — those are verified by the CI test pass /
//! HITL scenarios of v0.1.1, not by these unit tests.

use klepai_lib::commands::{ConversationLifecycle, LIFECYCLE_EVENT};

#[test]
fn the_event_name_is_the_frontend_contract() {
    assert_eq!(LIFECYCLE_EVENT, "conversation-lifecycle");
}

fn payload(kind: &str, message: Option<String>) -> serde_json::Value {
    let event = ConversationLifecycle {
        conversation_id: 7,
        conversation_name: "Refactor the loader".into(),
        kind: kind.to_string(),
        message,
    };
    serde_json::to_value(&event).expect("lifecycle payload should serialize")
}

#[test]
fn the_payload_carries_the_fields_the_frontend_parses() {
    let json = payload("finished", None);
    assert_eq!(json["conversation_id"], 7);
    assert_eq!(json["conversation_name"], "Refactor the loader");
    assert_eq!(json["kind"], "finished");
}

#[test]
fn the_message_field_travels_only_with_an_error() {
    let error = payload("error", Some("generation failed".into()));
    assert_eq!(error["kind"], "error");
    assert_eq!(error["message"], "generation failed");

    // Every other kind omits the field entirely — the frontend treats a
    // present `message` as the error text, so it must not leak through as
    // null on finished / needs_input / needs_input_cleared.
    for kind in ["finished", "needs_input", "needs_input_cleared"] {
        let json = payload(kind, None);
        assert!(
            json.get("message").is_none(),
            "kind {kind} must not carry a message field"
        );
    }
}
