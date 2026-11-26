import { useComposers, useRpc, useSubscription } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_KEY, listTodos, watchTodos, type Todo } from "../shared/todos";

export interface TodoData {
  todos: Todo[];
  pending: { agentId: string; left: number }[];
}

/**
 * The workspace's todos, kept current: read once, then read again whenever the daemon says
 * something changed. `patch` shows a change at once while its RPC is on the way; the daemon's
 * own update replaces it.
 */
export function useTodoData(workspaceId: string) {
  const list = useRpc(listTodos);
  const listRef = useRef(list);
  listRef.current = list;
  const [data, setData] = useState<TodoData | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const mine = ++latest.current;
    try {
      const next = await listRef.current({ workspaceId });
      if (mine === latest.current) {
        setData(next);
        setFailed(false);
      }
    } catch {
      if (mine === latest.current) setFailed(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state = useSubscription(watchTodos, {}, (event) => {
    if (event.workspaceId === workspaceId) void refresh();
  });
  const live = state.status === "live";
  useEffect(() => {
    // A subscription that has just come back may have missed events while it was gone.
    if (live) void refresh();
  }, [live, refresh]);

  const patch = useCallback((id: string, change: (todo: Todo) => Todo) => {
    setData((current) =>
      current ? { ...current, todos: current.todos.map((todo) => (todo.id === id ? change(todo) : todo)) } : current,
    );
  }, []);

  /** Shows a new manual order at once: `ids` take the slots they held among the chat's todos. */
  const reorder = useCallback((agentId: string, ids: readonly string[]) => {
    setData((current) => {
      if (!current) return current;
      const mine = current.todos.filter((todo) => todo.agentId === agentId).sort((a, b) => a.rank - b.rank);
      const taken = new Set(ids);
      const next = [...ids];
      const order = mine.map((todo) => (taken.has(todo.id) ? next.shift()! : todo.id));
      const rank = new Map(order.map((id, at) => [id, at]));
      return {
        ...current,
        todos: current.todos.map((todo) =>
          todo.agentId === agentId ? { ...todo, rank: rank.get(todo.id) ?? todo.rank } : todo,
        ),
      };
    });
  }, []);

  return { data, failed, patch, reorder, refresh };
}

/**
 * The chat the user is looking at. A panel in the Explorer is not given one, so it reads the
 * focused chat's composer, which carries the ID the server stamped on that chat. Focus on a file
 * or a terminal leaves the last chat in place rather than blanking the panel.
 */
export function useCurrentChat(): string | null {
  const [focused] = useComposers({ focused: true });
  const stamped = focused?.agent.metadata[AGENT_KEY];
  const [chat, setChat] = useState<string | null>(typeof stamped === "string" ? stamped : null);
  useEffect(() => {
    if (typeof stamped === "string") setChat(stamped);
  }, [stamped]);
  return typeof stamped === "string" ? stamped : chat;
}
