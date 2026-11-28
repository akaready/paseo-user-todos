import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  hueInk,
  MAX_TAG_LENGTH,
  normalizeTag,
  TAG_HUES,
  tagKey,
  type RegisteredTag,
  type TagHue,
} from "../shared/tags";
import { Hover, isDark, Swatch, tint } from "./parts";
import { onEscape } from "./web";

export interface MenuOption {
  key: string;
  label: string;
  selected?: boolean;
  /** A Lucide icon before the label, with its color. */
  icon?: { name: string; color: string };
  /** A small muted section label above this row. */
  heading?: string;
  /** A divider above this row (and above its heading). */
  divider?: boolean;
  onSelect(): void;
}

/** Where a menu opens: the trigger's box, in the panel's own coordinates. */
export interface MenuState {
  rect: { x: number; y: number; width: number; height: number };
  /** Which toolbar menu this is: the panel builds its rows on every render, and a pick leaves it open. */
  kind?: "filter" | "view";
  /** A one-off menu's rows, fixed when it opened: a pick closes it. */
  options?: readonly MenuOption[];
  /** Which edge of the trigger the menu lines up with. */
  align?: "start" | "end";
}

const EDGE = 8;
/** Paseo's menu rows (`MenuItem`): an 18px line with 4px of padding and a border either side. */
const ROW = 28;
const LIST_MAX = 7 * ROW;

/**
 * The surface every menu here sits on, in the panel's own layer so a card's clipping never touches
 * it. It opens under its trigger, or over it when there is no room, lines up with one of the
 * trigger's edges, and a tap anywhere else closes it. It measures itself before it shows, so a menu
 * that changes height (the labels menu's second page) keeps its place.
 */
function MenuSurface({
  theme,
  rect,
  bounds,
  width,
  align = "end",
  label,
  onClose,
  onEscapeKey,
  children,
}: {
  theme: PluginTheme;
  rect: MenuState["rect"];
  bounds: { width: number; height: number };
  width: number;
  align?: "start" | "end";
  label: string;
  onClose(): void;
  /** What Escape does, when it is not closing the menu. */
  onEscapeKey?(): void;
  children: ReactNode;
}) {
  const { colors } = theme;
  const [height, setHeight] = useState(0);
  const below = rect.y + rect.height + 4;
  const top = below + height > bounds.height - EDGE ? Math.max(EDGE, rect.y - height - 4) : below;
  const wanted = align === "end" ? rect.x + rect.width - width : rect.x;
  const left = Math.max(EDGE, Math.min(wanted, bounds.width - width - EDGE));
  useEffect(() => onEscape(onEscapeKey ?? onClose), [onClose, onEscapeKey]);
  return (
    <>
      <Pressable accessibilityLabel={`Close ${label}`} onPress={onClose} style={[StyleSheet.absoluteFill, { zIndex: 40 }]} />
      <View
        accessibilityRole="menu"
        accessibilityLabel={label}
        onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
        style={{
          position: "absolute",
          top,
          left,
          width,
          zIndex: 41,
          paddingVertical: 4,
          opacity: height === 0 ? 0 : 1,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface1,
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        }}
      >
        {children}
      </View>
    </>
  );
}

/** A menu row, with Paseo's metrics: 4px in from the surface, 8px of padding, a 16px slot either side. */
export function Row({
  theme,
  leading,
  trailing,
  label,
  selected,
  disabled,
  accessibilityLabel,
  onPress,
}: {
  theme: PluginTheme;
  leading?: ReactNode;
  trailing?: ReactNode;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress(): void;
}) {
  const { colors } = theme;
  return (
    <Hover>
      {(hovered) => (
        <Pressable
          accessibilityRole="menuitem"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ selected, disabled }}
          disabled={disabled}
          onPress={onPress}
          style={{
            minHeight: ROW,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginHorizontal: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: "transparent",
            borderRadius: 6,
            opacity: disabled ? 0.5 : 1,
            backgroundColor: hovered && !disabled ? colors.surface2 : "transparent",
          }}
        >
          {leading ? <View style={{ width: 16, alignItems: "center", justifyContent: "center" }}>{leading}</View> : null}
          <Text numberOfLines={1} style={{ flexShrink: 1, color: colors.foreground, fontSize: 14, lineHeight: 18 }}>
            {label}
          </Text>
          <View style={{ marginLeft: "auto", width: 16, alignItems: "center", justifyContent: "center" }}>
            {trailing ?? (selected ? <Icon name="Check" size={14} color={colors.foreground} /> : null)}
          </View>
        </Pressable>
      )}
    </Hover>
  );
}

export function Separator({ theme }: { theme: PluginTheme }) {
  return <View style={{ height: 1, marginVertical: 4, backgroundColor: theme.colors.border }} />;
}

/** A dropdown of rows. With `keepOpen` a pick leaves it up, so the rows it is given must be current. */
export function MenuLayer({
  theme,
  state,
  options,
  keepOpen = false,
  bounds,
  onClose,
}: {
  theme: PluginTheme;
  state: MenuState;
  options: readonly MenuOption[];
  keepOpen?: boolean;
  bounds: { width: number; height: number };
  onClose(): void;
}) {
  return (
    <MenuSurface theme={theme} rect={state.rect} bounds={bounds} width={180} align={state.align} label="Menu" onClose={onClose}>
      <ScrollView style={{ maxHeight: LIST_MAX + 2 * ROW }}>
      {options.map((option) => (
        <View key={option.key}>
          {option.divider ? <Separator theme={theme} /> : null}
          {option.heading ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{option.heading}</Text>
            </View>
          ) : null}
          <Row
            theme={theme}
            label={option.label}
            selected={option.selected}
            leading={option.icon ? <Icon name={option.icon.name} size={16} color={option.icon.color} /> : undefined}
            onPress={() => {
              if (!keepOpen) onClose();
              option.onSelect();
            }}
          />
        </View>
      ))}
      </ScrollView>
    </MenuSurface>
  );
}

/**
 * Paseo's Labels flyouts, measured in its web UI: the list is its 180px minimum; the "Create label"
 * flyout is 334 wide (13px of padding either side of ten 20px swatches with 12px between, a 326px
 * field and a 326px "Create" row, both 4px in from the edge). The picked swatch is ringed 2px in
 * `foreground`. The panel is narrower than 334, so there the swatches close up to stay on one row.
 */
const LIST_WIDTH = 200;
const CREATE_WIDTH = 334;
const SWATCH = 20;
const SWATCH_GAP = 12;

/**
 * Paseo's Labels submenu for one todo, down to its sizes. A row per label: a 10px dot in its color,
 * its name, and a check when this todo has it (a tap toggles, and the menu stays open). Then a
 * divider and "Create label", which swaps in a page with a "Label name" field, ten color swatches,
 * a divider and "Create". Creating registers the label and applies it, then goes back to the list.
 */
export function LabelsMenu({
  theme,
  rect,
  bounds,
  labels,
  active,
  onToggle,
  onCreate,
  onClose,
}: {
  theme: PluginTheme;
  rect: MenuState["rect"];
  bounds: { width: number; height: number };
  /** Paseo's labels first, then the ones the plugin recorded, with the colors to show. */
  labels: readonly RegisteredTag[];
  /** The labels on this todo. */
  active: readonly string[];
  onToggle(name: string): void;
  onCreate(name: string, color: TagHue): void;
  onClose(): void;
}) {
  const { colors } = theme;
  const dark = isDark(theme);
  const [page, setPage] = useState<"list" | "create">("list");
  const [text, setText] = useState("");
  const [color, setColor] = useState<TagHue>(TAG_HUES[0]);
  const [focused, setFocused] = useState(false);
  const name = normalizeTag(text);
  const createWidth = Math.min(CREATE_WIDTH, bounds.width - 2 * EDGE);
  const gap = Math.max(4, Math.min(SWATCH_GAP, Math.floor((createWidth - 26 - TAG_HUES.length * SWATCH) / (TAG_HUES.length - 1))));
  const create = () => {
    if (!name) return;
    onCreate(name, color);
    setText("");
    setPage("list");
  };

  return (
    <MenuSurface
      theme={theme}
      rect={rect}
      bounds={bounds}
      width={page === "create" ? createWidth : LIST_WIDTH}
      label="Labels"
      onClose={onClose}
      onEscapeKey={page === "create" ? () => setPage("list") : onClose}
    >
      {page === "list" ? (
        <>
          {labels.length > 0 ? (
            <ScrollView style={{ maxHeight: LIST_MAX }}>
              {labels.map((tag) => (
                <Row
                  key={tag.name}
                  theme={theme}
                  label={tag.name}
                  selected={active.some((other) => tagKey(other) === tagKey(tag.name))}
                  leading={<View style={{ width: 10, height: 10, borderRadius: 9999, backgroundColor: hueInk(tag.color, dark) }} />}
                  onPress={() => onToggle(tag.name)}
                />
              ))}
            </ScrollView>
          ) : null}
          {labels.length > 0 ? <Separator theme={theme} /> : null}
          <Row
            theme={theme}
            label="Create label"
            leading={<Icon name="Plus" size={14} color={colors.foregroundMuted} />}
            trailing={<Icon name="ChevronRight" size={14} color={colors.foregroundMuted} />}
            onPress={() => setPage("create")}
          />
        </>
      ) : (
        <>
          <View
            style={{
              minHeight: ROW,
              flexDirection: "row",
              alignItems: "center",
              marginHorizontal: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 6,
              backgroundColor: colors.surface2,
            }}
          >
            <TextInput
              autoFocus
              value={text}
              maxLength={MAX_TAG_LENGTH}
              onChangeText={setText}
              onSubmitEditing={create}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              // Nothing typed here may press anything behind the menu.
              onKeyPress={(event) => event.stopPropagation()}
              placeholder="Label name"
              placeholderTextColor={colors.foregroundMuted}
              accessibilityLabel="Label name"
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                flex: 1,
                minWidth: 0,
                padding: 0,
                margin: 0,
                borderWidth: 0,
                backgroundColor: "transparent",
                color: colors.foreground,
                fontSize: 12,
                lineHeight: 18,
                // Paseo's focus ring on the field: a 2px outline in the accent color.
                outlineStyle: "solid",
                outlineWidth: focused ? 2 : 0,
                outlineColor: colors.accent,
              }}
            />
          </View>
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap, paddingHorizontal: 13, paddingVertical: 8 }}
          >
            {TAG_HUES.map((hue) => (
              <Swatch key={hue} theme={theme} color={hueInk(hue, dark)} selected={hue === color} label={hue} size={SWATCH} onPress={() => setColor(hue)} />
            ))}
          </View>
          <Separator theme={theme} />
          <Row theme={theme} label="Create" disabled={!name} onPress={create} />
        </>
      )}
    </MenuSurface>
  );
}
