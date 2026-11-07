import { IconArrowBackUp, IconChevronLeft, IconChevronRight, IconCopy, IconPencil, IconRefresh, IconScissors, IconTrash, IconX } from "@/components/ui/icons";

import type { Message, MessageVariant } from "@/types";
import { isReasoningTitle, parseActivity } from "@/types";
import { MarkdownMessage, ThinkingBlock } from "@/components/Markdown";
import { ActivityBlock } from "@/components/ActivityBlock";
import { parseTodoWrite } from "@/lib/klepaiBlocks";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface MessageViewProps {
  message: Message;
  /** Flash highlight after a search jump. */
  highlighted?: boolean;
  /** Regenerate affordance — the last assistant message only. */
  showRegenerate?: boolean;
  onRegenerate?: () => void;
  /** Variant ring of the last assistant answer (issues #43/#45): kept
   * answers navigable with `<` `>`. Rendered on the newest assistant
   * bubble only; absent for messages without kept variants. */
  variants?: MessageVariant[];
  /** Steps the ring by one position — clamped at the ends by the caller. */
  onStepVariant?: (delta: 1 | -1) => void;
  /** Edit affordance — the user's own messages. */
  onEdit?: () => void;
  onReply?: () => void;
  onDelete?: () => void;
  onFork?: () => void;
}

/**
 * One message in the thread: user messages keep a green bubble, assistant
 * messages render bare — rich markdown with a collapsible thinking block,
 * matching the chrome-less streaming view. Hover reveals the control
 * affordances (edit / regenerate); right-click opens the full action menu.
 */
export function MessageView({
  message,
  highlighted = false,
  showRegenerate = false,
  onRegenerate,
  variants,
  onStepVariant,
  onEdit,
  onReply,
  onDelete,
  onFork,
}: MessageViewProps) {
  const controls =
    !showRegenerate && !onEdit ? null : (
      <div className="group-hover/message:opacity-100 flex gap-1 opacity-0 transition-opacity">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit message"
            title="Edit message"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <IconPencil className="h-3.5 w-3.5" />
          </button>
        )}
        {showRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            aria-label="Regenerate reply"
            title="Regenerate reply"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <IconRefresh className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );

  // The variant ring readout (issues #43/#45): position readout with `<` `>`
  // when there is something to step, the shown variant's model label, and
  // the "aborted" marker on stopped attempts. The row renders whenever the
  // answer keeps variants — even a single one — so an aborted first attempt
  // still shows its evidence.
  const shownVariant = variants?.find((variant) => variant.visible) ?? null;
  const variantCount = variants?.length ?? 0;
  const stepClass =
    "rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
  const variantRow =
    message.role !== "assistant" || shownVariant == null ? null : (
      <div
        data-testid="variant-nav"
        className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"
      >
        <span data-testid="variant-readout" className="font-mono">
          {shownVariant.ordinal}/{variantCount}
        </span>
        {variantCount > 1 && onStepVariant && (
          <>
            <button
              type="button"
              onClick={() => onStepVariant(-1)}
              disabled={shownVariant.ordinal <= 1}
              aria-label="Previous variant"
              title="Previous variant"
              className={stepClass}
            >
              <IconChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onStepVariant(1)}
              disabled={shownVariant.ordinal >= variantCount}
              aria-label="Next variant"
              title="Next variant"
              className={stepClass}
            >
              <IconChevronRight className="h-3.5 w-3.5" />
            </button>
          </>
        )}
        {shownVariant.model_id && (
          <span data-testid="variant-model" className="font-mono" title="Model that produced this answer">
            {shownVariant.model_id}
          </span>
        )}
        {shownVariant.aborted && (
          <span
            data-testid="variant-aborted"
            title="This attempt was stopped before finishing"
            className="rounded-[4px] border border-amber-500/40 bg-amber-500/10 px-1 py-px font-mono text-amber-600 dark:text-amber-500"
          >
            aborted
          </span>
        )}
      </div>
    );

  const body =
    message.role === "user" ? (
      <div
        data-message-id={message.id}
        className={cn(
          "group/message animate-message-in flex w-full flex-col items-end rounded-lg",
          highlighted && "animate-highlight-pulse"
        )}
      >
        <div className="flex max-w-[85%] items-end gap-1">
          {controls}
          <div className="rounded-xl bg-primary px-3.5 py-2 text-primary-foreground">
            {message.skill_name && (
              <p className="mb-1 flex justify-end">
                <span
                  title="Skill invoked with this message"
                  className="inline-flex items-center rounded-[4px] border border-primary-foreground/30 bg-primary-foreground/10 px-1.5 py-0.5 font-mono text-[11px] text-primary-foreground/80"
                >
                  /{message.skill_name}
                </span>
              </p>
            )}
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            {message.images.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.images.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt={`Attachment ${index + 1}`}
                    className="max-h-40 max-w-[16rem] rounded-lg border border-border object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    ) : message.role === "tool" ? (
      // Agent output between messages: reasoning renders as plain italic
      // text (no frame), real tool calls as collapsible activity blocks.
      (() => {
        const activity = parseActivity(message.content);
        // Claude's TodoWrite and klepai-todos feed the pinned goal-progress
        // widget only — rendering every update here would stack a block
        // per step (issue #22 feedback). They leave no trace in the thread.
        if (parseTodoWrite(activity.detail)) {
          return (
            <div
              data-message-id={message.id}
              aria-hidden
              className="hidden"
            />
          );
        }
        return (
          <div
            data-message-id={message.id}
            className={cn(
              "group/message animate-message-in flex w-full justify-start rounded-lg px-1",
              highlighted && "animate-highlight-pulse"
            )}
          >
            <div className="w-full max-w-[85%] min-w-0">
              {isReasoningTitle(activity.title) ? (
                <p className="whitespace-pre-wrap text-xs italic text-muted-foreground">
                  {activity.detail}
                </p>
              ) : (
                <ActivityBlock {...activity} />
              )}
              {controls && <div className="mt-1">{controls}</div>}
            </div>
          </div>
        );
      })()
    ) : (
      <div
        data-message-id={message.id}
        className={cn(
          "group/message animate-message-in flex w-full justify-start rounded-lg px-1",
          highlighted && "animate-highlight-pulse"
        )}
      >
        <div className="max-w-[85%] min-w-0 has-[[data-klepai-table]]:max-w-full">
          {message.thinking && <ThinkingBlock thinking={message.thinking} />}
          <MarkdownMessage content={message.content} />
          {variantRow}
          {message.images.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.images.map((image, index) => (
                <img
                  key={index}
                  src={image}
                  alt={`Attachment ${index + 1}`}
                  className="max-h-40 max-w-[16rem] rounded-lg border border-border object-cover"
                />
              ))}
            </div>
          )}
          {controls && <div className="mt-1">{controls}</div>}
        </div>
      </div>
    );

  // Activity blocks copy their readable detail; other messages copy verbatim.
  const copyText =
    message.role === "tool" ? parseActivity(message.content).detail : message.content;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
      <ContextMenuContent>
        {onEdit && (
          <ContextMenuItem onSelect={onEdit}>
            <IconPencil className="mr-2 h-4 w-4" />
            Edit
          </ContextMenuItem>
        )}
        {onReply && (
          <ContextMenuItem onSelect={onReply}>
            <IconArrowBackUp className="mr-2 h-4 w-4" />
            Reply
          </ContextMenuItem>
        )}
        {onFork && (
          <ContextMenuItem onSelect={onFork}>
            <IconScissors className="mr-2 h-4 w-4" />
            Fork from this
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() => void navigator.clipboard.writeText(copyText)}
        >
          <IconCopy className="mr-2 h-4 w-4" />
          Copy
        </ContextMenuItem>
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={onDelete}
            >
              <IconTrash className="mr-2 h-4 w-4" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Attachment previews shown inside the composer before sending. */
export function PendingImages({
  images,
  onRemove,
}: {
  images: string[];
  onRemove: (index: number) => void;
}) {
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2">
      {images.map((image, index) => (
        <div key={index} className="relative">
          <img
            src={image}
            alt={`Attachment ${index + 1}`}
            className="h-14 w-14 rounded-md border border-border object-cover"
          />
          <button
            type="button"
            aria-label={`Remove attachment ${index + 1}`}
            onClick={() => onRemove(index)}
            className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:text-destructive"
          >
            <IconX className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
