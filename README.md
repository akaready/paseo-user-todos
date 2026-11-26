# User Todos

A Paseo plugin that gives the tasks an agent hands you, the ones only you can do, a panel beside the chat: the reason, a bulleted list of steps, the links you need, tags, a status, and a jump back to the message that asked.

## Install

Plugins run trusted, unsandboxed code, so turn them on first under Settings, Plugins, Enable plugins. Then:

```bash
paseo plugin install github:akaready/paseo-user-todos
```

Update it later with `paseo plugin update user-todos`. Chats that were open before the install get the agent tools the next time they open.

## What it does

- **Agent tools.** `propose_user_todo` (title, why, optional steps as bullets or numbers, links, optional tags), `withdraw_user_todo` and `list_user_todos` are added to every visible chat. Their descriptions tell the agent to propose only substantial tasks that only you can do.
- **Grace turns.** A proposal stays hidden until 1, 2 or 3 turns (setting) have ended without you resolving it in chat. Turns follow Paseo's turn IDs, so an agent waking itself counts.
- **Panel.** A Todos panel in the Explorer shows the chat you are looking at (Current), or every chat in the workspace (All), grouped by chat or by status. It opens by itself when a chat shows its first todo (setting).
- **Status.** Each card has a colored status pill at its top right (icon and label): TODO, DOING, DONE, HOLD, CANCEL by default. A click opens the status list. Swiping a card right past about 90px marks it DONE. Non-default statuses tint the card faintly. The gear opens an editor to rename, recolor, pick an icon for, reorder, add and remove statuses, and to say which ones close a todo.
- **Steps.** A card with steps shows a chevron at its top right, after the status pill, to expand them; clicking the card body expands it too.
- **Telling the agent.** The agent gets a one-line message only when a todo crosses between an open and a closing status, and never for a todo you made yourself.
- **Order.** Group by chat or by status; sort newest first, oldest first or manually. Dragging a card lifts it above the list, shows an outlined placeholder where it would land, and switches to Manual, storing the order per chat. In All chats a card stays inside its chat.
- **Tags.** Chips drawn like the sidebar's workspace labels, on their own row at the bottom of the card (shown only when a todo has tags), with colors from Paseo's identity table. The "#" button, in the card's last row beside the time and the chat's name, opens a menu built like Paseo's Labels submenu: Paseo's own labels first, then the ones made here, kept with their color in the plugin's settings. "Manage labels" renames, recolors and deletes the plugin's labels; renames and deletes change every todo that carries the label and are logged in the store file (`labelEvents`). Tags an agent proposes take a color from their name until a label with that name exists.
- **Paseo's labels.** The plugin API has no call to list or edit workspace labels (`workspaces.ref(id).setLabel` only assigns one, creating a missing label in violet). Paseo's labels are read from `projects/workspace-labels.json` in its home directory, watched for changes, and never written. They show in Manage labels without edit or delete.
- **New todo.** The "+" in the header opens an inline card at the top of the list for your own todos: title, why, steps, links, tags. They show at once.
- **Clear.** The gear can clear a chat's todos or all chats' todos. Cleared todos are flagged in the store file, not deleted.

## What it reads and changes

- Stores todos in `plugin-data/user-todos/todos.json` under the Paseo home directory, on the daemon host.
- Labels each chat with its own ID in the chat's metadata (`user-todos.agent`), so the panel knows which chat has focus.
- Sends the agent a message in the chat when you close or reopen one of its todos.
- Reads a chat's timeline to find the message a todo came from.
- Nothing leaves your machine.

## Limits

- Drag is by mouse after a small movement, or by long press on touch. There is no auto-scroll while dragging.
- Jump to chat scrolls to and highlights the message on the web and in the desktop app. Elsewhere it opens the chat.
- A card whose status was removed from the list shows as the first open status.

Requires Paseo 0.17.4 or newer.
