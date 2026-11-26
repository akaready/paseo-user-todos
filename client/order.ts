import type { Sort, Status, Todo } from "../shared/todos";
import { resolveStatus } from "../shared/todos";

/** A list of todos in the chosen order. By status keeps the dropdown's order, newest first within one. */
export function sortTodos(todos: readonly Todo[], sort: Sort, statuses: readonly Status[]): Todo[] {
  const at = (todo: Todo) => statuses.findIndex((status) => status.id === resolveStatus(statuses, todo.statusId).id);
  const list = [...todos];
  switch (sort) {
    case "oldest":
      return list.sort((a, b) => a.createdAt - b.createdAt);
    case "manual":
      return list.sort((a, b) => a.rank - b.rank || b.createdAt - a.createdAt);
    case "status":
      return list.sort((a, b) => at(a) - at(b) || b.createdAt - a.createdAt);
    default:
      return list.sort((a, b) => b.createdAt - a.createdAt);
  }
}
