import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { STATUS_COLORS, STATUS_ICONS, statusIcon, type Status } from "../shared/todos";
import { ActionButton, BUTTON_WEB, Hover, statusInk, Swatch, Toggle, tint } from "./parts";

const newId = () => `s_${Math.random().toString(36).slice(2, 8)}`;

/**
 * The status list: rename, recolor, reorder, add and remove. A status either closes a todo or
 * leaves it open, and the list must keep one of each so a tick and an untick always have a place.
 */
export function StatusEditor({
  theme,
  open,
  statuses,
  saving,
  onSave,
  onClose,
}: {
  theme: PluginTheme;
  open: boolean;
  statuses: readonly Status[];
  saving: boolean;
  onSave(next: Status[]): void;
  onClose(): void;
}) {
  const { colors } = theme;
  const [draft, setDraft] = useState<Status[]>([...statuses]);
  useEffect(() => {
    if (open) setDraft([...statuses]);
    // Start from the saved list each time it opens, not each time it is saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const change = (id: string, patch: Partial<Status>) =>
    setDraft((current) => current.map((status) => (status.id === id ? { ...status, ...patch } : status)));
  const move = (at: number, by: -1 | 1) =>
    setDraft((current) => {
      const next = [...current];
      const [item] = next.splice(at, 1);
      next.splice(at + by, 0, item!);
      return next;
    });
  const named = draft.every((status) => status.label.trim().length > 0);
  const valid = named && draft.some((status) => status.closes) && draft.some((status) => !status.closes);
  const field = { color: colors.foreground, fontSize: 13, padding: 0, margin: 0, borderWidth: 0, outlineWidth: 0, backgroundColor: "transparent" as const };

  return (
    <Modal title="Statuses" open={open} onOpenChange={(next) => !next && onClose()}>
      <Modal.Content>
        <View style={{ gap: 8 }}>
          {draft.map((status, at) => (
            <View
              key={status.id}
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
                padding: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface1,
              }}
            >
              <View style={{ flexGrow: 1, flexBasis: 110, minWidth: 90, height: 26, justifyContent: "center", paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.surface0 }}>
                <TextInput
                  value={status.label}
                  maxLength={16}
                  onChangeText={(label) => change(status.id, { label })}
                  accessibilityLabel="Status name"
                  placeholder="Name"
                  placeholderTextColor={colors.foregroundMuted}
                  style={field}
                />
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {STATUS_COLORS.map((color) => (
                  <Swatch
                    key={color}
                    theme={theme}
                    color={statusInk(theme, color)}
                    selected={status.color === color}
                    label={color}
                    size={18}
                    onPress={() => change(status.id, { color })}
                  />
                ))}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }} accessibilityRole="radiogroup">
                {STATUS_ICONS.map((name) => {
                  const on = statusIcon(status) === name;
                  return (
                    <Hover key={name}>
                      {(hovered) => (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityLabel={name}
                          accessibilityState={{ checked: on }}
                          onPress={() => change(status.id, { icon: name })}
                          style={[
                            {
                              width: 26,
                              height: 26,
                              borderRadius: 6,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1,
                              borderColor: on ? colors.foreground : "transparent",
                              backgroundColor: on || hovered ? tint(colors.foreground, 0.07, colors.surface2) : "transparent",
                            },
                            BUTTON_WEB,
                          ]}
                        >
                          <Icon name={name} size={15} color={statusInk(theme, status.color)} />
                        </Pressable>
                      )}
                    </Hover>
                  );
                })}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Toggle theme={theme} label={`${status.label} closes`} value={status.closes} onValueChange={(closes) => change(status.id, { closes })} />
                <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>Closes</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 2 }}>
                <SmallButton theme={theme} icon="ChevronUp" label="Move up" disabled={at === 0} onPress={() => move(at, -1)} />
                <SmallButton theme={theme} icon="ChevronDown" label="Move down" disabled={at === draft.length - 1} onPress={() => move(at, 1)} />
                <SmallButton
                  theme={theme}
                  icon="Trash2"
                  label="Remove status"
                  disabled={draft.length <= 2}
                  onPress={() => setDraft((current) => current.filter((other) => other.id !== status.id))}
                />
              </View>
            </View>
          ))}
        </View>
        <Hover>
          {(hovered) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => setDraft((current) => [...current, { id: newId(), label: "NEW", color: "muted", closes: false, icon: "Circle" }])}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 28, alignSelf: "flex-start" }}
            >
              <Icon name="Plus" size={13} color={hovered ? colors.foreground : colors.foregroundMuted} />
              <Text style={{ color: hovered ? colors.foreground : colors.foregroundMuted, fontSize: 12.5 }}>Add status</Text>
            </Pressable>
          )}
        </Hover>
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
          <ActionButton theme={theme} label="Cancel" onPress={onClose} />
          <ActionButton
            theme={theme}
            kind="primary"
            label="Save"
            disabled={!valid || saving}
            onPress={() => {
              onSave(draft.map((status) => ({ ...status, label: status.label.trim() })));
              onClose();
            }}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}

function SmallButton({ theme, icon, label, disabled, onPress }: { theme: PluginTheme; icon: string; label: string; disabled?: boolean; onPress(): void }) {
  const { colors } = theme;
  return (
    <Hover>
      {(hovered) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          disabled={disabled}
          onPress={onPress}
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.3 : 1,
            backgroundColor: hovered && !disabled ? tint(colors.foreground, 0.07, colors.surface2) : "transparent",
          }}
        >
          <Icon name={icon} size={14} color={hovered ? colors.foreground : colors.foregroundMuted} />
        </Pressable>
      )}
    </Hover>
  );
}
