//! Skills injection into server-model request assembly (issue #19 S3), the
//! one-shot invoked skill (issue #20 S4), and the on-demand rebuild
//! (issue #34).
//!
//! Assumptions these tests encode:
//! - `resolve_target` + `apply_skill_injection` is the exact mapping both
//!   server-model send paths use (`stream_reply` for Natural, `run_tool_loop`
//!   for Agent mode with a server brain) — asserting on its output asserts
//!   on the real pipeline.
//! - Prompts carry only the enabled set's index cards (name + description +
//!   how to read). Skill CONTENT never rides on a request: a server brain
//!   with tools pulls it through the `read_skill` tool. There is no size
//!   budget — the index stays light however big the skills are.
//! - A one-shot invocation works only on an ENABLED skill — a disabled one
//!   is invisible to the palette and refused by the backend (owner decision,
//!   2026-10-17). An invoked skill rides on exactly ONE request: the next
//!   request without an id carries the index again, not the content.
//! - With no skills in play the system prompt is untouched — `None` stays
//!   `None`, a user prompt stays byte-identical.

use std::path::PathBuf;

use klepai_lib::commands::{apply_skill_injection, resolve_target};
use klepai_lib::gateway::ChatOptions;
use klepai_lib::skills::SkillStore;
use klepai_lib::store::Store;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "klepai-injection-tests-{}-{}",
        std::process::id(),
        name
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir should be creatable");
    dir
}

/// A conversation pinned to a server + model — the minimum `resolve_target`
/// needs to produce a real request target.
fn chat_ready_conversation(store: &Store) -> i64 {
    let server = store
        .create_server("mock", "ollama", "http://127.0.0.1:11434", None)
        .expect("server should create");
    let conv = store.create_conversation(None).expect("conversation");
    store
        .set_conversation_model(conv.id, Some(server.id), Some("llama3:8b"))
        .expect("model pin should set");
    conv.id
}

/// Imports a markdown skill named `name` with `body` as its instruction
/// content (frontmatter-stripped body = exactly `body`).
fn import_skill(skills: &SkillStore, store: &Store, dir: &PathBuf, name: &str, body: &str) -> i64 {
    let source = dir.join(format!("{name}.md"));
    std::fs::write(
        &source,
        format!("---\nname: {name}\ndescription: {name} does things\n---\n\n{body}"),
    )
    .expect("fixture should write");
    skills
        .import(store, &source)
        .expect("import should succeed")
        .id
}

fn injected_prompt(store: &Store, skills: &SkillStore, conv: i64, skill_id: Option<i64>) -> ChatOptions {
    let (_, _, mut options) = resolve_target(store, conv).expect("target should resolve");
    apply_skill_injection(store, skills, &mut options, skill_id)
        .expect("injection should succeed");
    options
}

#[test]
fn enabled_skill_index_reaches_the_prompt_and_content_stays_out() {
    let dir = temp_dir("enabled-disabled");
    let store = Store::open(&dir.join("klepai.db")).expect("store should open");
    let skills = SkillStore::open(&dir.join("skills")).expect("library should open");
    let conv = chat_ready_conversation(&store);

    let enabled = import_skill(
        &skills,
        &store,
        &dir,
        "greeter",
        "Always greet the user in Latin.",
    );
    // Imported but never enabled — the negative case.
    import_skill(&skills, &store, &dir, "whisperer", "Answer only in whispers.");
    skills
        .set_enabled(&store, enabled, true)
        .expect("enable should succeed");

    let options = injected_prompt(&store, &skills, conv, None);

    let prompt = options.system_prompt.expect("skills block should create a prompt");
    assert!(
        prompt.contains("## Skills")
            && prompt.contains("- greeter: greeter does things")
            && prompt.contains("read_skill"),
        "the enabled skill travels as an index card naming the read_skill tool"
    );
    assert!(
        !prompt.contains("Latin"),
        "skill content must not ride in the system prompt — the model reads it on demand"
    );
    assert!(
        !prompt.contains("whisperer") && !prompt.contains("whispers"),
        "a disabled skill must never reach the request"
    );
}

#[test]
fn the_index_stays_light_no_matter_how_big_the_skills_are() {
    let dir = temp_dir("no-cap");
    let store = Store::open(&dir.join("klepai.db")).expect("store should open");
    let skills = SkillStore::open(&dir.join("skills")).expect("library should open");
    let conv = chat_ready_conversation(&store);

    let big = import_skill(&skills, &store, &dir, "big", &"a".repeat(20 * 1024));
    let also_big = import_skill(&skills, &store, &dir, "also-big", &"b".repeat(20 * 1024));
    let small = import_skill(&skills, &store, &dir, "small", &"c".repeat(5 * 1024));
    for id in [big, also_big, small] {
        skills.set_enabled(&store, id, true).expect("enable");
    }

    let options = injected_prompt(&store, &skills, conv, None);
    let prompt = options.system_prompt.expect("skills block expected");

    // There is no budget to overflow: every enabled skill lands in the
    // index whatever its size, and no content rides at all — the model
    // pulls a skill's full text through read_skill when it needs it.
    for name in ["big", "also-big", "small"] {
        assert!(
            prompt.contains(&format!("- {name}: {name} does things")),
            "{name} is indexed regardless of size"
        );
    }
    assert!(
        !prompt.contains("aaaa") && !prompt.contains("bbbb") && !prompt.contains("cccc"),
        "no skill body rides in the prompt"
    );
    assert!(
        prompt.len() < 4 * 1024,
        "the index stays light however big the library grows: {} bytes",
        prompt.len()
    );
}

#[test]
fn a_disabled_skill_is_unavailable_and_an_enabled_one_shot_rides_on_one_request() {
    let dir = temp_dir("one-shot");
    let store = Store::open(&dir.join("klepai.db")).expect("store should open");
    let skills = SkillStore::open(&dir.join("skills")).expect("library should open");
    let conv = chat_ready_conversation(&store);

    let invoked = import_skill(
        &skills,
        &store,
        &dir,
        "translator",
        "Translate every reply to Polish.",
    );

    // The toggle is OFF — invoking by name must be refused, before anything
    // is injected (the palette already hides it; this is the backend guard).
    let (_, _, mut options) = resolve_target(&store, conv).expect("target should resolve");
    let error = apply_skill_injection(&store, &skills, &mut options, Some(invoked))
        .expect_err("a disabled skill must not be invocable");
    assert!(
        error.to_string().contains("disabled"),
        "the error names the problem: {error}"
    );
    assert_eq!(
        options.system_prompt, None,
        "a refused invocation leaves the request untouched"
    );

    // Enabled again: the one-shot attaches…
    skills.set_enabled(&store, invoked, true).expect("enable");
    let options = injected_prompt(&store, &skills, conv, Some(invoked));
    let prompt = options.system_prompt.expect("one-shot block expected");
    assert!(
        prompt.contains("Translate every reply to Polish."),
        "an enabled invoked skill attaches to its one request"
    );

    // …and the NEXT send without an invocation carries the index again —
    // translator is still enabled, but its content never leaks forward.
    let (_, _, mut next) = resolve_target(&store, conv).expect("target should resolve");
    apply_skill_injection(&store, &skills, &mut next, None).expect("next injection");
    let prompt = next.system_prompt.expect("the enabled set still indexes");
    assert!(
        prompt.contains("## Skills") && prompt.contains("- translator: translator does things"),
        "the index rides on"
    );
    assert!(
        !prompt.contains("Translate every reply"),
        "the one-shot content must not leak into the following request"
    );
}

#[test]
fn no_skills_in_play_leaves_the_system_prompt_untouched() {
    let dir = temp_dir("untouched");
    let store = Store::open(&dir.join("klepai.db")).expect("store should open");
    let skills = SkillStore::open(&dir.join("skills")).expect("library should open");
    let conv = chat_ready_conversation(&store);

    // The UI-directives hint (issue #22) always rides on a request — the
    // assistant cannot trigger the rich elements without knowing the syntax.
    let options = injected_prompt(&store, &skills, conv, None);
    assert_eq!(
        options.system_prompt.as_deref(),
        Some(klepai_lib::commands::UI_DIRECTIVES_HINT),
        "no skills — only the UI hint rides along"
    );

    store
        .set_conversation_settings(conv, Some("You are terse."), None, None)
        .expect("settings should save");
    let options = injected_prompt(&store, &skills, conv, None);
    let prompt = options.system_prompt.expect("prompt expected");
    assert!(
        prompt.starts_with("You are terse.\n\n---\n\n")
            && prompt.ends_with(klepai_lib::commands::UI_DIRECTIVES_HINT),
        "the user prompt passes through first, the hint trails: {prompt}"
    );
}
