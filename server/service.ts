import type { PluginHookAgent, PluginHandlerContext, PluginSettings } from "@getpaseo/plugin/server";
import { cleanTags, normalizeTag, tagKey } from "../shared/tags";
import { readPaseoLabels } from "./paseo-labels";
import {
  COMMENT_MAX,
  firstStatus,
  normalizeStatuses,
  resolveStatus,
  type Status,
  type Todo,
  type TodoSettings,
  todoSettings,
} from "../shared/todos";
import { type StoredComment, type StoredTodo, TodoStore } from "./store";

type Paseo = PluginHandlerContext["paseo"];
type Settings = PluginSettings<typeof todoSettings.schema>;

export interface TodoEvent {
  agentId: string;
  workspaceId: string | null;
  kind: "changed" | "visible" | "labels";
}

export interface ProposalInput {
  title: string;
  why: string;
  steps: string[];
  listStyle?: "bullets" | "numbers";
  links: { url: string; label?: string }[];
}

export interface UserTodoInput {
  agentId: string;
  workspaceId: string;
  chatTitle: string | null;
  title: string;
  why: string;
  steps: string[];
  listStyle?: "bullets" | "numbers";
  statusId?: string;
  links: string[];
  tags: string[];
}

/** Collapses whitespace so a title never breaks the one-line message the agent gets. */
const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** The comments an agent reads, oldest first: the ones the user has not removed. */
const live = (comments: readonly StoredComment[]) => comments.filter((comment) => !comment.removed);

/** "Comments:" and one "- text" line each, for the end of a message to the agent. A comment's own line breaks are indented under its dash. */
function commentLines(comments: readonly StoredComment[]): string {
  if (comments.length === 0) return "";
  return `\nComments:\n${comments.map((comment) => `- ${comment.text.replace(/\n/g, "\n  ")}`).join("\n")}`;
}

/**
 * The to-do list's brain: holds proposals back until enough turns have passed, tells the agent
 * when the user closes one, and tells every connected panel when something changed.
 */
export class TodoService {
  readonly store = new TodoStore();
  private readonly listeners = new Set<(event: TodoEvent) => void>();
  /** The turn each chat is in right now, from the turn hooks. */
  private readonly active = new Map<string, string | null>();

  constructor(private readonly settings: Settings) {}

  async values(): Promise<TodoSettings> {
    const state = await this.settings.read();
    const values = todoSettings.schema.parse(state.status === "ready" ? state.values : {});
    return { ...values, statuses: normalizeStatuses(values.statuses) };
  }

  subscribe(listener: (event: TodoEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Paseo's label file changed. */
  emitLabels() {
    this.emit({ agentId: "", workspaceId: null, kind: "labels" });
  }

  private emit(event: TodoEvent) {
    for (const listener of this.listeners) listener(event);
  }

  // ---- reading -------------------------------------------------------------------------

  async list(filter: { workspaceId?: string; agentId?: string }) {
    await this.store.ready;
    const mine = this.store.all().filter(
      (todo) =>
        (!filter.workspaceId || todo.workspaceId === filter.workspaceId) &&
        (!filter.agentId || todo.agentId === filter.agentId),
    );
    const { graceTurns: grace, statuses } = await this.values();
    const ranks = new Map<string, number>();
    for (const agentId of new Set(mine.map((todo) => todo.agentId))) {
      this.store.orderOf(agentId).forEach((id, at) => ranks.set(id, at));
    }
    const todos = mine
      .filter((todo) => todo.status === "open")
      .map((todo) => toWire(todo, statuses, ranks.get(todo.id) ?? 0));
    const pending = mine
      .filter((todo) => todo.status === "pending")
      .map((todo) => ({ agentId: todo.agentId, left: Math.max(1, grace - todo.turnsSeen.length) }));
    return { todos, pending };
  }

  /** What the agent can see of its own list: no other chat's todos. */
  async listForAgent(agentId: string) {
    await this.store.ready;
    const { statuses } = await this.values();
    return this.store
      .all()
      .filter((todo) => todo.agentId === agentId && todo.status !== "withdrawn")
      .map((todo) => ({
        todo,
        comments: live(todo.comments),
        state: todo.status === "pending" ? "pending" : resolveStatus(statuses, todo.statusId).label,
      }));
  }

  // ---- the agent's side ----------------------------------------------------------------

  async propose(agent: PluginHookAgent, paseo: Paseo, input: ProposalInput) {
    await this.store.ready;
    const { statuses } = await this.values();
    const twin = this.store
      .all()
      .find(
        (todo) =>
          todo.agentId === agent.id &&
          (todo.status === "pending" || (todo.status === "open" && !resolveStatus(statuses, todo.statusId).closes)) &&
          todo.title.toLowerCase() === input.title.toLowerCase(),
      );
    if (twin) return { id: twin.id, duplicate: true };

    const turnId = await this.currentTurn(agent.id, paseo);
    const todo: StoredTodo = {
      id: this.store.newId(),
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      chatTitle: agent.title,
      title: oneLine(input.title),
      why: oneLine(input.why),
      steps: input.steps.map((text) => ({ text: oneLine(text), done: false })),
      listStyle: input.listStyle ?? "bullets",
      links: input.links.map(({ url, label }) => ({ url, label: label ? oneLine(label) : undefined })),
      status: "pending",
      statusId: firstStatus(statuses, false).id,
      tags: [],
      comments: [],
      user: false,
      createdAt: Date.now(),
      turn: Math.max(1, this.store.turnCount(agent.id)),
      turnId,
      messageId: null,
      callId: null,
      told: false,
      withdrawReason: null,
      turnsSeen: [],
      skipFirstEnd: turnId === null,
    };
    this.store.add(todo);
    await this.store.save();
    // The call is on the timeline while it runs, so its row can be found now.
    void this.findSource(paseo, todo.id);
    this.emit({ agentId: agent.id, workspaceId: agent.workspaceId, kind: "changed" });
    return { id: todo.id, duplicate: false };
  }

  async withdraw(agentId: string, id: string, reason: string) {
    await this.store.ready;
    const todo = this.store.get(id);
    if (!todo || todo.agentId !== agentId) return "unknown" as const;
    if (todo.status === "withdrawn") return todo.status;
    const { statuses } = await this.values();
    if (todo.status === "open" && resolveStatus(statuses, todo.statusId).closes) return "done" as const;
    todo.status = "withdrawn";
    todo.withdrawReason = oneLine(reason);
    await this.store.save();
    this.emit({ agentId, workspaceId: todo.workspaceId, kind: "changed" });
    return "withdrawn" as const;
  }

  // ---- turns ---------------------------------------------------------------------------

  async turnStarted(agent: PluginHookAgent, turnId: string | null) {
    this.active.set(agent.id, turnId);
    await this.store.ready;
    this.store.startTurn(agent.id);
    await this.store.save();
  }

  async turnEnded(agent: PluginHookAgent, turnId: string | null, completed: boolean, paseo: Paseo) {
    await this.store.ready;
    if (this.active.get(agent.id) === turnId) this.active.delete(agent.id);
    // The turn is whole now, so the message the todo came from can be picked.
    if (turnId !== null) {
      for (const todo of this.store.all()) {
        if (todo.agentId === agent.id && todo.turnId === turnId && todo.status !== "withdrawn") {
          await this.findSource(paseo, todo.id);
        }
      }
    }
    const waiting = this.store.all().filter((todo) => todo.agentId === agent.id && todo.status === "pending");
    if (waiting.length === 0) return;
    const { graceTurns: grace, statuses } = await this.values();
    let shown = false;
    let first = false;
    for (const todo of waiting) {
      if (todo.skipFirstEnd) {
        todo.skipFirstEnd = false;
        continue;
      }
      if (turnId !== null && todo.turnId === turnId) continue;
      // A turn the user could not answer, because it failed or was stopped, is not one to wait out.
      if (!completed) continue;
      if (turnId !== null && todo.turnsSeen.includes(turnId)) continue;
      todo.turnsSeen.push(turnId ?? `unknown-${todo.turnsSeen.length}`);
      if (todo.turnsSeen.length < grace) continue;
      first ||= !this.store
        .all()
        .some(
          (other) =>
            other.agentId === agent.id &&
            other.status === "open" &&
            !resolveStatus(statuses, other.statusId).closes,
        );
      todo.status = "open";
      todo.shown = true;
      shown = true;
    }
    await this.store.save();
    if (!shown) {
      this.emit({ agentId: agent.id, workspaceId: agent.workspaceId, kind: "changed" });
      return;
    }
    const autoOpen = first && (await this.values()).autoOpen && this.store.claimAutoOpen(agent.id);
    if (autoOpen) await this.store.save();
    this.emit({ agentId: agent.id, workspaceId: agent.workspaceId, kind: autoOpen ? "visible" : "changed" });
  }

  // ---- the user's side -----------------------------------------------------------------

  /**
   * Sets a todo's status. The agent hears about it only when the todo crosses between open and
   * closing statuses, and never for a todo the user made: moving between open statuses, or
   * between closing ones, is the user's own bookkeeping.
   */
  async setStatus(id: string, statusId: string, paseo: Paseo) {
    await this.store.ready;
    const todo = this.store.get(id);
    const { statuses } = await this.values();
    const next = statuses.find((status) => status.id === statusId);
    if (!todo || !next || todo.status !== "open") return false;
    const before = resolveStatus(statuses, todo.statusId);
    if (before.id === next.id) return true;
    todo.statusId = next.id;
    const crossed = before.closes !== next.closes && !todo.user;
    if (crossed) {
      todo.told = false;
      if (next.closes) todo.closedAt = Date.now();
    }
    await this.store.save();
    this.emit({ agentId: todo.agentId, workspaceId: todo.workspaceId, kind: "changed" });
    if (!crossed) return true;
    // A close carries every comment; a reopen only those added since the last close.
    const text = next.closes
      ? `[User Todos] The user marked "${todo.title}" ${next.label}.${commentLines(live(todo.comments))}`
      : `[User Todos] The user reopened "${todo.title}" (now ${next.label}).${commentLines(
          live(todo.comments).filter((comment) => comment.at > (todo.closedAt ?? 0)),
        )}`;
    const told = await this.tell(paseo, todo.agentId, text);
    if (told && this.store.get(id)?.statusId === next.id) {
      todo.told = true;
      await this.store.save();
      this.emit({ agentId: todo.agentId, workspaceId: todo.workspaceId, kind: "changed" });
    }
    return true;
  }

  /** Leaves a comment. It is kept for the agent until the todo closes, and tells no one now. */
  async addComment(id: string, text: string) {
    await this.store.ready;
    const todo = this.store.get(id);
    const clean = text.replace(/\r\n?/g, "\n").trim().slice(0, COMMENT_MAX);
    if (!todo || todo.status === "pending" || !clean) return { comment: null };
    const comment: StoredComment = { id: this.store.newCommentId(), text: clean, at: Date.now() };
    todo.comments.push(comment);
    await this.store.save();
    this.emit({ agentId: todo.agentId, workspaceId: todo.workspaceId, kind: "changed" });
    return { comment: { id: comment.id, text: comment.text, at: comment.at } };
  }

  /** Hides a comment from the panel and the agent. It stays in the store, flagged. */
  async removeComment(id: string, commentId: string) {
    await this.store.ready;
    const todo = this.store.get(id);
    const comment = todo?.comments.find((item) => item.id === commentId);
    if (!todo || !comment) return false;
    comment.removed = true;
    await this.store.save();
    this.emit({ agentId: todo.agentId, workspaceId: todo.workspaceId, kind: "changed" });
    return true;
  }

  // ---- labels --------------------------------------------------------------------------

  async setTags(id: string, tags: readonly string[]) {
    await this.store.ready;
    const todo = this.store.get(id);
    if (!todo || todo.status === "pending") return false;
    todo.tags = cleanTags(tags);
    await this.store.save();
    this.emit({ agentId: todo.agentId, workspaceId: todo.workspaceId, kind: "changed" });
    return true;
  }

  async reorder(agentId: string, ids: readonly string[]) {
    await this.store.ready;
    this.store.reorder(agentId, ids);
    await this.store.save();
    const workspaceId = this.store.all().find((todo) => todo.agentId === agentId)?.workspaceId ?? null;
    this.emit({ agentId, workspaceId, kind: "changed" });
    return true;
  }

  /** A todo the user made: it shows at once, with no turn, and closing it tells no one. */
  async addOwn(input: UserTodoInput) {
    await this.store.ready;
    const { statuses } = await this.values();
    const title = oneLine(input.title);
    if (!title) return { ok: false, error: "A todo needs a title." };
    const links: { url: string; label?: string }[] = [];
    for (const line of input.links.map((link) => link.trim()).filter(Boolean)) {
      let url: URL;
      try {
        url = new URL(line);
      } catch {
        return { ok: false, error: `"${line}" is not a link.` };
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { ok: false, error: `"${line}" is not an http or https link.` };
      }
      links.push({ url: url.toString() });
    }
    this.store.add({
      id: this.store.newId(),
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      chatTitle: input.chatTitle,
      title,
      why: oneLine(input.why),
      steps: input.steps.map(oneLine).filter(Boolean).map((text) => ({ text, done: false })),
      listStyle: input.listStyle ?? "bullets",
      links,
      status: "open",
      statusId: statuses.some((item) => item.id === input.statusId) ? input.statusId! : firstStatus(statuses, false).id,
      tags: cleanTags(input.tags),
      comments: [],
      user: true,
      createdAt: Date.now(),
      turn: null,
      turnId: null,
      messageId: null,
      callId: null,
      told: false,
      withdrawReason: null,
      turnsSeen: [],
      shown: true,
      skipFirstEnd: false,
    });
    await this.store.save();
    this.emit({ agentId: input.agentId, workspaceId: input.workspaceId, kind: "changed" });
    return { ok: true };
  }

  /**
   * Creates a label in Paseo. The plugin API has no create-only call, so the label is assigned to
   * `workspaceId` and unassigned straight away; once the first call has gone through, the second is
   * retried until it does, so nothing stays on the workspace. Returns the name Paseo knows it by.
   */
  async createLabel(workspaceId: string, raw: string, paseo: Paseo) {
    const name = normalizeTag(raw);
    if (!name) return { name: null, error: "A label needs a name." };
    const known = (await readPaseoLabels()).find((label) => tagKey(label.name) === tagKey(name));
    if (known) return { name: known.name };
    const ref = paseo.workspaces.ref(workspaceId);
    try {
      await ref.setLabel(name, { assigned: true });
    } catch (error) {
      console.error("Could not create a label", error);
      return { name: null, error: "Paseo did not create the label." };
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await ref.setLabel(name, { assigned: false });
        return { name };
      } catch (error) {
        console.error(`Could not take "${name}" off the workspace again`, error);
      }
    }
    return { name, error: "The label was created but is still on the workspace." };
  }

  /**
   * Clears a chat's todos, or a workspace's, whatever their state. They are flagged, not deleted.
   * Each affected chat is told once, naming the todos its agent proposed that were still open or
   * waiting, with their comments; todos the user made, and ones already closed, are left out.
   */
  async clear(filter: { workspaceId?: string; agentId?: string }, paseo: Paseo) {
    await this.store.ready;
    if (!filter.workspaceId && !filter.agentId) return 0;
    const { statuses } = await this.values();
    const hit = this.store.clear(
      (todo) =>
        (!filter.workspaceId || todo.workspaceId === filter.workspaceId) &&
        (!filter.agentId || todo.agentId === filter.agentId),
    );
    if (hit.length === 0) return 0;
    await this.store.save();
    for (const agentId of new Set(hit.map((todo) => todo.agentId))) {
      this.emit({ agentId, workspaceId: hit.find((todo) => todo.agentId === agentId)!.workspaceId, kind: "changed" });
    }
    const open = hit
      .filter(
        (todo) =>
          !todo.user &&
          (todo.status === "pending" || (todo.status === "open" && !resolveStatus(statuses, todo.statusId).closes)),
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const agentId of new Set(open.map((todo) => todo.agentId))) {
      const lines = open
        .filter((todo) => todo.agentId === agentId)
        .flatMap((todo) => [
          `- "${todo.title}"`,
          ...live(todo.comments).map((comment) => `  - ${comment.text.replace(/\n/g, "\n    ")}`),
        ]);
      await this.tell(paseo, agentId, `[User Todos] The user cleared these todos:\n${lines.join("\n")}`);
    }
    return hit.length;
  }

  // ---- helpers -------------------------------------------------------------------------

  /**
   * Finds where a todo came from in its turn: the tool call that proposed it, and the assistant
   * message nearest to that call (the one before it when there is one, else the one after).
   */
  private async findSource(paseo: Paseo, id: string) {
    const todo = this.store.get(id);
    if (!todo?.turnId) return;
    try {
      const page = await paseo.agents
        .ref(todo.agentId)
        .timeline.refetch({ direction: "tail", limit: 1, wholeTurns: true });
      const entries = page.entries.filter((entry) => entry.turnId === todo.turnId);
      const at = entries.findIndex(({ item }) => {
        if (item.type !== "tool_call" || !item.name.endsWith("propose_user_todo")) return false;
        const input = (item.detail as { input?: { title?: unknown } } | undefined)?.input;
        return typeof input?.title === "string" && oneLine(input.title) === todo.title;
      });
      if (at < 0) return;
      const call = entries[at]!.item;
      const messageOf = (index: number) => {
        const item = entries[index]!.item;
        return item.type === "assistant_message" && item.messageId ? item.messageId : null;
      };
      let message: string | null = null;
      for (let index = at - 1; index >= 0 && !message; index--) message = messageOf(index);
      for (let index = at + 1; index < entries.length && !message; index++) message = messageOf(index);
      const callId = call.type === "tool_call" ? call.callId : null;
      if (todo.callId === callId && todo.messageId === message) return;
      todo.callId = callId;
      todo.messageId = message;
      await this.store.save();
      this.emit({ agentId: todo.agentId, workspaceId: todo.workspaceId, kind: "changed" });
    } catch (error) {
      console.error("Could not read the chat for a jump target", error);
    }
  }

  /** The turn a tool call runs in: the hook's record, else whatever the agent reports. */
  private async currentTurn(agentId: string, paseo: Paseo): Promise<string | null> {
    const known = this.active.get(agentId);
    if (known) return known;
    try {
      const ref = paseo.agents.ref(agentId);
      await ref.refresh();
      return ref.activeTurn?.turnId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Sends the agent a message, unless its chat is archived. A busy agent gets it queued behind the turn in flight; where the
   * daemon refuses to queue it for this sender, it goes in as a steer, which the turn picks up.
   */
  private async tell(paseo: Paseo, agentId: string, text: string): Promise<boolean> {
    const ref = paseo.agents.ref(agentId);
    // A message wakes and un-archives its chat, so an archived chat is never sent one.
    try {
      await ref.refresh();
      if (ref.archivedAt) return false;
    } catch (error) {
      console.error(`Could not read ${agentId} before telling it`, error);
    }
    const busy = this.active.has(agentId);
    const attempts: (Parameters<typeof ref.send>[1] | undefined)[] = busy
      ? [{ activeTurnBehavior: "queue" }, { activeTurnBehavior: "steer" }]
      : [undefined];
    for (const options of attempts) {
      try {
        await ref.send(text, options);
        return true;
      } catch (error) {
        console.error(`Could not tell ${agentId}${options ? ` (${options.activeTurnBehavior})` : ""}`, error);
      }
    }
    return false;
  }
}

function toWire(todo: StoredTodo, statuses: readonly Status[], rank: number): Todo {
  const {
    withdrawReason: _reason,
    turnsSeen: _seen,
    skipFirstEnd: _skip,
    shown: _shown,
    cleared: _cleared,
    closedAt: _closedAt,
    ...rest
  } = todo;
  const status = resolveStatus(statuses, todo.statusId);
  return {
    ...rest,
    comments: live(todo.comments).map(({ id, text, at }) => ({ id, text, at })),
    callId: todo.callId ?? null,
    messageId: todo.messageId ?? null,
    listStyle: todo.listStyle ?? "bullets",
    status: todo.status === "withdrawn" ? "withdrawn" : "open",
    statusId: status.id,
    closed: status.closes,
    rank,
  };
}
