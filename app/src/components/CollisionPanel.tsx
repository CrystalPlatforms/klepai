//! The collision notice above the composer (issue #38): another agent is
//! already working in this folder. A non-blocking panel — the composer
//! stays usable — and it never hard-blocks: "Run anyway" is always there.
//! "Run in worktree" appears only for git repositories (issue #39).

import { IconAlertTriangle } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import type { CollisionBlocker } from "@/types";

/** The user's decision: go ahead raw, isolate in a worktree, or cancel. */
export type CollisionChoice = "proceed" | "worktree" | null;

export function CollisionPanel({ blocker, hasGit, onChoose }: {
  blocker: CollisionBlocker;
  hasGit: boolean;
  onChoose: (choice: CollisionChoice) => void;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">
            Another agent is already working in this folder
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            “{blocker.title}” works in{" "}
            <span className="break-all font-mono">{blocker.path}</span> — two
            agents in one folder can overwrite each other's edits.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => onChoose("proceed")}
            >
              Run anyway
            </Button>
            {hasGit && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                title="The agent works in an isolated copy (branch klepai/agent-N) — the original folder stays untouched while it runs"
                onClick={() => onChoose("worktree")}
              >
                Run in worktree
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2.5 text-xs"
              onClick={() => onChoose(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
