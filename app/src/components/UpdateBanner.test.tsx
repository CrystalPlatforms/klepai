//! UpdateBanner (issue #44).
//!
//! Assumptions these tests encode:
//! - Exactly one check per mount, through the injected UpdaterApi seam. Only
//!   an "available" verdict raises the banner (with the new version on it);
//!   quiet verdicts (up-to-date, no-release, not-configured) and an error
//!   verdict (offline) render nothing.
//! - Install drives the existing install flow: progress text while the
//!   download events arrive, then a relaunch through the api after a
//!   successful install — one click, download + apply + restart.
//! - "See what's new" opens the GitHub Releases URL through the injected
//!   opener seam.
//! - X dismisses for the session only: the banner hides and comes back on a
//!   fresh mount — no persisted state anywhere.

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { UpdateBanner, RELEASES_URL } from "./UpdateBanner";
import type { DownloadEvent, UpdateResource, UpdaterApi } from "@/lib/updater";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A fake updater api: preflight "ok", a 0.2.0 release found, install
 * emits Started + two Progress events before resolving. */
function fakeApi(overrides: Partial<UpdaterApi> = {}): UpdaterApi {
  return {
    preflight: vi.fn().mockResolvedValue("ok"),
    check: vi.fn().mockResolvedValue({ version: "0.2.0" }),
    install: vi.fn().mockImplementation(
      (_update: UpdateResource, onEvent: (event: DownloadEvent) => void) => {
        onEvent({ event: "Started", data: { contentLength: 2 * 1024 * 1024 } });
        onEvent({ event: "Progress", data: { chunkLength: 1024 * 1024 } });
        onEvent({ event: "Progress", data: { chunkLength: 1024 * 1024 } });
        return Promise.resolve();
      },
    ),
    relaunch: vi.fn(),
    ...overrides,
  };
}

describe("UpdateBanner", () => {
  it("checks once per mount and renders the new version on available", async () => {
    const api = fakeApi();
    render(<UpdateBanner api={api} />);
    const banner = await screen.findByTestId("update-banner");
    expect(banner).toHaveTextContent("Klepai 0.2.0 is available.");
    expect(api.preflight).toHaveBeenCalledTimes(1);
    expect(api.check).toHaveBeenCalledTimes(1);
  });

  it("renders nothing on up-to-date", async () => {
    const api = fakeApi({ check: vi.fn().mockResolvedValue(null) });
    const { container } = render(<UpdateBanner api={api} />);
    await waitFor(() => expect(api.check).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="update-banner"]')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the quiet no-release verdict", async () => {
    const api = fakeApi({ preflight: vi.fn().mockResolvedValue("no-release") });
    const { container } = render(<UpdateBanner api={api} />);
    await waitFor(() => expect(api.preflight).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on the quiet not-configured verdict", async () => {
    const api = fakeApi({ preflight: vi.fn().mockResolvedValue("unconfigured") });
    const { container } = render(<UpdateBanner api={api} />);
    await waitFor(() => expect(api.preflight).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on an error verdict (offline)", async () => {
    const api = fakeApi({
      check: vi.fn().mockRejectedValue(new Error("error sending request")),
    });
    const { container } = render(<UpdateBanner api={api} />);
    await waitFor(() => expect(api.check).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("install reports download progress and relaunches after success", async () => {
    const api = fakeApi();
    render(<UpdateBanner api={api} />);
    fireEvent.click(await screen.findByTestId("update-banner-install"));
    expect(api.install).toHaveBeenCalledWith(
      expect.objectContaining({ version: "0.2.0" }),
      expect.any(Function),
    );
    // Progress readout while the download events land (the fake emits all
    // its events before resolving, so the settled readout is the full 2 MB)…
    await screen.findByText(/Downloading update — 2\.0 MB of 2\.0 MB/);
    // …then the relaunch lands once the install resolves.
    await waitFor(() => expect(api.relaunch).toHaveBeenCalledTimes(1));
  });

  it("'See what's new' opens the GitHub Releases page", async () => {
    const openExternal = vi.fn();
    const api = fakeApi();
    render(<UpdateBanner api={api} openExternal={openExternal} />);
    fireEvent.click(await screen.findByTestId("update-banner-whats-new"));
    expect(openExternal).toHaveBeenCalledWith(RELEASES_URL);
  });

  it("the X dismisses for the session — the banner returns on the next mount", async () => {
    const api = fakeApi();
    const { unmount } = render(<UpdateBanner api={api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss update banner" }));
    expect(screen.queryByTestId("update-banner")).not.toBeInTheDocument();

    // A fresh mount is the next app launch: no persisted dismissal.
    unmount();
    render(<UpdateBanner api={api} />);
    expect(await screen.findByTestId("update-banner")).toBeInTheDocument();
    // Still exactly one check per mount, not one per app run.
    expect(api.check).toHaveBeenCalledTimes(2);
  });
});
