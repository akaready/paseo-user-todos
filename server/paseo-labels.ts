import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { TAG_HUES, type RegisteredTag } from "../shared/tags";

/**
 * Paseo keeps its workspace labels in one file in its home directory. The plugin API has no call
 * to list, rename, recolor or delete them (only `workspaces.ref(id).setLabel`, which assigns a
 * label to a workspace and would create a missing one in violet), so this reads the file and
 * never writes it.
 */
export function paseoLabelsFile(): string {
  const home = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(home, "projects", "workspace-labels.json");
}

/** Paseo's labels as `{ name, color }`, in its order. A missing or unreadable file is no labels. */
export async function readPaseoLabels(): Promise<RegisteredTag[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(paseoLabelsFile(), "utf8"));
    if (!Array.isArray(parsed)) return [];
    const labels: RegisteredTag[] = [];
    for (const item of parsed as { name?: unknown; color?: unknown }[]) {
      const color = TAG_HUES.find((hue) => hue === item?.color);
      if (typeof item?.name === "string" && item.name.trim() && color) labels.push({ name: item.name, color });
    }
    return labels;
  } catch {
    return [];
  }
}

/** Calls `onChange` after the labels file is written or replaced. Returns how to stop watching. */
export function watchPaseoLabels(onChange: () => void): () => void {
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const file = paseoLabelsFile();
  try {
    // The directory is watched, not the file: Paseo may replace the file, which ends a file watch.
    watcher = watch(dirname(file), { persistent: false }, (_event, name) => {
      if (name && name !== "workspace-labels.json") return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(onChange, 150);
    });
    watcher.on("error", () => {});
  } catch {
    // No directory yet: Paseo has never saved a label, and there is nothing to watch.
  }
  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}
