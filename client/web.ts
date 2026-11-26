import { Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface Row {
  style: { boxShadow: string; backgroundColor: string; transition: string };
  getBoundingClientRect(): { height: number };
  scrollIntoView(options: { block: string; behavior: string }): void;
}
declare const document: {
  body: { style: { userSelect: string } };
  querySelectorAll(selector: string): ArrayLike<Row>;
  addEventListener(
    type: "keydown",
    listener: (event: { key: string }) => void,
  ): void;
  removeEventListener(
    type: "keydown",
    listener: (event: { key: string }) => void,
  ): void;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The chat row with this ID, if it is mounted and takes up room (a folded row has no height). */
function rowOf(id: string): Row | null {
  const rows = document.querySelectorAll(
    `[data-message-id="${id.replace(/["\\]/g, "\\$&")}"]`,
  );
  for (let at = 0; at < rows.length; at++) {
    if (rows[at]!.getBoundingClientRect().height > 0) return rows[at]!;
  }
  return null;
}

/**
 * Scrolls the chat to the first of these message IDs that is on screen, and holds a highlight on
 * it for a moment. Paseo's web chat is virtualized and a chat that was just opened is still
 * loading, so the row is waited for rather than looked up once. Off the web there is no page to
 * look at, and opening the chat is all Jump to chat does. Resolves to whether a row was found.
 */
export async function revealMessage(
  ids: readonly string[],
  tint: string,
): Promise<boolean> {
  if (Platform.OS !== "web") return false;
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    for (const id of ids) {
      const row = rowOf(id);
      if (!row) continue;
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      const { boxShadow, backgroundColor, transition } = row.style;
      row.style.transition = "background-color 0.4s ease, box-shadow 0.4s ease";
      row.style.backgroundColor = tint;
      row.style.boxShadow = `0 0 0 1px ${tint}`;
      setTimeout(() => {
        row.style.backgroundColor = backgroundColor;
        row.style.boxShadow = boxShadow;
        setTimeout(() => {
          row.style.transition = transition;
        }, 450);
      }, 1600);
      return true;
    }
    await wait(150);
  }
  return false;
}

declare const matchMedia: ((query: string) => { matches: boolean }) | undefined;

/** Whether the main pointer is a finger, which scrolls the list instead of dragging in it. */
export function fingerOnWeb(): boolean {
  if (Platform.OS !== "web" || typeof matchMedia !== "function") return false;
  return matchMedia("(pointer: coarse)").matches;
}

/** Holds text selection off while a card is dragged with the mouse. */
export function holdSelection(on: boolean) {
  if (Platform.OS !== "web") return;
  document.body.style.userSelect = on ? "none" : "";
}

/** Runs `run` when Escape is pressed anywhere on the page. Returns how to stop listening. */
export function onEscape(run: () => void): () => void {
  if (Platform.OS !== "web") return () => {};
  const listener = (event: { key: string }) => {
    if (event.key === "Escape") run();
  };
  document.addEventListener("keydown", listener);
  return () => document.removeEventListener("keydown", listener);
}
