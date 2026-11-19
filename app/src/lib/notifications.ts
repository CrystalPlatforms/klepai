// The v0.1.1 notification pipeline — the decision layer (issue #52) and the
// platform delivery dispatch.
//
// The backend emits one global `conversation-lifecycle` event whenever a
// conversation finishes, fails, or a permission ask is set/cleared (issue
// #48). This module decides WHETHER to notify: only for a conversation in
// the background — the user is viewing a different one, or the Klepai window
// is inactive/minimized. The conversation currently on screen never
// notifies. One notification per event, never aggregated;
// `needs_input_cleared` never notifies. Accepted events are then handed to
// the delivery layer, which branches per platform: an app-owned clickable
// banner on Windows/Linux (issue #53) or the native notification center on
// macOS (issue #55).
//
// The decision functions are deliberately pure (no Tauri imports) so the
// background filter, toggle suppression and truncation stay unit-testable.

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

export const LIFECYCLE_EVENT = "conversation-lifecycle";

export type LifecycleKind =
  | "finished"
  | "needs_input"
  | "needs_input_cleared"
  | "error";

/** Payload of the backend's `conversation-lifecycle` event (issue #48);
 * `message` carries the error text on kind `error`. */
export interface LifecyclePayload {
  conversation_id: number;
  conversation_name: string;
  kind: LifecycleKind;
  message?: string;
}

/** The kinds that can notify — `needs_input_cleared` is bookkeeping only. */
export type NotificationKind = Exclude<LifecycleKind, "needs_input_cleared">;

/** The exact type line of each notification (PRD, Q10/Q16). */
const TYPE_LINES: Record<NotificationKind, string> = {
  finished: "Finished",
  needs_input: "Needs input",
  error: "Error",
};

export const NOTIFICATION_TITLE = "Klepai";

/** Body truncation: the conversation name, cut to ~40 characters with "…"
 * (PRD, Q9). */
const NAME_MAX_CHARS = 40;

export function truncateName(name: string, max: number = NAME_MAX_CHARS): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1).trimEnd()}…`;
}

export interface DecisionContext {
  /** The conversation currently open in the thread; null when none is. */
  selectedId: number | null;
  /** True when the Klepai window is focused AND not minimized. */
  windowVisible: boolean;
  /** The Settings toggle (issue #50) — off silences all three kinds. */
  enabled: boolean;
}

/** Whether one lifecycle event should raise a notification. Background =
 * the event's conversation is not the one on screen, or the window is
 * invisible (unfocused/minimized) — then even the selected conversation
 * notifies. Cleared events and the toggle-off state never notify. */
export function shouldNotify(
  event: LifecyclePayload,
  ctx: DecisionContext,
): boolean {
  if (event.kind === "needs_input_cleared") return false;
  if (!ctx.enabled) return false;
  const background =
    event.conversation_id !== ctx.selectedId || !ctx.windowVisible;
  return background;
}

/** The rendered notification content handed to the delivery layer. */
export interface AppNotification {
  title: string;
  typeLine: string;
  body: string;
  conversationId: number;
}

/** Builds the notification content for one event — null for kinds that
 * never notify. No aggregation: one call, one notification. */
export function buildNotification(
  event: LifecyclePayload,
): AppNotification | null {
  if (event.kind === "needs_input_cleared") return null;
  return {
    title: NOTIFICATION_TITLE,
    typeLine: TYPE_LINES[event.kind],
    body: truncateName(event.conversation_name),
    conversationId: event.conversation_id,
  };
}

/** Best-effort macOS detection for the delivery switch. The webview's
 * userAgent names the platform on every OS Tauri supports. */
export function platformIsMacOS(): boolean {
  return /Mac/i.test(navigator.userAgent);
}

// ---- Delivery -------------------------------------------------------------

/** The Windows/Linux banner sink, registered by the banner manager
 * (issue #53). Null until then — events for that branch are dropped, the
 * way a muted sink would. */
type BannerDelivery = (content: AppNotification) => void;
let bannerDelivery: BannerDelivery | null = null;

export function setBannerDelivery(deliver: BannerDelivery | null): void {
  bannerDelivery = deliver;
}

/** Hands one accepted notification to the platform's delivery layer. */
export async function deliverNotification(content: AppNotification): Promise<void> {
  if (platformIsMacOS()) {
    await deliverNative(content);
    return;
  }
  bannerDelivery?.(content);
}

/** macOS: the native notification center via tauri-plugin-notification
 * (issue #55's delivery path — click handling lands with issue #54's shared
 * handler). System sound per the user's macOS settings — no app-side sound
 * code. Best-effort: a refused permission or a plugin failure must never
 * break the run being reported on. */
async function deliverNative(content: AppNotification): Promise<void> {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === "granted";
    }
    if (!granted) return;
    sendNotification({
      title: content.title,
      body: `${content.typeLine} — ${content.body}`,
      extra: { conversationId: content.conversationId },
    });
  } catch {
    // Notifications are a courtesy surface — swallow delivery errors.
  }
}
