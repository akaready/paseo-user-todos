import { defineAgentTool } from "@getpaseo/plugin/server";
import { z } from "zod";
import type { TodoService } from "./service";

const web = (value: string) => /^https?:\/\//i.test(value);

const PROPOSE = `Hand the user a task that only the user can do, so it waits for them in the To-do panel beside this chat instead of scrolling away.

Use it only for substantial tasks the user alone can carry out: creating an account, entering credentials or a payment, using a physical device, approving something in the real world, or making a decision only they can make. Never use it for chores you could do yourself or with the tools you have, for trivia, or for something the user is about to answer in this chat.

Write the title short and imperative ("Approve the DNS change at your registrar"). "why" is one or two sentences on why you cannot do it. Add "steps" only when there is more than one thing to do: a short list (2 to 6 items, each one action). Set "listStyle" to "numbers" when the order matters and leave it as bullets otherwise. Give no steps at all when one sentence of "why" is enough. Include the exact links they need (the page to open, not a home page). Do not add a step that tells you when they are done: you are told automatically when the user closes the todo. Do not propose the same task twice. Add up to three short "tags" (one or two words each, such as "billing" or "dns") only when they help the user sort their list; most todos need none.

The todo is held back and appears only after the user has had a turn or two to answer you in chat. If the user resolves it in chat first, call withdraw_user_todo. Returns the todo's id.`;

const WITHDRAW = `Take back a todo you proposed with propose_user_todo because the user dealt with it in chat or it no longer matters. A todo that has not appeared yet never will. Pass the id propose_user_todo returned and a short reason.`;

const LIST = `List the todos in this chat with their ids and states (pending, or the user's status such as TODO, DOING, DONE, HOLD, CANCEL). Use it to check whether a task is already on the user's list before proposing it.`;

export function todoTools(service: TodoService) {
  return [
    defineAgentTool({
      name: "propose_user_todo",
      title: "Propose a user todo",
      description: PROPOSE,
      input: z.object({
        title: z.string().trim().min(3).max(120).describe("Short and imperative, under 80 characters."),
        why: z.string().trim().min(3).max(400).describe("Why only the user can do it, in one or two sentences."),
        steps: z
          .array(z.string().trim().min(1).max(240))
          .max(8)
          .default([])
          .describe("What to do, 2 to 6 items, each one action; empty when the why is enough. Never a step that tells the agent."),
        listStyle: z
          .enum(["bullets", "numbers"])
          .optional()
          .describe("numbers when the order matters, bullets otherwise."),
        links: z
          .array(
            z.object({
              url: z.string().url().refine(web, "Only http and https links").describe("The exact page to open."),
              label: z.string().trim().max(60).optional(),
            }),
          )
          .max(8)
          .default([])
          .describe("The pages the user needs."),
        tags: z
          .array(z.string().trim().min(1).max(24))
          .max(4)
          .default([])
          .describe("Optional short labels, one or two words each. Leave empty unless they help sort the list."),
      }),
      async execute(input, { agent, paseo }) {
        const { id, duplicate } = await service.propose(agent, paseo, input);
        return {
          text: duplicate
            ? `This task is already on the user's list as ${id}.`
            : `Proposed user todo ${id}. It will appear for the user after they have had a turn or two to answer in chat. Call withdraw_user_todo with this id if they resolve it first.`,
          structuredContent: { id },
        };
      },
    }),
    defineAgentTool({
      name: "withdraw_user_todo",
      title: "Withdraw a user todo",
      description: WITHDRAW,
      input: z.object({
        id: z.string().min(1).describe("The id propose_user_todo returned."),
        reason: z.string().trim().min(1).max(200).describe("Why it no longer needs doing."),
      }),
      async execute({ id, reason }, { agent }) {
        const result = await service.withdraw(agent.id, id, reason);
        if (result === "unknown") return { text: `No todo ${id} from this chat.`, isError: true };
        if (result === "done") return { text: `The user already closed ${id}.` };
        return { text: `Withdrew ${id}.` };
      },
    }),
    defineAgentTool({
      name: "list_user_todos",
      title: "List user todos",
      description: LIST,
      input: z.object({}),
      async execute(_input, { agent }) {
        const todos = await service.listForAgent(agent.id);
        const lines = todos.map(({ todo, state }) => `${todo.id} [${state}] ${todo.title}`);
        return { text: lines.length ? lines.join("\n") : "No todos from this chat." };
      },
    }),
  ];
}
