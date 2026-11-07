import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

import type { UpdateResource, UpdateState, UpdaterApi } from "@/lib/updater";
import {
  defaultUpdaterApi,
  downloadProgressText,
  runCheck,
  runInstall,
  UpdateFlowError,
} from "@/lib/updater";
import { Button } from "@/components/ui/button";
import { IconX } from "@/components/ui/icons";

/** Where "See what's new" lands (issue #44): the repo's Releases page —
 * nothing is fetched or rendered in-app. */
export const RELEASES_URL = "https://github.com/CrystalPlatforms/klepai/releases";

interface UpdateBannerProps {
  /** The updater seam — `defaultUpdaterApi` unless a test injects a fake. */
  api?: UpdaterApi;
  /** The external-opener seam — tests assert the Releases URL through it. */
  openExternal?: (url: string) => void;
}

/**
 * Update-available banner (issue #44): one quiet check per mount at app
 * start through the updater deep module. Only an "available" verdict raises
 * the banner — quiet states (up-to-date, no-release, not-configured) and
 * error verdicts show nothing here; Settings → About stays the place that
 * renders them. Install drives the existing one-click flow (download +
 * apply + relaunch); X dismisses for the session only — no persistence, the
 * banner returns at the next launch for as long as the update is pending.
 */
export function UpdateBanner({
  api = defaultUpdaterApi,
  openExternal = openUrl,
}: UpdateBannerProps) {
  const [state, setState] = useState<UpdateState>({ kind: "idle" });
  // The plugin's Update handle survives between check and install; null
  // keeps the banner hidden in every quiet and error state.
  const [resource, setResource] = useState<UpdateResource | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // One check per mount (PRD Q10 — app start only, no periodic re-check).
  useEffect(() => {
    let cancelled = false;
    runCheck(api)
      .then((result) => {
        if (cancelled) return;
        setResource(result.update);
        setState(result.state);
      })
      .catch((err) => {
        if (cancelled) return;
        setResource(null);
        setState(
          err instanceof UpdateFlowError
            ? err.state
            : { kind: "error", errorKind: "unknown", message: String(err) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const install = () => {
    if (resource == null) return;
    setState({ kind: "downloading", received: 0, total: null });
    runInstall(api, resource, (received, total) =>
      setState({ kind: "downloading", received, total }),
    )
      .then(() => {
        // One click = download + apply + relaunch — the About flow's shape.
        api.relaunch();
      })
      .catch((err) => {
        setState(
          err instanceof UpdateFlowError
            ? err.state
            : { kind: "error", errorKind: "unknown", message: String(err) },
        );
      });
  };

  if (resource == null || dismissed) return null;

  return (
    <div
      role="status"
      data-testid="update-banner"
      className="animate-slide-in-right fixed bottom-4 right-4 z-50 flex items-center gap-2.5 rounded-lg border border-border bg-popover px-3 py-2.5 text-xs shadow-md"
    >
      {state.kind === "downloading" ? (
        <span className="text-muted-foreground">
          Downloading update — {downloadProgressText(state.received, state.total)}
        </span>
      ) : state.kind === "error" ? (
        <span className="max-w-72 text-destructive">{state.message}</span>
      ) : (
        <span>
          Klepai {state.kind === "available" ? state.version : ""} is available.
        </span>
      )}
      {state.kind !== "downloading" && (
        <>
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            data-testid="update-banner-install"
            onClick={install}
          >
            {state.kind === "error" ? "Retry" : "Install"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            data-testid="update-banner-whats-new"
            onClick={() => openExternal(RELEASES_URL)}
          >
            See what&apos;s new
          </Button>
        </>
      )}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update banner"
        title="Dismiss"
        className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <IconX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
