# User Todos

A Paseo plugin that gives the tasks an agent hands you, the ones only you can do, a panel beside the chat: the reason, a bulleted list of steps, the links you need, labels, a status, and a jump back to the message that asked.

## Install

Plugins run trusted, unsandboxed code, so turn them on first under Settings, Plugins, Enable plugins. Then:

```bash
paseo plugin install github:akaready/paseo-user-todos
```

Update it later with `paseo plugin update user-todos`. Chats that were open before the install get the agent tools the next time they open.

## What it does

- **Agent tools.** `propose_user_todo` (title, why, optional steps as bullets or numbers, links), `withdraw_user_todo` and `list_user_todos` are added to every agent you can see, on every provider, each time it opens; helper agents hidden from you get nothing.
- **Standing instruction.** Each of those agents also gets a short instruction appended to its system prompt (`appendSystemPrompt`, not saved on the agent): call `propose_user_todo` instead of asking in prose when only you can do something, check `list_user_todos` first, withdraw when you resolve it in chat, and search the tool list for `user_todo` if the tool is deferred (as in Claude Code). A Codex chat picks up changed instructions with its next prompt; a Claude Code session keeps the instruction it started with, so only Claude chats created after the plugin is installed get it (older ones still get the tools). Providers reached through ACP do not receive system instructions, and a plugin provider must apply them itself.
- **Grace turns.** A proposal stays hidden until 1, 2 or 3 turns (setting) have ended without you resolving it in chat. Turns follow Paseo's turn IDs, so an agent waking itself counts.
- **Panel.** A Todos panel in the Explorer shows the chat you are looking at (Current), or every chat in the workspace (All), grouped by chat or by status. It opens by itself when a chat shows its first todo (setting).
- **Status.** Each card has a colored status pill at its top right (icon and label): TODO, DOING, DONE, HOLD, CANCEL by default. A click opens the status list. Swiping a card right past about 90px marks it DONE; swiping left past the same distance archives it (it leaves the list, flagged in the store, and the agent that proposed it is told, with your comments). Non-default statuses tint the card faintly. The gear opens an editor to rename, recolor, pick an icon for, reorder, add and remove statuses, and to say which ones close a todo.
- **Steps.** A card with steps shows a chevron at its top right, after the status pill, to expand them; clicking the card body expands it too.
- **Comments.** The speech-bubble button in a card's last row, left of "#", shows the comment count and expands the card with the comment field focused. Comments (up to 2000 characters each) list under the steps with their time; Enter adds one, Shift+Enter breaks the line, Escape leaves the field, and the cross on a comment removes it. A removed comment is flagged in the store file, never deleted.
- **Telling the agent.** The agent gets a message only when a todo crosses between an open and a closing status, and never for a todo you made yourself. Closing sends `[User Todos] The user marked "<title>" DONE.` (or the status's own label) followed by `Comments:` and one `- <text>` line per comment, oldest first; reopening sends its usual line plus any comments added since the close. `list_user_todos` also returns each todo's comments.
- **Order.** Group by chat or by status; sort newest first, oldest first or manually. Dragging a card lifts it above the list, shows an outlined placeholder where it would land, and switches to Manual, storing the order per chat. In All chats a card stays inside its chat.
- **Labels.** Chips drawn like the sidebar's workspace labels, on their own row at the bottom of the card (only when a todo has some). The "#" button, in the card's last row beside the time and the chat's name, opens a menu of Paseo's workspace labels followed by the ones made here, one entry per name, with a check on the ones the todo has; a tap toggles one. "Create label" makes the label in Paseo and puts it on the todo. Paseo creates it violet and the plugin API cannot recolor it, so the color you pick is kept in the plugin's settings and shown in the panel while Paseo's own color is still violet; recolor or delete a label in Paseo and its color wins. Applying a label never touches a workspace or the sidebar. Agents cannot set labels, and a tag an older todo carries that is not on offer stays in the store, unseen.
- **Paseo's labels.** The plugin API has no call to list or recolor workspace labels, and its only way to create one is `workspaces.ref(id).setLabel`, which assigns it to a workspace. Paseo's labels are read from `projects/workspace-labels.json` in its home directory, watched for changes, and never written. "Create label" assigns the new label to the workspace you are in and takes it off again at once (retrying the second call until it goes through), so the label stays in Paseo's list and on nothing.
- **New todo.** The "+" in the header opens an inline card at the top of the list for your own todos: title, why, steps, links, labels. They show at once.
- **Archived chats.** A chat that is archived in Paseo is never sent a message, since a message would wake it: closing, reopening, clearing or archiving a todo there only changes the todo.
- **Clear.** The gear can clear a chat's todos or all chats' todos. Cleared todos are flagged in the store file, not deleted. Each affected chat gets one message listing the todos its agent proposed that were still open or waiting, with your comments on them (`[User Todos] The user cleared these todos:`, then `- "<title>"` and indented `- <comment>` lines); todos you made and ones already closed are left out.

## What it reads and changes

- Stores todos in `plugin-data/user-todos/todos.json` under the Paseo home directory, on the daemon host.
- Labels each chat with its own ID in the chat's metadata (`user-todos.agent`), so the panel knows which chat has focus.
- Sends the agent a message in the chat when you close or reopen one of its todos, with your comments on it.
- Approves permission requests for its own three tools (`propose_user_todo`, `withdraw_user_todo`, `list_user_todos`), once per request, matched by exact tool and server name on Claude and Codex; every other request is left to you.
- Reads a chat's timeline to find the message a todo came from.
- Nothing leaves your machine.

## Limits

- Drag is by mouse after a small movement, or by long press on touch. There is no auto-scroll while dragging.
- Jump to chat scrolls to and highlights the message on the web and in the desktop app. Elsewhere it opens the chat.
- A card whose status was removed from the list shows as the first open status.

Requires Paseo 0.17.4 or newer.
