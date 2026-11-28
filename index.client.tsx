import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { AllTodosScreen, TodoPanel } from "./client/panel";
import { PANEL_ID, SCREEN_ID, watchTodos } from "./shared/todos";

function AllTodosItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="ListTodo"
      active={currentScreen?.screenId === SCREEN_ID}
      onPress={() => openScreen({ screenId: SCREEN_ID })}
    />
  );
}

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
  const removeScreen = client.addScreen({ id: SCREEN_ID, title: "Todos", Component: AllTodosScreen });
  const removeItem = client.addSidebarHeaderItem({ id: SCREEN_ID, title: "Todos", Component: AllTodosItem });
  const removeAll = client.addCommandCenterItem({
    id: "open-all-todos",
    title: "Open todos in every repo",
    icon: "ListTodo",
    keywords: ["todo", "tasks", "agent", "repos"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: SCREEN_ID });
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
    removeAll();
    removeItem();
    removeScreen();
    removeCommand();
    removePanel();
  };
}
