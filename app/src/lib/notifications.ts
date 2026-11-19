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
  onAction,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

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

// ---- Banner delivery, Windows/Linux (issue #53) ----------------------------
// An app-owned always-on-top window at the work area's bottom-right — the
// umux #118 pattern (like Steam/Discord toasts): borderless, silent, never
// stealing focus, auto-dismissed by the host page itself. One window holds
// the whole stack, so several events in quick succession stack vertically
// instead of overlapping.

/** Events exchanged with the banner window's host page. */
export const BANNER_SHOW_EVENT = "klepai:banner-show";
export const BANNER_READY_EVENT = "klepai:banner-ready";
export const BANNER_ACTIVATE_EVENT = "klepai:banner-activate";

/** One toast on the banner window's stack — an AppNotification plus the
 * delivery key the host dedupes and dismisses by. */
export interface BannerToast extends AppNotification {
  key: number;
}

const BANNER_WINDOW_LABEL = "notification-banner";
/** Same bundle, banner host mode (see main.tsx). */
const BANNER_URL = "index.html?banner=1";
const BANNER_WIDTH = 340;
const BANNER_HEIGHT = 280;

let bannerSeq = 0;
let bannerWindow: WebviewWindow | null = null;
/** Toasts emitted before the host page finished loading — flushed on its
 * `banner-ready` handshake. The host dedupes by key, so a toast delivered
 * live and then flushed again just re-renders itself. */
const pendingToasts = new Map<number, BannerToast>();

/** Creates (once) and returns the banner window. */
async function ensureBannerWindow(): Promise<WebviewWindow> {
  if (bannerWindow) return bannerWindow;
  let existing = await WebviewWindow.getByLabel(BANNER_WINDOW_LABEL);
  if (!existing) {
    existing = new WebviewWindow(BANNER_WINDOW_LABEL, {
      url: BANNER_URL,
      title: "Klepai",
      width: BANNER_WIDTH,
      height: BANNER_HEIGHT,
      visible: false,
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      focus: false,
      transparent: true,
      shadow: false,
    });
  }
  bannerWindow = existing;
  return existing;
}

/** Pushes one toast to the banner window. */
async function pushBanner(content: AppNotification): Promise<void> {
  try {
    await ensureBannerWindow();
    const key = ++bannerSeq;
    pendingToasts.set(key, { ...content, key });
    await emit(BANNER_SHOW_EVENT, { key, ...content } satisfies BannerToast);
  } catch {
    // A failed banner must never break the run being reported on.
  }
}

/** Registers the Windows/Linux banner delivery. Called once from the app
 * shell; the window is only created on the first accepted notification.
 * Returns the readiness-listener cleanup — the StrictMode dev double-mount
 * would otherwise leak a second flush listener (the same disposed-flag
 * pattern the lifecycle listener in App uses). */
export function initBannerDelivery(): () => void {
  setBannerDelivery((content) => void pushBanner(content));
  let disposed = false;
  let unlisten: (() => void) | undefined;
  void listen(BANNER_READY_EVENT, () => {
    for (const [key, toast] of pendingToasts) {
      void emit(BANNER_SHOW_EVENT, toast);
      pendingToasts.delete(key);
    }
  }).then((fn) => {
    if (disposed) {
      fn();
      return;
    }
    unlisten = fn;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}

/** Near-simultaneous deliveries of the SAME conversation + type collapse
 * into one: any leaked duplicate subscription (StrictMode dev remount, an
 * HMR boundary, a re-init) reaches this choke point, and identical content
 * within the window is a duplicate, not a second event. Two DIFFERENT
 * conversations — or different kinds — still each notify (PRD: no
 * aggregation); a real re-occurrence of the same kind for one conversation
 * inside the window is not a realistic flow (a generation takes longer). */
const DEDUPE_WINDOW_MS = 2000;
const lastDeliveredAt = new Map<string, number>();

/** Hands one accepted notification to the platform's delivery layer. */
export async function deliverNotification(content: AppNotification): Promise<void> {
  const dedupeKey = `${content.conversationId}|${content.typeLine}`;
  const now = Date.now();
  if (now - (lastDeliveredAt.get(dedupeKey) ?? 0) < DEDUPE_WINDOW_MS) return;
  lastDeliveredAt.set(dedupeKey, now);
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

// ---- Click behavior (issue #54) -------------------------------------------
// One shared handler for EVERY delivery — banner (Windows/Linux) and native
// (macOS) alike: bring the Klepai window to front, un-minimize it, focus it,
// then switch to the notification's conversation. Dismissing a banner (the
// auto-dismiss timeout) never reaches this handler, so it never navigates.

/** The navigation path — App registers its existing select-and-show route
 * (setSelectedId plus the scroll bookkeeping). */
type Navigator = (conversationId: number) => void;
let navigateTo: Navigator | null = null;

export function setNotificationNavigator(navigate: Navigator | null): void {
  navigateTo = navigate;
}

/** Focuses Klepai and navigates to the notification's conversation. */
export async function activateNotificationConversation(
  conversationId: number,
): Promise<void> {
  try {
    const appWindow = getCurrentWindow();
    let minimized = false;
    try {
      minimized = await appWindow.isMinimized();
    } catch {
      minimized = false;
    }
    if (minimized) await appWindow.unminimize();
    await appWindow.show();
    await appWindow.setFocus();
  } catch {
    // Window ops are best-effort — the navigation still happens.
  }
  navigateTo?.(conversationId);
}

// ---- Native click handling, macOS (issue #55) ------------------------------

/** Wires the native notification's click callback. Unlike the banner's
 * click (a DOM event on our own window), a native click arrives through the
 * plugin's action stream — and desktop plugins only report clicks for
 * notifications sent WHILE a listener existed, so App registers this once
 * at startup, before any notification goes out. Each notification carries
 * its conversation id in `extra`, and a click lands in the SAME shared
 * handler as the banner: un-minimize, focus, navigate — identical on all
 * platforms. A click on a notification whose payload is missing can still
 * be told apart (`tap`), but has nothing to navigate to — dropped. */
let nativeClickWired = false;

export function initNativeClickHandling(): void {
  // Once per process: the plugin's action stream keeps earlier subscriptions
  // alive, so a StrictMode/HMR re-init must not stack a second one (a click
  // would then run the focus+navigate handler twice).
  if (nativeClickWired) return;
  nativeClickWired = true;
  void onAction(async (event) => {
    if (event.actionId !== "tap") return;
    const conversationId = event.notification?.extra?.conversationId;
    if (typeof conversationId === "number") {
      await activateNotificationConversation(conversationId);
    }
  });
}
