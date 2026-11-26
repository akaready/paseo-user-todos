import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readPaseoLabels, watchPaseoLabels } from "./server/paseo-labels";
import { TodoService } from "./server/service";
import { todoTools } from "./server/tools";
import {
  addTodo,
  AGENT_KEY,
  clearTodos,
  deleteLabel,
  labelCounts,
  listTodos,
  paseoLabels,
  purgeLabels,
  renameLabel,
  reorderTodos,
  setStatus,
  setTags,
  todoSettings,
  watchTodos,
} from "./shared/todos";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(todoSettings);
  const service = new TodoService(settings);
  const tools = todoTools(service);

  // The tools reach every chat the user talks to. A helper agent hidden from the user has no one to ask.
  const removeOpen = server.addHook("agent.open.before", async ({ request }, { paseo }) => {
    if (request.background || request.purpose === "history") return;
    if (request.metadata[AGENT_KEY] !== request.agentId) {
      // Not awaited: a write to the agent being opened waits for the open, which waits for this hook.
      void paseo.agents
        .ref(request.agentId)
        .setMetadata({ [AGENT_KEY]: request.agentId })
        .catch((error) => console.error("Could not label a chat", error));
    }
    return { ...request, tools: [...request.tools, ...tools] };
  });
  const removeBefore = server.addHook("agent.turn.before", async ({ agent, turnId }) => {
    if (agent.background) return;
    await service.turnStarted(agent, turnId);
  });
  const removeAfter = server.addHook("agent.turn.after", async ({ agent, turnId, outcome }, { paseo }) => {
    if (agent.background) return;
    await service.turnEnded(agent, turnId, outcome.kind === "completed", paseo);
  });

  server.handle(listTodos, (input) => service.list(input));
  server.handle(setStatus, async ({ id, statusId }, { paseo }) => ({ ok: await service.setStatus(id, statusId, paseo) }));
  server.handle(paseoLabels, async () => ({ labels: await readPaseoLabels() }));
  server.handle(labelCounts, () => service.labelCounts());
  server.handle(renameLabel, ({ from, to, color }) => service.renameLabel(from, to, color));
  server.handle(deleteLabel, ({ name, color }) => service.deleteLabel(name, color));
  server.handle(purgeLabels, async ({ names, colors }) => ({ ok: await service.purgeLabels(names, colors) }));
  server.handle(setTags, async ({ id, tags }) => ({ ok: await service.setTags(id, tags) }));
  server.handle(reorderTodos, async ({ agentId, ids }) => ({ ok: await service.reorder(agentId, ids) }));
  server.handle(addTodo, async (input) => service.addOwn(input));
  server.handle(clearTodos, async (input) => ({ cleared: await service.clear(input) }));
  server.handle(watchTodos, (_input, { push, signal }) => {
    const stop = service.subscribe((event) => void push(event).catch(() => {}));
    signal.addEventListener("abort", stop, { once: true });
  });

  const stopLabels = watchPaseoLabels(() => service.emitLabels());

  return () => {
    stopLabels();
    removeOpen();
    removeBefore();
    removeAfter();
  };
}
