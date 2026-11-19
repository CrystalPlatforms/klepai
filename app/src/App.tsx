import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import type { Conversation, SearchHit } from "@/types";
import { Sidebar } from "@/components/Sidebar";
import { ChatPane } from "@/components/ChatPane";
import { DetailPane } from "@/components/DetailPane";
import { SettingsDialog } from "@/components/SettingsDialog";
import { UpdateBanner } from "@/components/UpdateBanner";
import { trackAppOpen } from "@/lib/analytics";
import {
  LIFECYCLE_EVENT,
  buildNotification,
  deliverNotification,
  shouldNotify,
  type LifecyclePayload,
} from "@/lib/notifications";
import { notificationsEnabled } from "@/lib/settings";

/** A pending "open this conversation scrolled to this message" request. */
interface JumpTarget {
  conversationId: number;
  messageId: number;
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Conversations still generating in the background (issue #21) — the
   * sidebar badges them so the work stays visible from any chat. */
  const [streamingIds, setStreamingIds] = useState<Set<number>>(new Set());
  /** Conversations whose last generation failed (issue #23) — the sidebar
   * marks them with the error loader until the next send clears it. */
  const [errorIds, setErrorIds] = useState<Set<number>>(new Set());

  // ---- Notification decision layer (issue #52) ----------------------------
  // The global conversation-lifecycle listener decides per event whether to
  // notify: only when the conversation is in the background (a different
  // one is on screen, or the window is unfocused/minimized) and the
  // Settings toggle is on. The decision reads live values through refs so
  // the listener subscribes once and never misses an event on re-render.

  /** Mirrors the focused state of the Klepai window. */
  const [windowVisible, setWindowVisible] = useState(true);
  const selectedIdRef = useRef(selectedId);
  const windowVisibleRef = useRef(windowVisible);
  /** Mirrors the Settings toggle (read on the hot event path). */
  const enabledRef = useRef(notificationsEnabled());

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    windowVisibleRef.current = windowVisible;
  }, [windowVisible]);

  // Window focus/blur — the payload IS the new focused state.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => setWindowVisible(focused))
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, []);

  // The Settings toggle broadcasts after every flip (issue #50); re-read
  // the stored value so the listener always sees the current preference.
  useEffect(() => {
    const sync = () => {
      enabledRef.current = notificationsEnabled();
    };
    sync();
    window.addEventListener("klepai:notifications-changed", sync);
    return () => window.removeEventListener("klepai:notifications-changed", sync);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<LifecyclePayload>(LIFECYCLE_EVENT, async (event) => {
      let minimized = false;
      try {
        minimized = await getCurrentWindow().isMinimized();
      } catch {
        minimized = false;
      }
      const decision = {
        selectedId: selectedIdRef.current,
        windowVisible: windowVisibleRef.current && !minimized,
        enabled: enabledRef.current,
      };
      if (!shouldNotify(event.payload, decision)) return;
      const content = buildNotification(event.payload);
      if (content) void deliverNotification(content);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  const refresh = useCallback(async () => {
    try {
      setConversations(await invoke<Conversation[]>("list_conversations"));
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // One anonymous launch count per production run (issue #31).
  useEffect(() => {
    trackAppOpen();
  }, []);

  const handleCreate = async () => {
    try {
      const created = await invoke<Conversation>("create_conversation");
      await refresh();
      setSelectedId(created.id);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const handleRename = async (id: number, title: string) => {
    try {
      await invoke("rename_conversation", { id, title });
      await refresh();
    } catch (error) {
      console.error("Failed to rename conversation:", error);
    }
  };

  /** ChatPane reports generations starting and finishing; a deleted
   * conversation drops its badge with it. */
  const handleStreamingChanged = useCallback((id: number, streaming: boolean) => {
    setStreamingIds((current) => {
      if (streaming ? current.has(id) : !current.has(id)) return current;
      const next = new Set(current);
      if (streaming) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  /** ChatPane reports failures — the sidebar shows the error mark; the
   * next send in that conversation clears it. */
  const handleErrorChanged = useCallback((id: number, hasError: boolean) => {
    setErrorIds((current) => {
      if (hasError ? current.has(id) : !current.has(id)) return current;
      const next = new Set(current);
      if (hasError) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await invoke("delete_conversation", { id });
      await refresh();
      setSelectedId((current) => (current === id ? null : current));
      setStreamingIds((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setErrorIds((current) => {
        if (!current.has(id)) return current;
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  /** Opens a conversation by clicking its row — a pending jump for a
   * different conversation is stale and cleared. */
  const handleSelect = (id: number) => {
    setJumpTarget((current) =>
      current && current.conversationId !== id ? null : current,
    );
    setSelectedId(id);
  };

  /** Opens the hit's conversation and asks ChatPane to scroll to it. */
  const handleJumpTo = (hit: SearchHit) => {
    setJumpTarget({ conversationId: hit.conversation_id, messageId: hit.message_id });
    setSelectedId(hit.conversation_id);
  };

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-screen">
      <Sidebar
        conversations={conversations}
        selectedId={selectedId}
        streamingIds={streamingIds}
        errorIds={errorIds}
        open={sidebarOpen}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
        onJumpTo={handleJumpTo}
      />
      <ChatPane
        conversation={selected}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={() => setSidebarOpen(true)}
        detailsOpen={detailsOpen}
        onOpenDetails={() => setDetailsOpen(true)}
        onConversationsChanged={() => void refresh()}
        onDelete={handleDelete}
        onSelectConversation={setSelectedId}
        jumpTarget={jumpTarget}
        onJumpHandled={() => setJumpTarget(null)}
        onStreamingChanged={handleStreamingChanged}
        onErrorChanged={handleErrorChanged}
      />
      <DetailPane
        conversation={selected}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onConversationsChanged={() => void refresh()}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onServersChanged={() => void refresh()}
      />
      {/* Update-available banner (issue #44): one quiet check at app start;
          quiet and error verdicts render nothing. */}
      <UpdateBanner />
    </div>
  );
}
