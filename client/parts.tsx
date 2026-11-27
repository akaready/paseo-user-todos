import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type NativeSyntheticEvent,
  type TextInput as NativeTextInput,
  type StyleProp,
  type TextInputKeyPressEventData,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import { hueInk, tagColors, type RegisteredTag } from "../shared/tags";
import { statusIcon, type Status, type StatusColor } from "../shared/todos";

/** A theme color at some opacity, which lightens or darkens any surface for hover and press. */
export function tint(color: string, alpha: number, fallback: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return fallback;
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

/**
 * Hover goes on a plain View with pointer events and press on a Pressable inside it. That is
 * Paseo's own pattern, and it reaches the iPad's trackpad; Pressable's `hovered` does not.
 */
export function Hover({
  children,
  style,
  onChange,
}: {
  children: (hovered: boolean) => ReactNode;
  style?: StyleProp<ViewStyle>;
  onChange?: (hovered: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const set = (next: boolean) => {
    setHovered(next);
    onChange?.(next);
  };
  return (
    <View style={style} onPointerEnter={() => set(true)} onPointerLeave={() => set(false)}>
      {children(hovered)}
    </View>
  );
}

/** A checkbox. `preview` draws the ticked box faintly, to show what a click will do. */
export const Checkbox = forwardRef<
  View,
  { theme: PluginTheme; checked: boolean; preview?: boolean; small?: boolean }
>(function Checkbox({ theme, checked, preview = false, small = false }, ref) {
  const size = small ? 14 : 16;
  const filled = checked || preview;
  return (
    <View
      ref={ref}
      style={{
        width: size,
        height: size,
        borderRadius: small ? 4 : 5,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled ? theme.colors.statusSuccess : "transparent",
        borderWidth: filled ? 0 : 1.5,
        borderColor: theme.colors.foregroundMuted,
        opacity: !checked && preview ? 0.4 : 1,
      }}
    >
      {filled ? <Icon name="Check" size={small ? 10 : 12} color={theme.colors.surface0} /> : null}
    </View>
  );
});

/** A row of options with one chosen, as in Paseo's own segmented controls. */
export function Segmented<Key extends string>({
  theme,
  items,
  value,
  onChange,
  style,
  height = 30,
  compact = false,
  onLayout,
}: {
  theme: PluginTheme;
  items: readonly { key: Key; label: string; count?: number }[];
  /** Too narrow for every label: only the selected item keeps its label, the others show just their count. */
  compact?: boolean;
  onLayout?: ViewProps["onLayout"];
  /** The whole control's height. */
  height?: number;
  value: Key;
  onChange(key: Key): void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = theme;
  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={onLayout}
      style={[{ flexDirection: "row", height, padding: 2, gap: 2, borderRadius: 8, backgroundColor: colors.surface2 }, style]}
    >
      {items.map((item) => {
        const on = item.key === value;
        const color = on ? colors.foreground : colors.foregroundMuted;
        return (
          <Hover key={item.key} style={{ flex: compact && !on ? 0 : 1, minWidth: compact && !on ? 28 : 0 }}>
            {(hovered) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={item.count !== undefined ? `${item.label} ${item.count}` : item.label}
            onPress={() => onChange(item.key)}
            style={[
              {
                flex: 1,
                paddingHorizontal: compact && !on ? 8 : 0,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: on ? colors.border : "transparent",
                backgroundColor: on ? colors.surface0 : hovered ? tint(colors.foreground, 0.05, colors.surface2) : "transparent",
              },
              BUTTON_WEB,
            ]}
          >
            {compact && !on && item.count !== undefined ? null : (
              <Text style={{ color: hovered ? colors.foreground : color, fontSize: 12 }}>{item.label}</Text>
            )}
            {item.count !== undefined ? <Text style={{ color: hovered ? colors.foreground : color, fontSize: 12 }}>{item.count}</Text> : null}
          </Pressable>
            )}
          </Hover>
        );
      })}
    </View>
  );
}

/** A small switch, 32 by 18, that sits on the same edge as whatever it is aligned with. */
export function Toggle({
  theme,
  value,
  onValueChange,
  label,
  disabled,
}: {
  theme: PluginTheme;
  value: boolean;
  onValueChange(value: boolean): void;
  label: string;
  disabled?: boolean;
}) {
  const { colors } = theme;
  return (
    <Hover>
      {(hovered) => (
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel={label}
          accessibilityState={{ checked: value, disabled }}
          disabled={disabled}
          onPress={() => onValueChange(!value)}
          style={[
            {
              width: 32,
              height: 18,
              borderRadius: 9,
              justifyContent: "center",
              backgroundColor: value ? (hovered ? mix(colors.foreground, colors.surface0, 0.18) : colors.foreground) : hovered ? mix(colors.surface2, colors.foreground, 0.08) : colors.surface2,
              borderWidth: value ? 0 : 1,
              borderColor: hovered && !value ? tint(colors.foreground, 0.3, colors.border) : colors.border,
              opacity: disabled ? 0.5 : 1,
            },
            BUTTON_WEB,
          ]}
        >
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              marginLeft: value ? 16 : 2,
              backgroundColor: value ? colors.surface0 : colors.foregroundMuted,
            }}
          />
        </Pressable>
      )}
    </Hover>
  );
}

/** Plugin themes carry no light or dark flag, so it is read off the page surface's lightness. */
export function isDark(theme: PluginTheme): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(theme.colors.surface0);
  if (!match) return true;
  const [r, g, b] = [match[1]!, match[2]!, match[3]!].map((part) => parseInt(part, 16));
  return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255 < 0.5;
}

/** A status color as ink: the theme's own, or Paseo's label blue for the scheme in use. */
export function statusInk(theme: PluginTheme, color: StatusColor): string {
  const { colors } = theme;
  switch (color) {
    case "blue":
      return hueInk("blue", isDark(theme));
    case "accent":
      return colors.accent;
    case "success":
      return colors.statusSuccess;
    case "warning":
      return colors.statusWarning;
    case "danger":
      return colors.statusDanger;
    default:
      return colors.foregroundMuted;
  }
}

/** `over` laid on `base` at `amount`, as one opaque color. Anything that is not #rrggbb leaves `base`. */
export function mix(base: string, over: string, amount: number): string {
  const parse = (color: string) => {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
    return match ? [match[1]!, match[2]!, match[3]!].map((part) => parseInt(part, 16)) : null;
  };
  const from = parse(base);
  const to = parse(over);
  if (!from || !to) return base;
  const channel = (at: number) => Math.round(from[at]! + (to[at]! - from[at]!) * amount);
  return `#${[0, 1, 2].map((at) => channel(at).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The status control: one colored pill, the status icon (14px) and its label in 11.5px medium
 * text, 22px tall with a 6px radius. Its ground is the status color at 14% (the neutral surface
 * for a plain DO), and it deepens on hover. One click opens the status list.
 */
export function StatusPill({
  theme,
  status,
  neutral,
  onMenu,
}: {
  theme: PluginTheme;
  status: Status;
  /** The plain first status: a muted ring on a neutral ground, with no color. */
  neutral: boolean;
  onMenu(anchor: View | null): void;
}) {
  const { colors } = theme;
  const pill = useRef<View>(null);
  const ink = neutral ? colors.foregroundMuted : statusInk(theme, status.color);
  return (
    <Hover>
      {(over) => (
        <Pressable
          ref={pill}
          accessibilityRole="button"
          accessibilityLabel={`Status ${status.label}, change`}
          onPress={() => onMenu(pill.current)}
          style={[
            {
              height: 22,
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: neutral
                ? over
                  ? mix(colors.surface2, colors.foreground, 0.08)
                  : colors.surface2
                : tint(ink, over ? 0.24 : 0.14, colors.surface2),
            },
            BUTTON_WEB,
          ]}
        >
          <Icon name={statusIcon(status)} size={14} color={ink} />
          <Text style={{ color: ink, fontSize: 11.5, fontWeight: "500" }}>{status.label}</Text>
        </Pressable>
      )}
    </Hover>
  );
}

/**
 * A tag, drawn as Paseo draws a workspace label in its sidebar (`WorkspaceLabelChip`): the name in
 * its hue on a 10% ground of the same hue, 12px text on a 16px line, 6px of ground either side,
 * fully round, no border and no vertical padding.
 */
export function TagChip({
  theme,
  name,
  registry,
  onRemove,
}: {
  theme: PluginTheme;
  name: string;
  registry?: readonly RegisteredTag[];
  /** Adds a small close, for the composer; a card's tags have none. */
  onRemove?: () => void;
}) {
  const { ground, ink } = tagColors(name, isDark(theme), registry);
  return (
    <View
      accessibilityLabel={`Tag ${name}`}
      style={{
        flexShrink: 1,
        minWidth: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 6,
        borderRadius: 9999,
        backgroundColor: ground,
      }}
    >
      <Text numberOfLines={1} style={{ flexShrink: 1, minWidth: 0, color: ink, fontSize: 12, lineHeight: 16 }}>
        {name}
      </Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove tag ${name}`} onPress={onRemove} hitSlop={6}>
          <Icon name="X" size={10} color={ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Web-only CSS that React Native's style types do not list: a pointer, and a 120ms color change. */
export const BUTTON_WEB = {
  cursor: "pointer",
  transitionProperty: "background-color, opacity",
  transitionDuration: "120ms",
} as unknown as ViewStyle;

/**
 * A text button with a hover state, built the way Paseo does hover (a plain View tracks it, the
 * Pressable inside presses), so it reaches the iPad's trackpad. `plain` is muted and takes a
 * `surface2` ground and foreground text on hover; `primary` is the foreground fill; `danger` is
 * the danger fill, which deepens toward the foreground on hover.
 */
export function ActionButton({
  theme,
  label,
  kind = "plain",
  icon,
  disabled = false,
  compact = false,
  accessibilityLabel,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  kind?: "plain" | "primary" | "danger";
  /** 24px tall instead of 26. */
  compact?: boolean;
  icon?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress(): void;
}) {
  const { colors } = theme;
  return (
    <Hover>
      {(hovered) => {
        const on = hovered && !disabled;
        const ground =
          kind === "primary"
            ? on
              ? mix(colors.foreground, colors.surface0, 0.18)
              : colors.foreground
            : kind === "danger"
              ? on
                ? mix(colors.statusDanger, colors.foreground, 0.2)
                : colors.statusDanger
              : on
                ? colors.surface2
                : "transparent";
        const ink = kind === "plain" ? (on ? colors.foreground : colors.foregroundMuted) : colors.surface0;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={[
              {
                height: compact ? 24 : 26,
                paddingHorizontal: 10,
                borderRadius: 6,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                opacity: disabled ? 0.35 : 1,
                backgroundColor: ground,
              },
              BUTTON_WEB,
            ]}
          >
            {icon ? <Icon name={icon} size={12} color={ink} /> : null}
            <Text style={{ color: ink, fontSize: 12, fontWeight: kind === "plain" ? "400" : "600" }}>{label}</Text>
          </Pressable>
        );
      }}
    </Hover>
  );
}

/** A round color swatch: ringed in `foreground` when picked, and in a fainter ring while hovered. */
export function Swatch({
  theme,
  color,
  selected,
  label,
  size = 20,
  onPress,
}: {
  theme: PluginTheme;
  color: string;
  selected: boolean;
  label: string;
  size?: number;
  onPress(): void;
}) {
  const { colors } = theme;
  return (
    <Hover>
      {(hovered) => (
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityState={{ checked: selected }}
          hitSlop={6}
          onPress={onPress}
          style={[
            {
              width: size,
              height: size,
              borderRadius: 9999,
              backgroundColor: color,
              borderWidth: selected || hovered ? 2 : 0,
              borderColor: selected ? colors.foreground : tint(colors.foreground, 0.45, colors.border),
            },
            BUTTON_WEB,
          ]}
        />
      )}
    </Hover>
  );
}

export type Key = NativeSyntheticEvent<TextInputKeyPressEventData>;

/** A multiline field that grows with its text, so a wrapped title or why reads like the card's own text. */
export function GrowInput({
  value,
  onChange,
  onEnter,
  onKey,
  placeholder,
  color,
  lineHeight,
  style,
  autoFocus,
  maxLength,
  field,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange(text: string): void;
  /** Enter without Shift. */
  onEnter(): void;
  onKey?(event: Key): void;
  placeholder: string;
  color: string;
  lineHeight: number;
  style: StyleProp<TextStyle>;
  autoFocus?: boolean;
  maxLength?: number;
  field?: (node: NativeTextInput | null) => void;
  onFocus?(): void;
  onBlur?(): void;
}) {
  const [height, setHeight] = useState(lineHeight);
  // An emptied field is one line again; the browser reports no smaller size once it has grown.
  useEffect(() => {
    if (value === "") setHeight(lineHeight);
  }, [value, lineHeight]);
  return (
    <TextInput
      ref={field}
      multiline
      autoFocus={autoFocus}
      value={value}
      maxLength={maxLength}
      onChangeText={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      onContentSizeChange={(event) => setHeight(Math.max(lineHeight, Math.ceil(event.nativeEvent.contentSize.height)))}
      onKeyPress={(event) => {
        onKey?.(event);
        const native = event.nativeEvent as { key: string; shiftKey?: boolean };
        if (native.key === "Enter" && !native.shiftKey) {
          event.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      placeholderTextColor={color}
      accessibilityLabel={placeholder}
      scrollEnabled={false}
      style={[style, { height, padding: 0, margin: 0, borderWidth: 0, backgroundColor: "transparent", outlineWidth: 0, textAlignVertical: "top" }]}
    />
  );
}
