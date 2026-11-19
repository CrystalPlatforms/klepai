// NotificationBanner — the Klepai-owned Windows/Linux notification banner
// (v0.1.1, issue #53), following umux's shipped #118 pattern: one borderless,
// always-on-top window at the work area's bottom-right holding a vertical
// stack of clickable toasts. Silent, never stealing focus, each toast
// auto-dismissing after ~5 s. Clicking a toast announces the conversation id
// over BANNER_ACTIVATE_EVENT — the main window's shared click handler
// (issue #54) focuses/un-minimizes Klepai and navigates there.
//
// This component ONLY renders inside the banner window (main.tsx routes
// ?banner=1 here): it paints the stack, follows window visibility to the
// stack size, and positions the window in the work area's corner. The
// decisions about WHETHER to notify live in lib/notifications.ts; the umux
// split (brain vs. DOM glue) carried over.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  currentMonitor,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";

import {
  BANNER_ACTIVATE_EVENT,
  BANNER_READY_EVENT,
  BANNER_SHOW_EVENT,
  type BannerToast,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

/** How long a toast stays fully visible before it is dropped. */
const AUTO_DISMISS_MS = 5000;
/** Corner gap to the work area edges. */
const MARGIN = 16;
/** At most this many toasts on the stack at once. */
const STACK_CAP = 3;
/** The window hugs the stack; never narrower/taller than this even when
 * momentarily empty (it is hidden then anyway). */
const MIN_HEIGHT = 40;

export default function NotificationBannerHost() {
  const [toasts, setToasts] = useState<BannerToast[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);

  // Boot: position the window, then subscribe and announce readiness —
  // toasts pushed before this page loaded are flushed by the manager on
  // the ready handshake. The disposed flag keeps a StrictMode double-mount
  // from leaking a listener resolved after cleanup.
  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const appWindow = getCurrentWindow();

    void (async () => {
      try {
        const monitor = await currentMonitor();
        if (monitor) {
          const x =
            monitor.workArea.position.x +
            monitor.workArea.size.width -
            Math.round(340 * monitor.scaleFactor) -
            MARGIN;
          const y =
            monitor.workArea.position.y +
            monitor.workArea.size.height -
            Math.round(280 * monitor.scaleFactor) -
            MARGIN;
          await appWindow.setPosition(new PhysicalPosition(x, y));
        }
      } catch {
        // Default position beats a crash — the corner is cosmetic.
      }

      const un = await listen<BannerToast>(BANNER_SHOW_EVENT, (event) => {
        const toast = event.payload;
        // Dedupe by key: a live delivery followed by the ready-flush of the
        // same toast must not stack it twice.
        setToasts((current) =>
          current.some((t) => t.key === toast.key) ? current : [...current, toast],
        );
      });
      if (disposed) {
        un();
        return;
      }
      unlisteners.push(un);
      await emit(BANNER_READY_EVENT);
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((un) => un());
    };
  }, []);

  // The window hugs the stack: its height tracks the rendered toasts, then
  // it is visible exactly while the stack is not empty. Layout effect so the
  // resize lands BEFORE the first paint at the new stack size — no frame of
  // dead space above the toasts (the window is always-on-top, so an
  // oversized body sits over other apps' pixels). CSS px are logical px.
  useLayoutEffect(() => {
    const appWindow = getCurrentWindow();
    const contentHeight = stackRef.current?.scrollHeight ?? MIN_HEIGHT;
    const height = Math.max(MIN_HEIGHT, Math.ceil(contentHeight));
    void (async () => {
      try {
        await appWindow.setSize(new LogicalSize(340, height));
      } catch {
        // A refused resize degrades to the fixed-size window — still shown.
      }
      if (toasts.length > 0) {
        void appWindow.show();
      } else {
        void appWindow.hide();
      }
    })();
  }, [toasts]);

  // Auto-dismiss the oldest toast ~5 s after the stack last changed. Each
  // toast therefore lives at most ~5 s × (its queue depth) — two events in
  // one tick still resolve within seconds of each other.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toasts]);

  const activate = (toast: BannerToast) => {
    // Remove first: a click dismisses without waiting for the timeout, and
    // the window may drop its last toast.
    setToasts((current) => current.filter((t) => t.key !== toast.key));
    void emit(BANNER_ACTIVATE_EVENT, { conversationId: toast.conversationId });
  };

  return (
    <div className="flex h-full flex-col justify-end">
      {/* The measured content wrapper — the window resizes to this div's
          scrollHeight, so it must hold all stack content and nothing else. */}
      <div ref={stackRef} className="flex w-full flex-col gap-2 p-2">
        {toasts.slice(-STACK_CAP).map((toast) => (
        <button
          key={toast.key}
          type="button"
          onClick={() => activate(toast)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left shadow-lg transition-transform hover:border-blue-500/50 active:scale-[0.98]"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold tracking-wide text-foreground">
              {toast.title}
            </span>
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-wide",
                toast.typeLine === "Error" ? "text-destructive" : "text-blue-500",
              )}
            >
              {toast.typeLine}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{toast.body}</p>
        </button>
      ))}
      </div>
    </div>
  );
}
