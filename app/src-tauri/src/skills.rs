//! SkillStore — sole owner of the on-disk skill library.
//!
//! Deep module: import, listing, toggle, content read/write, delete and
//! size accounting all go through it; nothing else touches skill files.
//! Klepai never executes skill scripts — it only stores them and decides
//! how an assistant brain may read them (issue #34): prompts carry only a
//! name-and-description index, and the brain pulls a skill's full text on
//! demand — server models through the `read_skill` tool, agent CLIs by
//! opening the library file listed in the index. Only an explicit one-shot
//! invocation from the `/` palette attaches content directly.

use std::io::Read;
use std::path::{Path, PathBuf};

use zip::ZipArchive;

use crate::store::{Skill, Store, StoreError};

pub type Result<T> = std::result::Result<T, SkillError>;

/// One skill's index card: what a prompt carries instead of the skill's
/// content — identity plus how to read the full text on demand.
#[derive(Debug, Clone, PartialEq)]
pub struct SkillCard {
    pub name: String,
    pub description: String,
    /// Library instruction file (SKILL.md inside a package folder, the
    /// file itself for markdown skills) — the path a CLI brain opens.
    pub path: String,
}

/// One skill's full instructions: what `read_skill` returns and what a
/// one-shot palette attach puts on the request (frontmatter stripped).
#[derive(Debug, Clone, PartialEq)]
pub struct SkillPrompt {
    pub name: String,
    pub content: String,
}

impl SkillStore {
    /// The enabled set as index cards, in listing order. No content is
    /// read here — cards are the only thing that rides on every request.
    pub fn enabled_cards(&self, store: &Store) -> Result<Vec<SkillCard>> {
        Ok(store
            .list_skills()?
            .into_iter()
            .filter(|skill| skill.enabled)
            .map(|skill| SkillCard {
                path: Self::instruction_file(&skill)
                    .to_string_lossy()
                    .into_owned(),
                name: skill.name,
                description: skill.description,
            })
            .collect())
    }

    /// One skill's instructions for a single-invocation attach. A DISABLED
    /// skill is unavailable everywhere — the palette hides it and this
    /// refuses it, so neither the user nor the assistant can reach it
    /// (owner decision, 2026-10-17).
    pub fn skill_prompt(&self, store: &Store, id: i64) -> Result<SkillPrompt> {
        let skill = store.get_skill(id)?;
        if !skill.enabled {
            return Err(SkillError::DisabledSkill(skill.name));
        }
        Ok(SkillPrompt {
            content: self.content(store, id)?,
            name: skill.name,
        })
    }

    /// [`skill_prompt`] by name — how the `read_skill` tool resolves its
    /// argument. Exact match first, then case-insensitive; a disabled or
    /// unknown name is refused either way.
    pub fn skill_prompt_by_name(&self, store: &Store, name: &str) -> Result<SkillPrompt> {
        let skills = store.list_skills()?;
        let skill = skills
            .iter()
            .find(|skill| skill.name == name)
            .or_else(|| {
                skills
                    .iter()
                    .find(|skill| skill.name.eq_ignore_ascii_case(name))
            })
            .ok_or_else(|| SkillError::UnknownSkill(name.to_string()))?;
        self.skill_prompt(store, skill.id)
    }
}

/// Formats prompts into the block that rides in a system/agent prompt.
/// Empty input yields an empty string — the caller then injects nothing.
pub fn prompt_block(prompts: &[SkillPrompt]) -> String {
    if prompts.is_empty() {
        return String::new();
    }
    let mut block =
        String::from("## Active skills\n\nFollow these instructions for this request:\n");
    for prompt in prompts {
        block.push_str(&format!("\n### {}\n\n{}\n", prompt.name, prompt.content.trim_end()));
    }
    block
}

/// Formats the index cards for a server-model prompt: names, descriptions
/// and the read_skill call — never the content. Empty input yields an
/// empty string — the caller then injects nothing.
pub fn index_block(cards: &[SkillCard]) -> String {
    if cards.is_empty() {
        return String::new();
    }
    let mut block = String::from(
        "## Skills\n\n\
         Enabled skills you may use. When the user's task matches one, call \
         the `read_skill` tool with its exact name first — its instructions \
         arrive as the tool result. Until then none of their content is in \
         this conversation. Unknown or disabled names are refused.\n",
    );
    for card in cards {
        block.push_str(&format!("- {}: {}\n", card.name, card.description));
    }
    block
}

/// Formats the index cards for an agent-CLI prompt: names, descriptions and
/// the library file the CLI opens with its own Read tool — never the
/// content. Empty input yields an empty string.
pub fn cli_index_block(cards: &[SkillCard]) -> String {
    if cards.is_empty() {
        return String::new();
    }
    let mut block = String::from(
        "## Skills\n\n\
         Enabled skills you may use. When the user's task matches one, open \
         its file with your Read tool first and follow the instructions \
         inside. Until then none of their content is in this conversation.\n",
    );
    for card in cards {
        block.push_str(&format!(
            "- {}: {} — file: {}\n",
            card.name, card.description, card.path
        ));
    }
    block
}

/// Merges a skills block into an optional system prompt. An empty block
/// leaves the prompt untouched; otherwise the skills come after whatever
/// base prompt the user configured.
pub fn with_skill_block(base: Option<String>, block: &str) -> Option<String> {
    if block.is_empty() {
        return base;
    }
    Some(match base {
        Some(base) if !base.trim().is_empty() => format!("{}\n\n{}", base.trim_end(), block),
        _ => block.to_string(),
    })
}

#[derive(Debug, thiserror::Error)]
pub enum SkillError {
    #[error("the archive has no SKILL.md — a .skill package must contain a skill folder with SKILL.md")]
    NoSkillMd,
    #[error("a skill named “{0}” already exists")]
    DuplicateName(String),
    #[error("skill name cannot be empty")]
    EmptyName,
    #[error("skill “{0}” is disabled — enable it in Settings → Skills first")]
    DisabledSkill(String),
    #[error("no skill named “{0}” — pick a name from the skills list")]
    UnknownSkill(String),
    #[error("unsupported skill file: {0} — import a .skill package or a .md file")]
    UnsupportedExtension(String),
    #[error("unreadable archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("{0}")]
    Store(#[from] StoreError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

/// The library directory plus every file operation on it.
pub struct SkillStore {
    lib_dir: PathBuf,
}

impl SkillStore {
    /// Opens (creating as needed) the skill library directory.
    pub fn open(lib_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(lib_dir)?;
        Ok(Self {
            lib_dir: lib_dir.to_path_buf(),
        })
    }

    /// Imports a `.skill` package (a zip of a skill folder) or a `.md`
    /// instruction file into the library and records its metadata row.
    pub fn import(&self, store: &Store, source: &Path) -> Result<Skill> {
        let extension = source
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        match extension.as_str() {
            "skill" => self.import_package(store, source),
            "md" => self.import_markdown(store, source),
            other => Err(SkillError::UnsupportedExtension(other.to_string())),
        }
    }

    /// Copies a markdown instruction file into the library verbatim
    /// (frontmatter stays in the file; metadata is mirrored to the Store).
    fn import_markdown(&self, store: &Store, source: &Path) -> Result<Skill> {
        let raw = std::fs::read_to_string(source)?;
        let (frontmatter, body) = split_frontmatter(&raw);
        let fallback_name = source
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("skill");
        let name = frontmatter
            .and_then(|fm| frontmatter_field(fm, "name"))
            .unwrap_or_else(|| fallback_name.to_string());
        let description = frontmatter
            .and_then(|fm| frontmatter_field(fm, "description"))
            .unwrap_or_else(|| first_paragraph(body));

        let target = self.lib_dir.join(format!("{}.md", slugify(&name)));
        self.ensure_new(store, &name, &target)?;
        std::fs::write(&target, raw.as_bytes())?;
        Ok(store.create_skill(&name, &description, "markdown", &target, body.len() as i64)?)
    }

    /// Flips the global enable switch. Enabled skills are the only ones that
    /// ever reach server-model request assembly.
    pub fn set_enabled(&self, store: &Store, id: i64, enabled: bool) -> Result<()> {
        Ok(store.set_skill_enabled(id, enabled)?)
    }

    /// The file holding a skill's instructions: SKILL.md inside a package
    /// folder, the file itself for markdown skills.
    fn instruction_file(skill: &Skill) -> PathBuf {
        if skill.kind == "package" {
            PathBuf::from(&skill.path).join("SKILL.md")
        } else {
            PathBuf::from(&skill.path)
        }
    }

    /// The skill's instruction body (frontmatter stripped) — what the editor
    /// shows and what request assembly would append.
    pub fn content(&self, store: &Store, id: i64) -> Result<String> {
        let skill = store.get_skill(id)?;
        let raw = std::fs::read_to_string(Self::instruction_file(&skill))?;
        let (_, body) = split_frontmatter(&raw);
        Ok(body.to_string())
    }

    /// Saves an edited body back to the library file, keeping the file's
    /// frontmatter byte-for-byte, and updates the size accounting.
    pub fn save_content(&self, store: &Store, id: i64, body: &str) -> Result<()> {
        let skill = store.get_skill(id)?;
        let file = Self::instruction_file(&skill);
        let raw = std::fs::read_to_string(&file)?;
        let (frontmatter, _) = split_frontmatter(&raw);
        let updated = match frontmatter {
            Some(frontmatter) => format!("---\n{frontmatter}---\n\n{body}"),
            None => body.to_string(),
        };
        std::fs::write(&file, updated.as_bytes())?;
        store.update_skill_size(id, body.len() as i64)?;
        Ok(())
    }

    /// Renames a skill: rewrites the `name:` frontmatter line in place
    /// (every other line stays byte-for-byte) and updates the store row.
    /// The library folder keeps its slug — paths stay stable.
    pub fn rename(&self, store: &Store, id: i64, name: &str) -> Result<()> {
        let name = name.trim();
        if name.is_empty() {
            return Err(SkillError::EmptyName);
        }
        if store
            .list_skills()?
            .iter()
            .any(|skill| skill.id != id && skill.name == name)
        {
            return Err(SkillError::DuplicateName(name.to_string()));
        }
        let skill = store.get_skill(id)?;
        let file = Self::instruction_file(&skill);
        let raw = std::fs::read_to_string(&file)?;
        let (frontmatter, body) = split_frontmatter(&raw);
        let updated = match frontmatter {
            Some(frontmatter) => {
                let frontmatter = replace_frontmatter_field(frontmatter, "name", name);
                format!("---\n{frontmatter}---\n\n{body}")
            }
            // No frontmatter yet — add a minimal block so the name sticks.
            None => format!("---\nname: {name}\n---\n\n{raw}"),
        };
        std::fs::write(&file, updated.as_bytes())?;
        store.rename_skill(id, name)?;
        Ok(())
    }

    /// Deletes a skill: metadata row plus the library files themselves
    /// (the whole folder for packages, the single file for markdown skills).
    pub fn delete(&self, store: &Store, id: i64) -> Result<()> {
        let skill = store.get_skill(id)?;
        let path = PathBuf::from(&skill.path);
        if skill.kind == "package" {
            std::fs::remove_dir_all(path)?;
        } else {
            std::fs::remove_file(path)?;
        }
        store.delete_skill(id)?;
        Ok(())
    }

    fn import_package(&self, store: &Store, source: &Path) -> Result<Skill> {
        let file = std::fs::File::open(source)?;
        let mut archive = ZipArchive::new(file)?;

        // Collect the file entries up front so SKILL.md can sit at the
        // archive root or inside one top-level folder.
        let mut entries: Vec<(String, Vec<u8>)> = Vec::new();
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index)?;
            let raw_name = entry.name()?.to_string();
            if entry.is_dir() || raw_name.ends_with('/') || !is_safe_entry_name(&raw_name) {
                continue;
            }
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes)?;
            entries.push((raw_name.trim_start_matches("./").to_string(), bytes));
        }

        // Root SKILL.md wins; otherwise one exactly one folder deep.
        let prefix = entries
            .iter()
            .find(|(name, _)| name == "SKILL.md")
            .map(|_| String::new())
            .or_else(|| {
                entries.iter().find_map(|(name, _)| {
                    name.strip_suffix("/SKILL.md")
                        .filter(|folder| !folder.contains('/'))
                        .map(|folder| format!("{folder}/"))
                })
            })
            .ok_or(SkillError::NoSkillMd)?;

        let skill_md = &entries
            .iter()
            .find(|(name, _)| *name == format!("{prefix}SKILL.md"))
            .expect("prefix exists only because SKILL.md was found")
            .1;
        let text = String::from_utf8_lossy(skill_md);
        let (frontmatter, body) = split_frontmatter(&text);

        // Name fallback: the folder the zip wrapped, else the file's stem.
        let wrapped_folder = prefix.trim_end_matches('/');
        let fallback_name = if wrapped_folder.is_empty() {
            source
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("skill")
        } else {
            wrapped_folder
        };
        let name = frontmatter
            .and_then(|fm| frontmatter_field(fm, "name"))
            .unwrap_or_else(|| fallback_name.to_string());
        let description = frontmatter
            .and_then(|fm| frontmatter_field(fm, "description"))
            .unwrap_or_default();

        let target = self.lib_dir.join(slugify(&name));
        self.ensure_new(store, &name, &target)?;

        std::fs::create_dir_all(&target)?;
        for (entry_name, bytes) in &entries {
            let Some(relative) = entry_name.strip_prefix(&prefix) else {
                continue;
            };
            if relative.is_empty() {
                continue;
            }
            let destination = target.join(relative);
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(destination, bytes)?;
        }

        Ok(store.create_skill(&name, &description, "package", &target, body.len() as i64)?)
    }
}

/// Rejects entries that would write outside the library folder (zip-slip).
fn is_safe_entry_name(name: &str) -> bool {
    !name.starts_with('/') && !name.split('/').any(|part| part == "..")
}

impl SkillStore {
    /// Imports never overwrite: an existing name — or its library slot —
    /// fails with a clear error instead of clobbering the import.
    fn ensure_new(&self, store: &Store, name: &str, target: &Path) -> Result<()> {
        let taken = store.list_skills()?.iter().any(|skill| skill.name == name)
            || target.exists();
        if taken {
            return Err(SkillError::DuplicateName(name.to_string()));
        }
        Ok(())
    }
}

/// Splits an optional `---` YAML frontmatter block off the front of a
/// markdown document. Returns (frontmatter text without fences, body).
fn split_frontmatter(raw: &str) -> (Option<&str>, &str) {
    let text = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let Some(rest) = text
        .strip_prefix("---\n")
        .or_else(|| text.strip_prefix("---\r\n"))
    else {
        return (None, raw);
    };
    let mut offset = 0;
    for line in rest.split_inclusive('\n') {
        if line.trim_end_matches(['\n', '\r']) == "---" {
            // One blank line after the closing fence is the separator, not
            // body content.
            let body = rest[offset + line.len()..].strip_prefix('\n').unwrap_or(&rest[offset + line.len()..]);
            return (Some(&rest[..offset]), body);
        }
        offset += line.len();
    }
    // No closing fence — the whole document is the body.
    (None, raw)
}

/// Reads one `key: value` (or `key: "value"`) line out of frontmatter text.
fn frontmatter_field(frontmatter: &str, key: &str) -> Option<String> {
    frontmatter.lines().find_map(|line| {
        let (field, value) = line.split_once(':')?;
        if field.trim() != key {
            return None;
        }
        let value = value.trim().trim_matches(['"', '\'']);
        (!value.is_empty()).then(|| value.to_string())
    })
}

/// Rewrites one `key: value` line in frontmatter text, keeping every other
/// line as-is (appending the key when it was missing).
fn replace_frontmatter_field(frontmatter: &str, key: &str, value: &str) -> String {
    let mut out = String::new();
    let mut replaced = false;
    for line in frontmatter.lines() {
        let matches = line
            .split_once(':')
            .is_some_and(|(field, _)| field.trim() == key);
        if matches {
            out.push_str(&format!("{key}: {value}\n"));
            replaced = true;
        } else {
            out.push_str(line);
            out.push('\n');
        }
    }
    if !replaced {
        out.push_str(&format!("{key}: {value}\n"));
    }
    out
}

/// First non-empty body paragraph, lines joined; capped at 200 characters
/// (cut at the last word boundary with an ellipsis when truncated).
fn first_paragraph(body: &str) -> String {
    let mut paragraph = String::new();
    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() {
            if !paragraph.is_empty() {
                break;
            }
            continue;
        }
        if !paragraph.is_empty() {
            paragraph.push(' ');
        }
        paragraph.push_str(line);
    }
    if paragraph.chars().count() > 200 {
        let truncated: String = paragraph.chars().take(200).collect();
        let cut = truncated.rfind(' ').unwrap_or(200);
        return format!("{}…", &truncated[..cut]);
    }
    paragraph
}

/// Library folder/file name for a skill: lowercase ASCII letters and digits,
/// separators collapsed to single dashes.
fn slugify(name: &str) -> String {
    let mut slug = String::new();
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if (ch.is_whitespace() || ch == '-' || ch == '_')
            && !slug.is_empty()
            && !slug.ends_with('-')
        {
            slug.push('-');
        }
    }
    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        "skill".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    //! Scratch Store + SkillStore for skill tests across modules: each
    //! instance gets its own temp directory (namespaced by test name and
    //! pid, so in-process parallel runs never collide) and removes it on
    //! drop.

    use std::path::PathBuf;

    use super::*;

    pub struct Scratch {
        pub skills: SkillStore,
        pub store: Store,
        pub dir: PathBuf,
    }

    impl Scratch {
        pub fn open(test: &str) -> Self {
            let dir = std::env::temp_dir()
                .join(format!("klepai-skills-{}-{test}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            let skills = SkillStore::open(&dir.join("lib")).expect("skill library");
            let store = Store::open(&dir.join("store.db")).expect("store");
            Self { skills, store, dir }
        }

        /// Imports a markdown skill with frontmatter metadata and flips
        /// its enabled flag to the given state.
        pub fn import_markdown(
            &self,
            name: &str,
            description: &str,
            body: &str,
            enabled: bool,
        ) -> Skill {
            let source = self.dir.join(format!("source-{name}.md"));
            std::fs::write(
                &source,
                format!("---\nname: {name}\ndescription: {description}\n---\n\n{body}"),
            )
            .expect("write source markdown");
            let skill = self.skills.import(&self.store, &source).expect("import");
            self.skills
                .set_enabled(&self.store, skill.id, enabled)
                .expect("toggle");
            self.store.get_skill(skill.id).expect("reload")
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skills::test_support::Scratch;

    #[test]
    fn enabled_cards_list_only_enabled_skills_at_their_library_paths() {
        let scratch = Scratch::open("cards");
        let on = scratch.import_markdown("alpha", "alpha does things", "alpha body", true);
        let _off = scratch.import_markdown("beta", "beta does things", "beta body", false);

        let cards = scratch.skills.enabled_cards(&scratch.store).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].name, "alpha");
        assert_eq!(cards[0].description, "alpha does things");
        assert!(cards[0].path.ends_with("alpha.md"));
        assert!(Path::new(&cards[0].path).starts_with(&scratch.dir));
        assert_eq!(cards[0].name, on.name);
    }

    #[test]
    fn index_block_names_skills_and_read_skill_but_carries_no_content() {
        let scratch = Scratch::open("index");
        scratch.import_markdown("alpha", "alpha does things", "alpha body", true);

        let cards = scratch.skills.enabled_cards(&scratch.store).unwrap();
        let block = index_block(&cards);
        assert!(block.contains("## Skills"));
        assert!(block.contains("read_skill"));
        assert!(block.contains("- alpha: alpha does things"));
        assert!(!block.contains("alpha body"));
        // No enabled skills — no block at all.
        assert_eq!(index_block(&[]), "");
    }

    #[test]
    fn cli_index_block_points_at_files_instead_of_the_tool() {
        let scratch = Scratch::open("cli-index");
        scratch.import_markdown("alpha", "alpha does things", "alpha body", true);

        let cards = scratch.skills.enabled_cards(&scratch.store).unwrap();
        let block = cli_index_block(&cards);
        assert!(block.contains(&cards[0].path));
        assert!(block.contains("Read tool"));
        assert!(!block.contains("read_skill"));
        assert!(!block.contains("alpha body"));
        assert_eq!(cli_index_block(&[]), "");
    }

    #[test]
    fn read_skill_resolves_by_name_and_refuses_unknown_or_disabled() {
        let scratch = Scratch::open("read-by-name");
        let on = scratch.import_markdown("alpha", "alpha does things", "alpha body", true);
        scratch.import_markdown("beta", "beta does things", "beta body", false);

        let prompt = scratch.skills.skill_prompt_by_name(&scratch.store, "alpha").unwrap();
        assert_eq!(prompt.content.trim(), "alpha body");
        // Case-insensitive fallback resolves the same skill.
        let ci = scratch.skills.skill_prompt_by_name(&scratch.store, "ALPHA").unwrap();
        assert_eq!(ci, prompt);
        assert_eq!(prompt.name, on.name);

        match scratch.skills.skill_prompt_by_name(&scratch.store, "nope") {
            Err(SkillError::UnknownSkill(name)) => assert_eq!(name, "nope"),
            other => panic!("expected UnknownSkill, got {other:?}"),
        }
        match scratch.skills.skill_prompt_by_name(&scratch.store, "beta") {
            Err(SkillError::DisabledSkill(name)) => assert_eq!(name, "beta"),
            other => panic!("expected DisabledSkill, got {other:?}"),
        }
    }

    #[test]
    fn one_shot_prompt_block_still_attaches_full_content() {
        let scratch = Scratch::open("one-shot");
        scratch.import_markdown("alpha", "alpha does things", "alpha body", true);

        let prompt = scratch
            .skills
            .skill_prompt_by_name(&scratch.store, "alpha")
            .unwrap();
        let block = prompt_block(std::slice::from_ref(&prompt));
        assert!(block.contains("## Active skills"));
        assert!(block.contains("alpha body"));
        // The merge still treats an empty block as "inject nothing".
        assert_eq!(with_skill_block(Some("base".into()), ""), Some("base".into()));
        assert_eq!(
            with_skill_block(Some("base".into()), &block),
            Some(format!("base\n\n{block}"))
        );
    }
}
