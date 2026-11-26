import type { PluginClientContext } from "@getpaseo/plugin/client";
import { TodoPanel } from "./client/panel";
import { PANEL_ID, watchTodos } from "./shared/todos";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: PANEL_ID,
    title: "Todos",
    icon: "ListTodo",
    locations: ["explorer"],
    Component: TodoPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-todos",
    title: "Open Todos",
    icon: "ListTodo",
    keywords: ["todo", "tasks", "agent"],
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel(PANEL_ID, { location: "explorer" });
    },
  });
  // The first todo a chat shows opens the panel, once: the server decides which one that is.
  const watch = client.subscribe(watchTodos, {}, (event) => {
    if (event.kind === "visible" && event.workspaceId) {
      client.openPanel(PANEL_ID, { workspaceId: event.workspaceId, location: "explorer" });
    }
  });
  return () => {
    watch();
    removeCommand();
    removePanel();
  };
}
