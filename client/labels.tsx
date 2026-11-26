import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { hueInk, MAX_TAG_LENGTH, normalizeTag, TAG_HUES, tagHue, tagKey, type RegisteredTag, type TagHue } from "../shared/tags";
import { ActionButton, Hover, isDark, Swatch, tint } from "./parts";

/** One label in Manage labels: from the registry, or a tag in use that has no registered color. */
interface Entry {
  name: string;
  registered: boolean;
  /** One of Paseo's own labels: shown, but changed only in Paseo. */
  readOnly: boolean;
  count: number;
}

type Mode = { name: string; kind: "rename" | "color" | "delete" } | "purge" | null;

/**
 * Manage labels, in a Modal (a menu surface is a popup that closes when the pointer leaves it,
 * which is no place to type a new name). Rows use Paseo's menu-row metrics: a 28px row, 8px of
 * padding, a 10px dot, 14/18 text. Rename, recolor and delete happen inline under or in the row.
 */
export function ManageLabels({
  theme,
  open,
  registry,
  paseo,
  counts,
  onClose,
  onRename,
  onRecolor,
  onDelete,
  onPurge,
}: {
  theme: PluginTheme;
  open: boolean;
  /** The labels this plugin made. */
  registry: readonly RegisteredTag[];
  /** Paseo's own labels. */
  paseo: readonly RegisteredTag[];
  /** How many todos carry each label, by the spelling in use. */
  counts: readonly { name: string; count: number }[];
  onClose(): void;
  /** Resolves to a message when the rename was refused. */
  onRename(name: string, to: string): Promise<string | null>;
  onRecolor(name: string, color: TagHue): void;
  onDelete(name: string): void;
  onPurge(names: string[]): void;
}) {
  const { colors } = theme;
  const dark = isDark(theme);
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const all = useMemo(() => [...paseo, ...registry], [paseo, registry]);
  const entries = useMemo<Entry[]>(() => {
    const countOf = (name: string) => counts.find((item) => tagKey(item.name) === tagKey(name))?.count ?? 0;
    const theirs = paseo.map((tag) => ({ name: tag.name, registered: true, readOnly: true, count: countOf(tag.name) }));
    const own = registry
      .filter((tag) => !paseo.some((other) => tagKey(other.name) === tagKey(tag.name)))
      .map((tag) => ({ name: tag.name, registered: true, readOnly: false, count: countOf(tag.name) }));
    const extra = counts
      .filter((item) => !all.some((tag) => tagKey(tag.name) === tagKey(item.name)))
      .map((item) => ({ name: item.name, registered: false, readOnly: false, count: item.count }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...theirs, ...own, ...extra];
  }, [paseo, registry, counts, all]);
  const unused = entries.filter((entry) => entry.registered && !entry.readOnly && entry.count === 0);

  const reset = () => {
    setMode(null);
    setError(null);
    setText("");
  };
  const commitRename = async (entry: Entry) => {
    const name = normalizeTag(text);
    if (!name || name === entry.name) return reset();
    if (entries.some((other) => other !== entry && tagKey(other.name) === tagKey(name))) {
      setError(`A label called "${name}" already exists.`);
      return;
    }
    const message = await onRename(entry.name, name);
    if (message) setError(message);
    else reset();
  };

  const muted = { color: colors.foregroundMuted };
  const confirm = (message: string, action: string, run: () => void) => (
    <View
      style={{
        marginHorizontal: 4,
        marginBottom: 4,
        gap: 10,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: tint(colors.statusDanger, 0.45, colors.border),
        backgroundColor: tint(colors.statusDanger, 0.08, colors.surface1),
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: 12.5, lineHeight: 18 }}>{message}</Text>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
        <ActionButton theme={theme} label="Cancel" onPress={reset} />
        <ActionButton
          theme={theme}
          kind="danger"
          label={action}
          onPress={() => {
            run();
            reset();
          }}
        />
      </View>
    </View>
  );

  return (
    <Modal
      title="Manage labels"
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <Modal.Content>
        {entries.length === 0 ? null : (
          <View>
            {entries.map((entry) => {
              const hue = tagHue(entry.name, all);
              const editing = mode && mode !== "purge" && mode.name === entry.name ? mode.kind : null;
              return (
                <View key={entry.name}>
                  <Hover>
                    {(hovered) => (
                      <View
                        style={{
                          minHeight: 28,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                          backgroundColor: hovered ? colors.surface2 : "transparent",
                        }}
                      >
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Color of ${entry.name}`}
                          disabled={entry.readOnly}
                          onPress={() => setMode(editing === "color" ? null : { name: entry.name, kind: "color" })}
                          style={{ width: 16, alignItems: "center", justifyContent: "center" }}
                        >
                          <View style={{ width: 10, height: 10, borderRadius: 9999, backgroundColor: hueInk(hue, dark) }} />
                        </Pressable>
                        {editing === "rename" ? (
                          <TextInput
                            autoFocus
                            selectTextOnFocus
                            value={text}
                            maxLength={MAX_TAG_LENGTH}
                            onChangeText={(next) => {
                              setText(next);
                              setError(null);
                            }}
                            onSubmitEditing={() => void commitRename(entry)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setFocused(false)}
                            onKeyPress={(event) => {
                              event.stopPropagation();
                              if (event.nativeEvent.key === "Escape") reset();
                            }}
                            accessibilityLabel={`New name for ${entry.name}`}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              padding: 0,
                              margin: 0,
                              color: colors.foreground,
                              fontSize: 14,
                              lineHeight: 18,
                              borderWidth: 0,
                              backgroundColor: "transparent",
                              outlineStyle: "solid",
                              outlineWidth: focused ? 2 : 0,
                              outlineColor: colors.accent,
                            }}
                          />
                        ) : (
                          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: colors.foreground, fontSize: 14, lineHeight: 18 }}>
                            {entry.name}
                          </Text>
                        )}
                        <Text style={{ ...muted, fontSize: 12 }}>
                          {entry.count} {entry.count === 1 ? "todo" : "todos"}
                        </Text>
                        {entry.readOnly ? null : (
                          <>
                        <IconAction
                          theme={theme}
                          icon={editing === "rename" ? "Check" : "Pencil"}
                          label={editing === "rename" ? "Save name" : `Rename ${entry.name}`}
                          onPress={() => {
                            if (editing === "rename") void commitRename(entry);
                            else {
                              setError(null);
                              setText(entry.name);
                              setMode({ name: entry.name, kind: "rename" });
                            }
                          }}
                        />
                        <IconAction
                          theme={theme}
                          icon="Trash2"
                          label={`Delete ${entry.name}`}
                          onPress={() => setMode({ name: entry.name, kind: "delete" })}
                        />
                          </>
                        )}
                      </View>
                    )}
                  </Hover>
                  {editing === "rename" && error ? (
                    <Text style={{ color: colors.statusDanger, fontSize: 12, paddingHorizontal: 32, paddingBottom: 4 }}>{error}</Text>
                  ) : null}
                  {editing === "color" ? (
                    <View
                      accessibilityRole="radiogroup"
                      style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12, paddingLeft: 32, paddingRight: 8, paddingVertical: 8 }}
                    >
                      {TAG_HUES.map((choice) => (
                        <Swatch
                          key={choice}
                          theme={theme}
                          color={hueInk(choice, dark)}
                          selected={choice === hue}
                          label={choice}
                          onPress={() => {
                            onRecolor(entry.name, choice);
                            reset();
                          }}
                        />
                      ))}
                    </View>
                  ) : null}
                  {editing === "delete"
                    ? confirm(
                        `Delete '${entry.name}'? It comes off ${entry.count} ${entry.count === 1 ? "todo" : "todos"}.`,
                        "Delete",
                        () => onDelete(entry.name),
                      )
                    : null}
                </View>
              );
            })}
          </View>
        )}
        <View style={{ height: 1, backgroundColor: colors.border }} />
        {mode === "purge" ? (
          confirm(
            `Remove ${unused.length} unused ${unused.length === 1 ? "label" : "labels"}?`,
            "Remove",
            () => onPurge(unused.map((entry) => entry.name)),
          )
        ) : (
          <Hover>
            {(hovered) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove unused labels"
                disabled={unused.length === 0}
                onPress={() => setMode("purge")}
                style={{
                  minHeight: 28,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  opacity: unused.length === 0 ? 0.5 : 1,
                  backgroundColor: hovered && unused.length > 0 ? colors.surface2 : "transparent",
                }}
              >
                <View style={{ width: 16, alignItems: "center" }}>
                  <Icon name="Trash2" size={14} color={colors.foregroundMuted} />
                </View>
                <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 18 }}>Remove unused labels</Text>
                <Text style={{ ...muted, fontSize: 12 }}>{unused.length}</Text>
              </Pressable>
            )}
          </Hover>
        )}
      </Modal.Content>
    </Modal>
  );
}

function IconAction({ theme, icon, label, onPress }: { theme: PluginTheme; icon: string; label: string; onPress(): void }) {
  const { colors } = theme;
  return (
    <Hover>
      {(hovered) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={{
            width: 24,
            height: 24,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: hovered ? tint(colors.foreground, 0.07, colors.surface2) : "transparent",
          }}
        >
          <Icon name={icon} size={14} color={hovered ? colors.foreground : colors.foregroundMuted} />
        </Pressable>
      )}
    </Hover>
  );
}
