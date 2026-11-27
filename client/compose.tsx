import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  Text,
  View,
  type TextInput as NativeTextInput,
} from "react-native";
import type { RegisteredTag } from "../shared/tags";
import type { ListStyle, Status } from "../shared/todos";
import { cardLook, makeCardStyles } from "./card";
import { ActionButton, BUTTON_WEB, GrowInput, Hover, type Key, StatusPill, TagChip, tint } from "./parts";

export interface NewTodoValues {
  title: string;
  why: string;
  steps: string[];
  listStyle: ListStyle;
  links: string[];
  tags: string[];
  statusId: string;
}

interface Props {
  theme: PluginTheme;
  open: boolean;
  /** The status the todo will start in, picked from the pill. */
  status: Status;
  /** The plain first status: a neutral card and pill. */
  plain: boolean;
  registry: readonly RegisteredTag[];
  /** The tags chosen so far, edited through the labels menu like a card's. */
  tags: string[];
  onStatus(anchor: View | null): void;
  onLabels(anchor: View | null): void;
  /** Resolves to a message when the todo was refused, or null when it was added. */
  onSubmit(values: NewTodoValues): Promise<string | null>;
  onCancel(): void;
}

/**
 * The inline zone "+ New" opens above the first card. It reveals by height and opacity, and
 * unmounts its contents once it has closed, so each opening starts blank.
 */
export function NewTodoZone({ open, ...rest }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [present, setPresent] = useState(open);
  const [natural, setNatural] = useState(0);
  const [settled, setSettled] = useState(false);
  const opened = useRef(false);

  useEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  useEffect(() => {
    if (!present) return;
    if (open) {
      // Wait for the first measurement, so the reveal runs to the card's real height.
      if (natural === 0 && !opened.current) return;
      opened.current = true;
      setSettled(false);
      const run = Animated.timing(progress, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: false });
      run.start(({ finished }) => finished && setSettled(true));
      return () => run.stop();
    }
    setSettled(false);
    const run = Animated.timing(progress, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: false });
    run.start(({ finished }) => {
      if (!finished) return;
      opened.current = false;
      setPresent(false);
    });
    return () => run.stop();
  }, [open, present, natural, progress]);

  if (!present) return null;
  return (
    <Animated.View
      pointerEvents={open ? "auto" : "none"}
      style={{
        overflow: settled ? "visible" : "hidden",
        opacity: progress,
        height: settled ? undefined : progress.interpolate({ inputRange: [0, 1], outputRange: [0, natural] }),
      }}
    >
      <View style={{ paddingTop: 12 }} onLayout={({ nativeEvent }) => setNatural(nativeEvent.layout.height)}>
        <ComposeCard open={open} {...rest} />
      </View>
    </Animated.View>
  );
}

/**
 * The card being written. It has a real card's structure and styles: the title with the status pill
 * at its top right, the why line, steps with their markers, link chips, and the same footer, with
 * Cancel on the left and tags, "#" and Add on the right.
 */
function ComposeCard({ theme, open, status, plain, registry, tags, onStatus, onLabels, onSubmit, onCancel }: Props) {
  const { colors } = theme;
  const styles = useMemo(() => makeCardStyles(theme), [theme]);
  const { base, edge } = cardLook(theme, status, plain);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [steps, setSteps] = useState<{ key: number; text: string }[]>([]);
  const [links, setLinks] = useState<{ key: number; text: string }[]>([]);
  const [listStyle, setListStyle] = useState<ListStyle>("bullets");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const counter = useRef(0);
  const fields = useRef(new Map<number, NativeTextInput>());
  const focusNext = useRef<number | null>(null);
  const tagButton = useRef<View>(null);
  const ready = title.trim().length > 0 && !busy;

  useEffect(() => {
    if (focusNext.current === null) return;
    fields.current.get(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    const message = await onSubmit({
      title,
      why,
      steps: steps.map((step) => step.text).filter((text) => text.trim()),
      listStyle,
      links: links.map((link) => link.text).filter((text) => text.trim()),
      tags,
      statusId: status.id,
    }).catch(() => "Could not add the todo.");
    setBusy(false);
    if (message) setError(message);
  };
  const escape = (event: Key) => {
    if (event.nativeEvent.key === "Escape") onCancel();
  };
  const field = (key: number) => (node: NativeTextInput | null) => {
    if (node) fields.current.set(key, node);
    else fields.current.delete(key);
  };

  const addStep = (after?: number) => {
    const key = ++counter.current;
    focusNext.current = key;
    setSteps((current) => {
      const at = after === undefined ? current.length : current.findIndex((step) => step.key === after) + 1;
      return [...current.slice(0, at), { key, text: "" }, ...current.slice(at)];
    });
  };
  const stepKey = (key: number) => (event: Key) => {
    escape(event);
    if (event.nativeEvent.key !== "Backspace") return;
    const at = steps.findIndex((step) => step.key === key);
    if (steps[at]?.text !== "") return;
    // The key must not also delete a letter of the step it hands focus to.
    event.preventDefault();
    focusNext.current = steps[at - 1]?.key ?? 0;
    setSteps((current) => current.filter((step) => step.key !== key));
  };
  const addLink = () => {
    const key = ++counter.current;
    focusNext.current = 1000 + key;
    setLinks((current) => [...current, { key, text: "" }]);
  };

  return (
    <View
      style={{
        backgroundColor: base,
        borderWidth: 1,
        borderColor: edge,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      <View style={{ paddingHorizontal: 14, paddingVertical: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <GrowInput
              field={field(0)}
              autoFocus={open}
              value={title}
              maxLength={120}
              onChange={setTitle}
              onEnter={() => void submit()}
              onKey={escape}
              placeholder="Title"
              color={colors.foregroundMuted}
              lineHeight={20}
              style={[styles.title]}
            />
          </View>
          <View style={{ marginTop: -1 }}>
            <StatusPill theme={theme} status={status} neutral={plain} onMenu={onStatus} />
          </View>
        </View>
        <GrowInput
          field={field(-1)}
          value={why}
          maxLength={400}
          onChange={setWhy}
          onEnter={() => void submit()}
          onKey={escape}
          placeholder="Why"
          color={colors.foregroundMuted}
          lineHeight={17}
          style={[styles.why]}
        />
        <View style={styles.steps}>
          {steps.map((step, index) => (
            <View key={step.key} style={styles.step}>
              <Text style={[styles.stepMarker, listStyle === "numbers" ? styles.numberMarker : styles.bulletMarker]}>
                {listStyle === "numbers" ? `${index + 1}.` : "\u2022"}
              </Text>
              <GrowInput
                field={field(step.key)}
                value={step.text}
                maxLength={240}
                onChange={(text) => setSteps((current) => current.map((other) => (other.key === step.key ? { ...other, text } : other)))}
                onEnter={() => addStep(step.key)}
                onKey={stepKey(step.key)}
                placeholder="Step"
                color={colors.foregroundMuted}
                lineHeight={18}
                style={[styles.stepText]}
              />
            </View>
          ))}
          <View style={[styles.step, { alignItems: "center" }]}>
            <Hover style={{ flex: 1 }}>
              {(over) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add step"
                  onPress={() => addStep()}
                  style={[{ flexDirection: "row", alignItems: "center", gap: 6, height: 18 }, BUTTON_WEB]}
                >
                  {/* The plus sits in the marker column, so "Add step" lines up with the step text. */}
                  <Text style={[styles.stepMarker, listStyle === "numbers" ? styles.numberMarker : styles.bulletMarker, { color: over ? colors.foreground : colors.foregroundMuted }]}>+</Text>
                  <Text style={{ fontSize: 12.5, lineHeight: 18, color: over ? colors.foreground : colors.foregroundMuted }}>Add step</Text>
                </Pressable>
              )}
            </Hover>
            <ListToggle theme={theme} value={listStyle} onChange={setListStyle} />
          </View>
        </View>
        <View style={styles.chips}>
          {links.map((link) => (
            <View key={link.key} style={[styles.chip, { borderColor: edge }]}>
              <TextInput
                ref={field(1000 + link.key)}
                value={link.text}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(text) => setLinks((current) => current.map((other) => (other.key === link.key ? { ...other, text } : other)))}
                onSubmitEditing={() => void submit()}
                onKeyPress={(event) => {
                  escape(event);
                  if (event.nativeEvent.key === "Backspace" && link.text === "") {
                    event.preventDefault();
                    setLinks((current) => current.filter((other) => other.key !== link.key));
                  }
                }}
                placeholder="URL"
                placeholderTextColor={colors.foregroundMuted}
                accessibilityLabel="URL"
                style={[styles.host, { width: 180, padding: 0, margin: 0, borderWidth: 0, backgroundColor: "transparent", outlineWidth: 0 }]}
              />
            </View>
          ))}
          <Hover>
            {(over) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add link"
                onPress={addLink}
                style={[styles.chip, { borderColor: over ? colors.foregroundMuted : edge, borderStyle: "dashed", backgroundColor: "transparent" }, BUTTON_WEB]}
              >
                <Icon name="Plus" size={11} color={over ? colors.foreground : colors.foregroundMuted} />
                <Text style={{ fontSize: 11.5, lineHeight: 15, color: over ? colors.foreground : colors.foregroundMuted }}>Link</Text>
              </Pressable>
            )}
          </Hover>
        </View>
        {error ? <Text style={{ marginTop: 10, color: colors.statusDanger, fontSize: 12, lineHeight: 16 }}>{error}</Text> : null}
      </View>
      <View style={[styles.foot, { borderTopColor: edge }]}>
        <Hover>
          {(over) => (
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onCancel} style={[styles.jump, BUTTON_WEB]}>
              <Text style={[styles.time, over && styles.timeHover]}>Cancel</Text>
            </Pressable>
          )}
        </Hover>
        <View style={styles.footEnd}>
          {tags.map((tag) => (
            <TagChip key={tag} theme={theme} name={tag} registry={registry} />
          ))}
          <Hover>
            {(over) => (
              <Pressable
                ref={tagButton}
                accessibilityRole="button"
                accessibilityLabel="Tags"
                onPress={() => onLabels(tagButton.current)}
                style={[styles.tagButton, over && { backgroundColor: tint(colors.foreground, 0.07, colors.surface2) }]}
              >
                <Icon name="Hash" size={14} color={over ? colors.foreground : colors.foregroundMuted} />
              </Pressable>
            )}
          </Hover>
          <ActionButton theme={theme} kind="primary" compact label="Add" disabled={!ready} onPress={() => void submit()} />
        </View>
      </View>
    </View>
  );
}

/** Bullets or numbers for the steps: two tiny icons, muted until hovered, the chosen one in foreground. */
function ListToggle({ theme, value, onChange }: { theme: PluginTheme; value: ListStyle; onChange(next: ListStyle): void }) {
  const { colors } = theme;
  const options: { key: ListStyle; icon: string; label: string }[] = [
    { key: "bullets", icon: "List", label: "Bulleted steps" },
    { key: "numbers", icon: "ListOrdered", label: "Numbered steps" },
  ];
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 2 }}>
      {options.map((option) => {
        const on = option.key === value;
        return (
          <Hover key={option.key}>
            {(hovered) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{ checked: on }}
                onPress={() => onChange(option.key)}
                style={[{ width: 20, height: 18, alignItems: "center", justifyContent: "center" }, BUTTON_WEB]}
              >
                <Icon name={option.icon} size={13} color={on || hovered ? colors.foreground : colors.foregroundMuted} />
              </Pressable>
            )}
          </Hover>
        );
      })}
    </View>
  );
}
