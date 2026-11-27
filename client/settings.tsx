import type { PluginTheme } from "@getpaseo/plugin";
import { useState } from "react";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TodoSettings } from "../shared/todos";
import { ActionButton, Hover, Segmented, Toggle, tint } from "./parts";

/**
 * The panel's settings, in a popover under the gear. Every row shares the popover's 12px edges:
 * 32px rows with 8px between them, labels on the left and switches on the right. A click
 * anywhere else in the panel closes it.
 */
export function SettingsPopover({
  theme,
  values,
  saving,
  onChange,
  onClose,
  clearLabel,
  clearCount,
  onClear,
  onEditStatuses,
}: {
  theme: PluginTheme;
  values: TodoSettings;
  saving: boolean;
  onChange(change: Partial<TodoSettings>): void;
  onClose(): void;
  /** What Clear removes, in words: "this chat" or "all chats". */
  clearLabel: string;
  clearCount: number;
  onClear(): void;
  onEditStatuses(): void;
}) {
  const { colors } = theme;
  const [confirming, setConfirming] = useState(false);
  const label = { color: colors.foregroundMuted, fontSize: 12 };
  const row = { height: 32, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const };
  const text = { color: colors.foreground, fontSize: 12.5 };

  return (
    <>
      <Pressable
        accessibilityLabel="Close settings"
        onPress={onClose}
        style={[StyleSheet.absoluteFill, { zIndex: 20 }]}
      />
      <View
        accessibilityLabel="Panel settings"
        style={{
          position: "absolute",
          top: 46,
          right: 10,
          width: 280,
          zIndex: 21,
          padding: 12,
          gap: 8,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface1,
          shadowColor: "#000",
          shadowOpacity: 0.12,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        <Text style={label}>Wait before showing</Text>
        <Segmented
          theme={theme}
          value={String(values.graceTurns) as "1" | "2" | "3"}
          items={[
            { key: "1", label: "1 turn" },
            { key: "2", label: "2 turns" },
            { key: "3", label: "3 turns" },
          ]}
          onChange={(next) => !saving && onChange({ graceTurns: Number(next) as 1 | 2 | 3 })}
        />
        <View style={row}>
          <Text style={text}>Open panel automatically</Text>
          <Toggle theme={theme} label="Open panel automatically" value={values.autoOpen} disabled={saving} onValueChange={(autoOpen) => onChange({ autoOpen })} />
        </View>
        <View style={row}>
          <Text style={text}>Confetti</Text>
          <Toggle theme={theme} label="Confetti" value={values.confetti} disabled={saving} onValueChange={(confetti) => onChange({ confetti })} />
        </View>
        <View style={{ height: 1, backgroundColor: colors.border, marginTop: 4 }} />
        <Hover style={{ marginHorizontal: -8 }}>
          {(hovered) => (
            <Pressable
              accessibilityRole="button"
              onPress={onEditStatuses}
              style={{
                height: 32,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor: hovered ? tint(colors.foreground, 0.07, colors.surface2) : "transparent",
              }}
            >
              <Icon name="ListChecks" size={14} color={colors.foregroundMuted} />
              <Text style={text}>Edit statuses</Text>
            </Pressable>
          )}
        </Hover>
        {confirming ? (
          <View
            style={{
              gap: 10,
              padding: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: tint(colors.statusDanger, 0.45, colors.border),
              backgroundColor: tint(colors.statusDanger, 0.08, colors.surface1),
            }}
          >
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <View style={{ height: 18, justifyContent: "center" }}>
                <Icon name="TriangleAlert" size={14} color={colors.statusDanger} />
              </View>
              <Text style={{ flex: 1, color: colors.foreground, fontSize: 12.5, lineHeight: 18 }}>
                Clear {clearCount} {clearCount === 1 ? "todo" : "todos"}? There is no undo.
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 6 }}>
              <ActionButton theme={theme} label="Cancel" onPress={() => setConfirming(false)} />
              <ActionButton
                theme={theme}
                kind="danger"
                label="Clear"
                icon="Trash2"
                accessibilityLabel={`Clear ${clearCount} todos`}
                onPress={() => {
                  setConfirming(false);
                  onClear();
                  onClose();
                }}
              />
            </View>
          </View>
        ) : (
          <Hover style={{ marginHorizontal: -8 }}>
            {(hovered) => (
              <Pressable
                accessibilityRole="button"
                disabled={clearCount === 0}
                onPress={() => setConfirming(true)}
                style={{
                  height: 32,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  backgroundColor: hovered && clearCount > 0 ? tint(colors.statusDanger, 0.1, colors.surface1) : "transparent",
                  opacity: clearCount === 0 ? 0.5 : 1,
                }}
              >
                <Icon name="Trash2" size={14} color={colors.statusDanger} />
                <Text style={{ color: colors.statusDanger, fontSize: 12.5 }}>Clear all todos in {clearLabel}</Text>
              </Pressable>
            )}
          </Hover>
        )}
      </View>
    </>
  );
}
