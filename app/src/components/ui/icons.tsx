//! The app's single icon source (issue #35): every icon the UI renders is
//! a Tabler icon, re-exported from here with shared defaults — stroke
//! stays 2 and size rides the Tailwind classes at the call sites. Icons
//! count as decorative unless a call site passes an aria-label; decorative
//! ones get aria-hidden, meaningful ones stay exposed to assistive tech.
//!
//! Mapping of the pre-Tabler icon names this file replaced:
//!   ArrowDown → IconArrowDown          ArrowUp → IconArrowUp
//!   ArrowUpDown → IconArrowsSort       Check → IconCheck
//!   ChevronDown → IconChevronDown      ChevronRight → IconChevronRight
//!   Circle → IconCircle                CircleCheck → IconCircleCheck
//!   CircleDotDashed → IconCircleDashed Copy → IconCopy
//!   FileText → IconFileText            Info → IconInfoCircle
//!   Loader2 → IconLoader2              MessageSquare → IconMessage
//!   PanelLeftClose → IconLayoutSidebarLeftCollapse
//!   PanelLeftOpen → IconLayoutSidebarLeftExpand
//!   PanelRightClose → IconLayoutSidebarRightCollapse
//!   PanelRightOpen → IconLayoutSidebarRightExpand
//!   Paperclip → IconPaperclip          Pencil → IconPencil
//!   PlugZap → IconPlugConnected        Plus → IconPlus
//!   RefreshCw → IconRefresh            Reply → IconArrowBackUp
//!   Scissors → IconScissors            Search → IconSearch
//!   SendHorizontal → IconSend          Settings → IconSettings
//!   ShieldAlert → IconShieldExclamation Square → IconSquare
//!   Terminal → IconTerminal            Trash2 → IconTrash
//!   TriangleAlert → IconAlertTriangle  Wrench → IconTool
//!   X → IconX

import type { IconProps, TablerIcon } from "@tabler/icons-react";
import {
  IconAlertTriangle as TablerAlertTriangle,
  IconArrowBackUp as TablerArrowBackUp,
  IconArrowDown as TablerArrowDown,
  IconArrowUp as TablerArrowUp,
  IconArrowsSort as TablerArrowsSort,
  IconCheck as TablerCheck,
  IconChevronDown as TablerChevronDown,
  IconChevronRight as TablerChevronRight,
  IconCircle as TablerCircle,
  IconCircleCheck as TablerCircleCheck,
  IconCircleDashed as TablerCircleDashed,
  IconCopy as TablerCopy,
  IconFileText as TablerFileText,
  IconInfoCircle as TablerInfoCircle,
  IconLayoutSidebarLeftCollapse as TablerLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand as TablerLayoutSidebarLeftExpand,
  IconLayoutSidebarRightCollapse as TablerLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand as TablerLayoutSidebarRightExpand,
  IconLoader2 as TablerLoader2,
  IconMessage as TablerMessage,
  IconPaperclip as TablerPaperclip,
  IconPencil as TablerPencil,
  IconPlugConnected as TablerPlugConnected,
  IconPlus as TablerPlus,
  IconRefresh as TablerRefresh,
  IconScissors as TablerScissors,
  IconSearch as TablerSearch,
  IconSend as TablerSend,
  IconSettings as TablerSettings,
  IconShieldExclamation as TablerShieldExclamation,
  IconSquare as TablerSquare,
  IconTerminal as TablerTerminal,
  IconTool as TablerTool,
  IconTrash as TablerTrash,
  IconX as TablerX,
} from "@tabler/icons-react";

/** Wraps one Tabler icon with the app-wide defaults: stroke 2 unless the
 * call site overrides it, and aria-hidden for decorative icons — any icon
 * carrying an aria-label is meaningful and stays exposed. */
function tabler(Icon: TablerIcon) {
  return function TablerIcon({
    "aria-label": label,
    stroke = 2,
    ...props
  }: IconProps) {
    return (
      <Icon
        aria-hidden={label === undefined ? true : undefined}
        stroke={stroke}
        {...props}
      />
    );
  };
}

export const IconAlertTriangle = tabler(TablerAlertTriangle);
export const IconArrowBackUp = tabler(TablerArrowBackUp);
export const IconArrowDown = tabler(TablerArrowDown);
export const IconArrowUp = tabler(TablerArrowUp);
export const IconArrowsSort = tabler(TablerArrowsSort);
export const IconCheck = tabler(TablerCheck);
export const IconChevronDown = tabler(TablerChevronDown);
export const IconChevronRight = tabler(TablerChevronRight);
export const IconCircle = tabler(TablerCircle);
export const IconCircleCheck = tabler(TablerCircleCheck);
export const IconCircleDashed = tabler(TablerCircleDashed);
export const IconCopy = tabler(TablerCopy);
export const IconFileText = tabler(TablerFileText);
export const IconInfoCircle = tabler(TablerInfoCircle);
export const IconLayoutSidebarLeftCollapse = tabler(TablerLayoutSidebarLeftCollapse);
export const IconLayoutSidebarLeftExpand = tabler(TablerLayoutSidebarLeftExpand);
export const IconLayoutSidebarRightCollapse = tabler(TablerLayoutSidebarRightCollapse);
export const IconLayoutSidebarRightExpand = tabler(TablerLayoutSidebarRightExpand);
export const IconLoader2 = tabler(TablerLoader2);
export const IconMessage = tabler(TablerMessage);
export const IconPaperclip = tabler(TablerPaperclip);
export const IconPencil = tabler(TablerPencil);
export const IconPlugConnected = tabler(TablerPlugConnected);
export const IconPlus = tabler(TablerPlus);
export const IconRefresh = tabler(TablerRefresh);
export const IconScissors = tabler(TablerScissors);
export const IconSearch = tabler(TablerSearch);
export const IconSend = tabler(TablerSend);
export const IconSettings = tabler(TablerSettings);
export const IconShieldExclamation = tabler(TablerShieldExclamation);
export const IconSquare = tabler(TablerSquare);
export const IconTerminal = tabler(TablerTerminal);
export const IconTool = tabler(TablerTool);
export const IconTrash = tabler(TablerTrash);
export const IconX = tabler(TablerX);
