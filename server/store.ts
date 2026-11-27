import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Todo } from "../shared/todos";

export interface StoredComment {
  id: string;
  text: string;
  at: number;
  removed?: boolean;
}

/**
 * A todo as stored. `pending` ones are held back until enough turns have passed. Whether it is
 * done is its `statusId`'s business, not its lifecycle's.
 */
export interface StoredTodo extends Omit<Todo, "status" | "closed" | "rank" | "listStyle" | "comments"> {
  /** Every comment, removed ones included: removing only sets the flag. */
  comments: StoredComment[];
  /** When the todo last moved into a closing status, so a reopen can pass on what was said since. */
  closedAt?: number;
  /** Absent on todos saved before it existed, which read as bullets. */
  listStyle?: Todo["listStyle"];
  status: "pending" | "open" | "withdrawn";
  withdrawReason: string | null;
  /** Turns that ended after the proposing one and count toward showing it. */
  turnsSeen: string[];
  /** The user cleared it. It stays in the file, and nothing else reads it. */
  cleared?: boolean;
  /** It has been on the panel, so a withdrawal shows in Done instead of vanishing. */
  shown?: boolean;
  /** The proposing turn's ID was unknown, so the first turn end is its own. */
  skipFirstEnd: boolean;
}

interface StoreFile {
  version: 1;
  todos: StoredTodo[];
  /** Turns started in each chat since this plugin began watching it. */
  turns: Record<string, number>;
  /** Chats whose panel auto-open already ran, so it never fires twice. */
  opened: Record<string, true>;
  /** Each chat's manual order of todo IDs, first on top. */
  order: Record<string, string[]>;
  /** What was done to labels, with the todos it touched, so nothing about a rename or delete is untraceable. */
  labelEvents: LabelEvent[];
}

/** One change made through Manage labels. The registry itself lives in settings; this is the trail. */
export interface LabelEvent {
  /** Milliseconds since the epoch. */
  at: number;
  kind: "rename" | "delete" | "purge";
  /** The label's name before the change, or every name a purge removed. */
  labels: string[];
  /** The new name, for a rename. */
  to?: string;
  /** The color each label had in the registry, in the order of `labels`, so a removal can be undone by hand. */
  colors?: (string | null)[];
  /** Every todo that carried the label and was changed, cleared ones included. */
  todoIds: string[];
}

const empty = (): StoreFile => ({ version: 1, todos: [], turns: {}, opened: {}, order: {}, labelEvents: [] });

/**
 * Todos saved before statuses existed carry `status: "done"` and no tags: done becomes DONE, and
 * everything else DO. Runs on every load, and does nothing to a todo that is already current.
 */
function migrate(todo: StoredTodo): StoredTodo {
  const old = todo as Omit<StoredTodo, "status"> & { status: string; statusId?: string };
  const done = old.status === "done";
  return {
    ...todo,
    status: done ? "open" : (old.status as StoredTodo["status"]),
    statusId: old.statusId ?? (done ? "done" : "do"),
    tags: old.tags ?? [],
    user: old.user ?? false,
    comments: old.comments ?? [],
  };
}

/** Paseo gives plugins no storage API, so this follows what the other plugins do. */
export function dataDir(): string {
  const home = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(home, "plugin-data", "user-todos");
}

export class TodoStore {
  private data: StoreFile = empty();
  private writing: Promise<void> = Promise.resolve();
  private readonly file = join(dataDir(), "todos.json");
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.load();
  }

  private async load() {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoreFile>;
      this.data = { ...empty(), ...parsed, version: 1 };
      this.data.todos = this.data.todos.map(migrate);
    } catch {
      // Keep the unreadable file where it is for the user to look at, and start clean.
      await mkdir(dataDir(), { recursive: true });
      await rename(this.file, join(dataDir(), `todos.unreadable-${Date.now()}.json`));
    }
  }

  /** Every todo the plugin still works with: cleared ones are kept on disk but not listed here. */
  all(): readonly StoredTodo[] {
    return this.data.todos.filter((todo) => !todo.cleared);
  }

  /** Flags the matching todos as cleared and returns them. Nothing is deleted from the file. */
  clear(match: (todo: StoredTodo) => boolean): StoredTodo[] {
    const hit = this.all().filter(match);
    for (const todo of hit) todo.cleared = true;
    return hit;
  }

  /** Every todo in the file, cleared ones too: a label change reaches all of them. */
  every(): readonly StoredTodo[] {
    return this.data.todos;
  }

  logLabelEvent(event: LabelEvent) {
    this.data.labelEvents.push(event);
  }

  get(id: string): StoredTodo | undefined {
    return this.all().find((todo) => todo.id === id);
  }

  add(todo: StoredTodo) {
    this.data.todos.push(todo);
    // A new todo starts on top of its chat's manual order.
    this.data.order[todo.agentId] = [todo.id, ...(this.data.order[todo.agentId] ?? [])];
  }

  /**
   * A chat's manual order, with every todo it has in it: ones that were never placed (saved
   * before ordering existed) go in newest first on top, and ones that are gone fall out.
   */
  orderOf(agentId: string): string[] {
    const mine = this.data.todos.filter((todo) => todo.agentId === agentId);
    const known = new Set(mine.map((todo) => todo.id));
    const placed = (this.data.order[agentId] ?? []).filter((id) => known.has(id));
    const have = new Set(placed);
    const fresh = mine
      .filter((todo) => !have.has(todo.id))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((todo) => todo.id);
    this.data.order[agentId] = [...fresh, ...placed];
    return this.data.order[agentId]!;
  }

  /**
   * Puts `ids` in the order given, in the slots those todos already held, so todos that are not
   * in the list (closed ones, ones still arriving) keep their places.
   */
  reorder(agentId: string, ids: readonly string[]) {
    const order = this.orderOf(agentId);
    const wanted = ids.filter((id, at) => order.includes(id) && ids.indexOf(id) === at);
    const slots = new Set(wanted);
    const next = [...wanted];
    this.data.order[agentId] = order.map((id) => (slots.has(id) ? next.shift()! : id));
  }

  newId(): string {
    let id: string;
    do id = `todo_${randomBytes(4).toString("hex")}`;
    while (this.data.todos.some((todo) => todo.id === id));
    return id;
  }

  newCommentId(): string {
    return `c_${randomBytes(4).toString("hex")}`;
  }

  /** Counts a turn started in a chat and returns its number. */
  startTurn(agentId: string): number {
    const next = (this.data.turns[agentId] ?? 0) + 1;
    this.data.turns[agentId] = next;
    return next;
  }

  turnCount(agentId: string): number {
    return this.data.turns[agentId] ?? 0;
  }

  /** True the first time it is asked for a chat. */
  claimAutoOpen(agentId: string): boolean {
    if (this.data.opened[agentId]) return false;
    this.data.opened[agentId] = true;
    return true;
  }

  /** Writes to disk after the caller's changes, one write at a time, never leaving half a file. */
  save(): Promise<void> {
    const body = `${JSON.stringify(this.data, null, 2)}\n`;
    this.writing = this.writing
      .then(async () => {
        await mkdir(dataDir(), { recursive: true });
        const temporary = `${this.file}.${process.pid}.tmp`;
        await writeFile(temporary, body, "utf8");
        await rename(temporary, this.file);
      })
      .catch((error) => {
        console.error("Could not save todos", error);
      });
    return this.writing;
  }
}
