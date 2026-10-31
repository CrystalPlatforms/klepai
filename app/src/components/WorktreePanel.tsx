//! End of a worktree run (issues #40/#41) — a non-blocking panel above the
//! composer; the composer stays usable. `changes`: the branch holds an
//! auto-commit (Klepai commits in the copy — the main history is never
//! touched) and the user picks [Merge into project] or [Keep branch].
//! `clean`: nothing to merge — an informational notice only.

import { IconInfoCircle } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

/** The end-of-run info the backend sent: what the branch holds. */
export interface WorktreeInfo {
  status: "clean" | "changes";
  branch: string;
  path: string;
  summary: string;
}

export function WorktreePanel({ info, onResolve, onDismiss }: {
  info: WorktreeInfo;
  onResolve: (merge: boolean) => void;
  onDismiss: () => void;
}) {
  if (info.status === "clean") {
    return (
      <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <IconInfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">
              Nothing to merge
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              The agent made no changes in the worktree — no commit was made
              and the branch was removed.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={onDismiss}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
      <p className="text-xs font-medium text-foreground">
        Agent work ready to merge
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Klepai committed the agent's work on{" "}
        <span className="font-mono">{info.branch}</span> — merge it into the
        project, or keep the branch for a manual merge.
      </p>
      {info.summary.length > 0 && (
        <pre className="mt-1.5 max-h-24 overflow-y-auto rounded border border-border bg-card p-2 text-[11px]">
          {info.summary}
        </pre>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => onResolve(true)}
        >
          Merge into project
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2.5 text-xs"
          title="Removes the worktree folder but keeps the branch — merge later with git merge"
          onClick={() => onResolve(false)}
        >
          Keep branch
        </Button>
      </div>
    </div>
  );
}
