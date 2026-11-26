/**
 * Tags look like the workspace labels in Paseo's sidebar, and take their colors from the same
 * table: `packages/app/src/styles/identity-colors.ts` in getpaseo/paseo, which holds all ten hues
 * to one contrast band. A workspace label's color is picked by the user and stored on the host,
 * where a plugin can't read it, so a tag takes the hue Paseo's own `deriveIdentityColorName`
 * gives a name: the same tag is the same color everywhere.
 */
/** The ten label colors, in Paseo's order (`WORKSPACE_LABEL_COLORS`). */
export const TAG_HUES = ["violet", "sky", "emerald", "orange", "pink", "indigo", "teal", "red", "amber", "blue"] as const;
export type TagHue = (typeof TAG_HUES)[number];
const NAMES = TAG_HUES;
type Name = TagHue;

/** A tag with the color the user gave it, in the registry the labels menu keeps. */
export interface RegisteredTag {
  name: string;
  color: TagHue;
}

const FILL: Record<Name, string> = {
  violet: "#7a6aa8",
  sky: "#3d7ea6",
  emerald: "#388068",
  orange: "#a4673a",
  pink: "#b05c80",
  indigo: "#6a70b8",
  teal: "#368080",
  red: "#b06260",
  amber: "#8f7838",
  blue: "#5179b0",
};

const FOREGROUND_LIGHT: Record<Name, string> = {
  violet: "#6d49b5",
  sky: "#3d6985",
  emerald: "#3e6e5d",
  orange: "#845838",
  pink: "#974168",
  indigo: "#5251c2",
  teal: "#3e6d6c",
  red: "#9c4243",
  amber: "#716239",
  blue: "#39649e",
};

const FOREGROUND_DARK: Record<Name, string> = {
  violet: "#a392d5",
  sky: "#6aa6ce",
  emerald: "#6cae96",
  orange: "#cc8f64",
  pink: "#d87da3",
  indigo: "#9299d5",
  teal: "#6cacab",
  red: "#d88381",
  amber: "#b29d64",
  blue: "#7ba1d5",
};

/** Paseo's `normalizeWorkspaceLabelName`. */
export const normalizeTag = (name: string) => name.replace(/\s+/g, " ").trim();

/** Paseo's `workspaceLabelKey`: tags that differ only in case are one tag. */
export const tagKey = (name: string) => normalizeTag(name).toLowerCase();

export const MAX_TAGS = 6;
export const MAX_TAG_LENGTH = 24;

/** Tidies a list of tags: whitespace collapsed, empty and repeated ones dropped, a sensible limit. */
export function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of tags) {
    const name = normalizeTag(raw).slice(0, MAX_TAG_LENGTH).trim();
    if (!name || seen.has(tagKey(name))) continue;
    seen.add(tagKey(name));
    kept.push(name);
  }
  return kept.slice(0, MAX_TAGS);
}

/** Paseo's `deriveIdentityColorName`: a stable hue per name. */
function hueOf(name: string): Name {
  let hash = 0;
  for (const character of tagKey(name)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return NAMES[hash % NAMES.length]!;
}

/** The hue a tag shows in: the one registered for its name, else the hashed one for agent-made tags. */
export function tagHue(name: string, registry: readonly RegisteredTag[] = []): TagHue {
  const key = tagKey(name);
  return registry.find((tag) => tagKey(tag.name) === key)?.color ?? hueOf(name);
}

/** A hue as ink, for a dot or a swatch: Paseo's `identityForeground`, one set per scheme. */
export function hueInk(hue: TagHue, dark: boolean): string {
  return dark ? FOREGROUND_DARK[hue] : FOREGROUND_LIGHT[hue];
}

/** A chip's ground (the hue at 10%, theme-independent) and its name's color for the scheme. */
export function tagColors(
  name: string,
  dark: boolean,
  registry: readonly RegisteredTag[] = [],
): { ground: string; ink: string } {
  const hue = tagHue(name, registry);
  return { ground: `${FILL[hue]}1a`, ink: hueInk(hue, dark) };
}
