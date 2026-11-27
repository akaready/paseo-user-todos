import { defineRpc, defineSettings, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";
import { TAG_HUES } from "./tags";

/** The panel's id, shared so the client entry and the auto-open path name the same one. */
export const PANEL_ID = "todos";

/**
 * Metadata key under which each chat stores its own ID. A panel in the Explorer is told which
 * chat has focus only through that chat's composer, and a composer carries no ID but does carry
 * its chat's metadata.
 */
export const AGENT_KEY = "user-todos.agent";

/**
 * Status colors: the theme's own, plus blue, which the theme lacks. Blue is Paseo's label blue,
 * as ink for the scheme in use.
 */
export const STATUS_COLORS = ["muted", "blue", "accent", "success", "warning", "danger"] as const;
export type StatusColor = (typeof STATUS_COLORS)[number];

/** The icons a status can wear: Lucide circles. */
export const STATUS_ICONS = [
  "Circle",
  "CircleDot",
  "CircleDashed",
  "CirclePause",
  "CircleCheck",
  "CircleX",
  "CircleAlert",
  "CircleHelp",
] as const;
export type StatusIcon = (typeof STATUS_ICONS)[number];

/** A status a todo can be in. A closing one moves the card to the bottom group and tells the agent. */
export const statusSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(16),
  color: z.enum(STATUS_COLORS),
  closes: z.boolean(),
  /** Settings saved before icons existed lack it; `statusIcon` fills the gap. */
  icon: z.enum(STATUS_ICONS).optional(),
});
export type Status = z.output<typeof statusSchema>;

export const DEFAULT_STATUSES: Status[] = [
  { id: "do", label: "TODO", color: "muted", closes: false, icon: "Circle" },
  { id: "doing", label: "DOING", color: "blue", closes: false, icon: "CircleDot" },
  { id: "done", label: "DONE", color: "success", closes: true, icon: "CircleCheck" },
  { id: "hold", label: "HOLD", color: "warning", closes: false, icon: "CirclePause" },
  { id: "cancel", label: "CANCEL", color: "danger", closes: true, icon: "CircleX" },
];

/** The colors earlier defaults gave each status, which a settings document may still hold from a past save. */
const OLD_DEFAULT_COLORS: Record<string, readonly string[]> = {
  do: ["muted"],
  doing: ["accent", "warning"],
  done: ["success"],
  hold: ["warning", "accent"],
  cancel: ["danger"],
};

/**
 * Statuses as the plugin works with them. A list that is still the first defaults (settings
 * save every value, so an untouched list gets saved too) becomes the current defaults; otherwise
 * the user's choices stand and a missing icon is filled in.
 */
export function normalizeStatuses(list: readonly Status[]): Status[] {
  const untouched =
    list.length === DEFAULT_STATUSES.length &&
    list.every(
      (status, at) =>
        status.id === DEFAULT_STATUSES[at]!.id &&
        currentLabel(status) === DEFAULT_STATUSES[at]!.label &&
        status.closes === DEFAULT_STATUSES[at]!.closes &&
        (OLD_DEFAULT_COLORS[status.id] ?? []).includes(status.color) &&
        !status.icon,
    );
  if (untouched) return DEFAULT_STATUSES.map((status) => ({ ...status }));
  return list.map((status) => ({ ...status, label: currentLabel(status), icon: statusIcon(status) }));
}

/** The first status was called DO before it became TODO; a saved list that still says DO reads as TODO. */
function currentLabel(status: Status): string {
  return status.id === "do" && status.label === "DO" ? "TODO" : status.label;
}

/** A status's icon: its own, else its default's, else a plain circle. */
export function statusIcon(status: Status): StatusIcon {
  return status.icon ?? DEFAULT_STATUSES.find((other) => other.id === status.id)?.icon ?? "Circle";
}

/** `status` is a sort from before grouping existed: it reads as group by status, newest first. */
export const SORTS = ["newest", "oldest", "manual", "status"] as const;
export type Sort = (typeof SORTS)[number];
export const GROUPS = ["chat", "status"] as const;
export type Group = (typeof GROUPS)[number];

/** How the list is grouped and sorted, with a saved sort of "status" read as its replacement. */
export function viewOf(values: { sort: Sort; group: Group }): { group: Group; sort: Exclude<Sort, "status"> } {
  return values.sort === "status" ? { group: "status", sort: "newest" } : { group: values.group, sort: values.sort };
}

export const todoSettings = defineSettings({
  id: "preferences",
  scope: "host",
  version: 1,
  schema: z.object({
    graceTurns: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
    autoOpen: z.boolean().default(true),
    confetti: z.boolean().default(true),
    sort: z.enum(SORTS).default("newest"),
    group: z.enum(GROUPS).default("chat"),
    /** The list, in the order the dropdown shows it. The first open one is what a new todo starts as. */
    statuses: z.array(statusSchema).min(2).default(DEFAULT_STATUSES),
    /**
     * The plugin's own record of labels made from the panel: each name with the color the user picked.
     * Paseo gives a created label violet and the plugin API cannot recolor it, so the chosen color lives here.
     */
    tags: z.array(z.object({ name: z.string().min(1).max(24), color: z.enum(TAG_HUES) })).default([]),
  }),
});

/**
 * A todo's status in this list. One whose status was removed from the list counts as the first
 * open status, so nothing is ever without one.
 */
export function resolveStatus(statuses: readonly Status[], statusId: string): Status {
  return statuses.find((status) => status.id === statusId) ?? firstStatus(statuses, false);
}

/** The status ticking sets (`closes` true) or unticking sets (false): the first of its kind. */
export function firstStatus(statuses: readonly Status[], closes: boolean): Status {
  return statuses.find((status) => status.closes === closes) ?? statuses[0] ?? DEFAULT_STATUSES[closes ? 2 : 0]!;
}

export type TodoSettings = z.output<typeof todoSettings.schema>;

export const LIST_STYLES = ["bullets", "numbers"] as const;
export type ListStyle = (typeof LIST_STYLES)[number];

export const todoStepSchema = z.object({ text: z.string(), done: z.boolean() });
export const todoLinkSchema = z.object({ url: z.string(), label: z.string().optional() });

/** The most a comment may hold. */
export const COMMENT_MAX = 2000;

/** A note the user left on a todo. Removed ones are kept in the store and never reach the wire. */
export const todoCommentSchema = z.object({ id: z.string(), text: z.string(), at: z.number() });

export const todoSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  workspaceId: z.string().nullable(),
  chatTitle: z.string().nullable(),
  title: z.string(),
  why: z.string(),
  steps: z.array(todoStepSchema),
  /** How steps are drawn: the proposing agent picks. Todos saved without one are bullets. */
  listStyle: z.enum(LIST_STYLES),
  links: z.array(todoLinkSchema),
  /** `withdrawn` shows only in the Done group; a todo still waiting out its turns is never listed. */
  status: z.enum(["open", "withdrawn"]),
  /** The user's status for it, always one in the current list. */
  statusId: z.string(),
  /** Whether that status closes the todo, so the card sits in the bottom group. */
  closed: z.boolean(),
  tags: z.array(z.string()),
  /** The user's comments, oldest first. The agent gets them when the todo closes. */
  comments: z.array(todoCommentSchema),
  /** The user made it, so it has no turn or message, and closing it tells no one. */
  user: z.boolean(),
  /** Its place in its chat's manual order, from 0. */
  rank: z.number(),
  /** Milliseconds since the epoch, when the agent proposed it. */
  createdAt: z.number(),
  turn: z.number().nullable(),
  turnId: z.string().nullable(),
  /** The assistant message the todo came from, and the tool call that proposed it, for Jump to chat. */
  messageId: z.string().nullable(),
  callId: z.string().nullable(),
  /** Whether the agent got the closed or reopened line. */
  told: z.boolean(),
});

export type Todo = z.output<typeof todoSchema>;
export type TodoStep = z.output<typeof todoStepSchema>;
export type TodoComment = z.output<typeof todoCommentSchema>;

export const listTodos = defineRpc({
  name: "todos.list",
  input: z.object({ workspaceId: z.string().optional(), agentId: z.string().optional() }),
  output: z.object({
    todos: z.array(todoSchema),
    /** Proposals still waiting out their turns: how many more turns each needs. */
    pending: z.array(z.object({ agentId: z.string(), left: z.number() })),
  }),
});

export const setStatus = defineRpc({
  name: "todos.status",
  input: z.object({ id: z.string(), statusId: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

/** Paseo's own workspace labels, read from its file, in its order: the only labels there are. Read-only here. */
export const paseoLabels = defineRpc({
  name: "todos.paseo-labels",
  input: z.object({}),
  output: z.object({ labels: z.array(z.object({ name: z.string(), color: z.enum(TAG_HUES) })) }),
});

/**
 * Makes a label in Paseo without keeping it on anything: the plugin API can only create one by
 * assigning it to a workspace, so it is assigned to this workspace and taken off again at once.
 */
export const createLabel = defineRpc({
  name: "todos.label-create",
  input: z.object({ workspaceId: z.string(), name: z.string() }),
  output: z.object({ name: z.string().nullable(), error: z.string().optional() }),
});

/** Archives a todo: it leaves the list (flagged cleared, never deleted) and the agent that proposed it is told. */
export const archiveTodo = defineRpc({
  name: "todos.archive",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

export const setTags = defineRpc({
  name: "todos.tags",
  input: z.object({ id: z.string(), tags: z.array(z.string()) }),
  output: z.object({ ok: z.boolean() }),
});

/** Leaves a comment on a todo. */
export const addComment = defineRpc({
  name: "todos.comment-add",
  input: z.object({ id: z.string(), text: z.string().max(COMMENT_MAX) }),
  output: z.object({ comment: todoCommentSchema.nullable() }),
});

/** Hides a comment. It stays in the store, flagged removed. */
export const removeComment = defineRpc({
  name: "todos.comment-remove",
  input: z.object({ id: z.string(), commentId: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

/** Saves the order the user dragged a chat's todos into. */
export const reorderTodos = defineRpc({
  name: "todos.reorder",
  input: z.object({ agentId: z.string(), ids: z.array(z.string()) }),
  output: z.object({ ok: z.boolean() }),
});

/** A todo the user makes themselves, in the chat they are looking at. */
export const addTodo = defineRpc({
  name: "todos.add",
  input: z.object({
    agentId: z.string(),
    workspaceId: z.string(),
    chatTitle: z.string().nullable(),
    title: z.string().trim().min(1).max(120),
    why: z.string().max(400),
    steps: z.array(z.string()).max(12),
    listStyle: z.enum(LIST_STYLES).optional(),
    statusId: z.string().optional(),
    links: z.array(z.string()).max(8),
    tags: z.array(z.string()),
  }),
  output: z.object({ ok: z.boolean(), error: z.string().optional() }),
});

export const clearTodos = defineRpc({
  name: "todos.clear",
  input: z.object({ workspaceId: z.string().optional(), agentId: z.string().optional() }),
  output: z.object({ cleared: z.number() }),
});

export const watchTodos = defineSubscription({
  name: "todos.watch",
  input: z.object({}),
  event: z.object({
    agentId: z.string(),
    workspaceId: z.string().nullable(),
    /** `visible` is a chat's first todo coming into view while auto-open is on. */
    kind: z.enum(["changed", "visible", "labels"]),
  }),
});

/**
 * Splits a link into the host and a path. The host is kept whole, a long path is shortened in
 * the middle ("/acme/…/environment-variables") and never cut at its end: what is left may wrap
 * onto a second line, but no word of it is ever dropped or clipped.
 */
export function describeLink(url: string): { host: string; path: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { host: url, path: "" };
  }
  const host = parsed.host;
  const segments = `${parsed.pathname}${parsed.search}`.split("/").filter(Boolean);
  if (segments.length === 0) return { host, path: "" };
  const full = `/${segments.join("/")}`;
  if (full.length <= 26 || segments.length <= 2) return { host, path: full };
  return { host, path: `/${segments[0]}/…/${segments[segments.length - 1]}` };
}
