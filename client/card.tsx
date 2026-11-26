import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View, type ViewStyle } from "react-native";
import { useAgent } from "@getpaseo/plugin/client";
import type { RegisteredTag } from "../shared/tags";
import { describeLink, type Status, type Todo } from "../shared/todos";
import { DragCard } from "./drag";
import { Hover, mix, StatusPill, statusInk, TagChip, tint } from "./parts";

const pad = (value: number) => String(value).padStart(2, "0");

/** The time the todo was made, "11:20". */
export function whenOf(todo: Todo) {
  const at = new Date(todo.createdAt);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The full date and time, for anyone who hovers where hover exists. */
function fullWhen(todo: Todo) {
  return new Date(todo.createdAt).toLocaleString();
}

/** Web-only CSS that React Native's style types do not list. */
const POINTER = { cursor: "pointer" } as unknown as ViewStyle;

/** The card's styles, shared with the composer so a card being written looks like one already written. */
export function makeCardStyles(theme: PluginTheme) {
  const { colors } = theme;
  return {
    title: { color: colors.foreground, fontSize: 13, fontWeight: "600" as const, lineHeight: 20 },
    why: { marginTop: 3, color: colors.foregroundMuted, fontSize: 12, lineHeight: 17 },
    chips: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6, marginTop: 10 },
    chipBox: { maxWidth: "100%" as const },
    chipText: { flexShrink: 1, flexDirection: "row" as const, flexWrap: "wrap" as const, columnGap: 5 },
    chip: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 5,
      minHeight: 24,
      maxWidth: "100%" as const,
      paddingVertical: 3,
      paddingHorizontal: 9,
      borderWidth: 1,
      borderRadius: 12,
      // Translucent, so it reads on any card color: never a near-black pill on a tinted card.
      backgroundColor: tint(colors.foreground, 0.06, colors.surface2),
    },
    chipHover: { backgroundColor: tint(colors.foreground, 0.12, colors.surface2) },
    host: { color: colors.foreground, fontSize: 11.5, lineHeight: 15 },
    path: { color: colors.foregroundMuted, fontSize: 11.5, lineHeight: 15 },
    steps: { marginTop: 10, gap: 4 },
    step: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 6 },
    stepMarker: { color: colors.foregroundMuted, fontSize: 12.5, lineHeight: 18 },
    bulletMarker: { width: 8 },
    numberMarker: { minWidth: 16 },
    stepText: { flex: 1, minWidth: 0, color: colors.foreground, fontSize: 12.5, lineHeight: 18 },
    foot: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      columnGap: 8,
      rowGap: 8,
      minHeight: 40,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    // The labels, only when the todo has some.
    labelsRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderTopWidth: 1,
    },
    // The thin bottom row: the arrow, the time and the chat's name, with "#" at its right end.
    timeRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 8,
      paddingVertical: 4,
      paddingLeft: 14,
      paddingRight: 10,
      borderTopWidth: 1,
    },
    jump: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, minHeight: 18, flexShrink: 1, minWidth: 0 },
    time: { color: colors.foregroundMuted, fontSize: 11.5 },
    timeHover: { color: colors.foreground },
    // Tags, "#" and the expand chevron: beside the time when there is room, on a line of their own when not.
    footEnd: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      justifyContent: "flex-end" as const,
      alignItems: "center" as const,
      columnGap: 6,
      rowGap: 6,
      minHeight: 24,
    },
    tagButton: { width: 24, height: 24, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 6 },
  };
}

/** A card's surface and outline for a status: the tint stays faint and the outline quiet. */
export function cardLook(theme: PluginTheme, status: Status, plain: boolean) {
  const { colors } = theme;
  const ink = statusInk(theme, status.color);
  return {
    base: plain ? colors.surface1 : mix(colors.surface1, ink, 0.08),
    edge: plain ? colors.border : mix(colors.border, ink, 0.2),
  };
}

/** What the panel tells a card about a drag in progress. */
export interface CardDrag {
  /** This card is the one being dragged: its place is held, and the panel draws it in a layer above. */
  hidden: boolean;
  /** A card in this card's group is being dragged. */
  active: boolean;
  /** Where this card sits relative to its place while the group makes room. */
  offset: number;
  /** Armed by a long press, and ready to move. */
  armed: boolean;
  mouse: boolean;
  nodeRef(node: View | null): void;
  arm(): void;
  release(): void;
  onStart(): void;
  onMove(dy: number): void;
  onEnd(dy: number): void;
  /** A swipe just ended, so the click that follows it is ignored. */
  swiped(): void;
}

export interface CardProps {
  theme: PluginTheme;
  todo: Todo;
  status: Status;
  /** The status a card has when it is plain, with no tint. */
  plain: boolean;
  registry: readonly RegisteredTag[];
  /** The chat this card came from, shown above the footer when the list mixes chats. */
  meta?: { agentId: string; fallback: string | null };
  expanded: boolean;
  /** The card is on its way out after a tick. */
  leaving: boolean;
  /** The card was just reopened from Done: it grows into the list, then fades in. */
  entering?: boolean;
  reduceMotion?: boolean;
  drag: CardDrag;
  /** The copy of a card the panel draws in the drag layer: no handlers, lifted look. */
  ghost?: boolean;
  /** Wraps a press so the click that ends a drag does nothing. */
  guard<Args extends unknown[]>(run: (...args: Args) => void): (...args: Args) => void;
  onExpand(): void;
  /** A swipe right past the threshold: mark the todo done. `origin` is where the confetti starts. */
  onDone(origin: View | null): void;
  onLink(url: string): void;
  onJump(): void;
  onMenu(anchor: View | null): void;
  /** Opens the labels menu under the "#" button. */
  onLabels(button: View | null): void;
}

/** One todo: its status first, then what it asks, the steps, the links, its tags, and a way back to the chat. */
export function TodoCard({
  theme,
  todo,
  status,
  plain,
  registry,
  meta,
  expanded,
  leaving,
  entering = false,
  reduceMotion = false,
  drag,
  ghost = false,
  guard,
  onExpand,
  onDone,
  onLink,
  onJump,
  onMenu,
  onLabels,
}: CardProps) {
  const { colors } = theme;
  const styles = useMemo(() => makeCardStyles(theme), [theme]);
  const tagButton = useRef<View>(null);
  // Swiping right: the content follows the pointer over a green reveal, and past the threshold the
  // todo is marked done. Short of it, the content springs back.
  const swipe = useRef(new Animated.Value(0)).current;
  const width = useRef(0);
  const revealIcon = useRef<View>(null);
  // Closing: the card slides 10px and fades, then its height (and the gap under it) collapses so
  // the cards below glide up. Reopening plays it backward: height first, then the fade and slide.
  const fade = useRef(new Animated.Value(entering ? 0 : 1)).current;
  const collapse = useRef(new Animated.Value(entering ? 0 : 1)).current;
  const [box, setBox] = useState(0);
  const [settled, setSettled] = useState(!entering);
  const entered = useRef(false);
  const animating = !ghost && (leaving || !settled);
  const shift = useRef(new Animated.Value(0)).current;
  // The card's own hover. It stays on while the pointer is over a chip or control inside the card.
  const [overCard, setOverCard] = useState(false);
  const [overJump, setOverJump] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    if (reduceMotion) {
      fade.setValue(0);
      collapse.setValue(0);
      return;
    }
    const run = Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(collapse, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
    ]);
    run.start();
    return () => run.stop();
  }, [leaving, fade, collapse, reduceMotion]);

  useEffect(() => {
    if (!entering || entered.current || box === 0) return;
    entered.current = true;
    if (reduceMotion) {
      fade.setValue(1);
      collapse.setValue(1);
      setSettled(true);
      return;
    }
    Animated.sequence([
      Animated.timing(collapse, { toValue: 1, duration: 200, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.timing(fade, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start(() => setSettled(true));
  }, [entering, box, reduceMotion, fade, collapse]);

  // The others in a dragged card's group slide to make room, and sit still the moment the drag
  // ends, since the list is already in its new order by then.
  useEffect(() => {
    if (!drag.active) {
      shift.setValue(0);
      return;
    }
    const run = Animated.timing(shift, { toValue: drag.offset, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [drag.active, drag.offset, shift]);

  // An opaque card in every state: the status tint is mixed into the surface, never laid over it.
  const ink = statusInk(theme, status.color);
  const hovered = overCard && !leaving && !drag.active && !ghost;
  const base = plain ? colors.surface1 : mix(colors.surface1, ink, 0.08);
  const edge = drag.armed ? tint(colors.foreground, 0.4, colors.border) : plain ? colors.border : mix(colors.border, ink, 0.2);
  // The hover sits between the card and its outline, so the outline and divider stay visible.
  const ground = hovered ? mix(base, plain ? colors.border : edge, 0.45) : base;

  const onSwipeEnd = (dx: number) => {
    drag.swiped();
    // Past 90px, or 35% of a narrow card, counts as a swipe.
    const need = Math.min(90, width.current * 0.35);
    if (dx >= need) {
      onDone(revealIcon.current);
      if (reduceMotion) swipe.setValue(0);
      else Animated.timing(swipe, { toValue: width.current, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    } else if (reduceMotion) swipe.setValue(0);
    else Animated.spring(swipe, { toValue: 0, overshootClamping: true, bounciness: 0, useNativeDriver: false }).start();
  };

  const ghostLook: ViewStyle | null = ghost
    ? {
        opacity: 1,
        transform: [{ scale: 1.02 }],
        shadowColor: "#000",
        shadowOpacity: 0.28,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
      }
    : null;

  return (
    <Animated.View
      style={animating ? { height: collapse.interpolate({ inputRange: [0, 1], outputRange: [0, box] }), overflow: "hidden" } : undefined}
    >
    <Animated.View
      ref={ghost ? undefined : (node) => drag.nodeRef(node as unknown as View | null)}
      onLayout={({ nativeEvent }) => {
        width.current = nativeEvent.layout.width;
        setBox((current) => (animating && current > 0 ? current : nativeEvent.layout.height + 10));
      }}
      pointerEvents={ghost ? "none" : "auto"}
      style={[
        {
          backgroundColor: ground,
          borderWidth: 1,
          borderColor: edge,
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: ghost ? 0 : 10,
          // A lifted card leaves its place held but undrawn: its copy is in the drag layer.
          opacity: drag.hidden ? 0 : fade,
          transform: [
            { translateX: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
            { translateY: shift },
          ],
        },
        ghostLook,
      ]}
      onPointerEnter={() => setOverCard(true)}
      onPointerLeave={() => setOverCard(false)}
    >
      <DragCard
        style={{ position: "relative" }}
        mouse={ghost ? false : drag.mouse}
        armed={ghost ? false : drag.armed}
        onStart={drag.onStart}
        onMove={drag.onMove}
        onEnd={drag.onEnd}
        swipeable={!ghost}
        onSwipe={(dx) => swipe.setValue(Math.max(0, dx))}
        onSwipeEnd={onSwipeEnd}
      >
        {/* Behind the content: the green the swipe reveals, with its check on the left. */}
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, justifyContent: "center", paddingLeft: 16, backgroundColor: mix(base, colors.statusSuccess, 0.22) }}
        >
          <View ref={revealIcon} style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
            <Icon name="CircleCheck" size={18} color={colors.statusSuccess} />
          </View>
        </View>
        <Animated.View style={{ backgroundColor: ground, transform: [{ translateX: swipe }] }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${todo.title}`}
          accessibilityState={{ expanded }}
          onPress={guard(onExpand)}
          onLongPress={drag.mouse || ghost ? undefined : drag.arm}
          delayLongPress={350}
          onPressOut={drag.release}
          style={{ paddingHorizontal: 14, paddingVertical: 16 }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text style={[styles.title, { flex: 1, minWidth: 0 }]}>{todo.title}</Text>
            {/* The cluster, centered on the title's first line (22px against a 20px line): the status
                pill, then the expand chevron at the far right when there is something to reveal. The title wraps before it. */}
            <View style={{ marginTop: -1, flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <StatusPill theme={theme} status={status} neutral={plain} onMenu={guard(onMenu)} />
              {todo.steps.length > 0 ? (
                <Hover>
                  {(over) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={expanded ? "Hide steps" : "Show steps"}
                      accessibilityState={{ expanded }}
                      onPress={guard(onExpand)}
                      style={[
                        { width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: over ? tint(colors.foreground, 0.07, colors.surface2) : "transparent" },
                        POINTER,
                      ]}
                    >
                      <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size={14} color={over ? colors.foreground : colors.foregroundMuted} />
                    </Pressable>
                  )}
                </Hover>
              ) : null}
            </View>
          </View>
          {todo.why ? <Text style={styles.why}>Why: {todo.why}</Text> : null}
          {todo.links.length > 0 ? (
            <View style={styles.chips}>
              {todo.links.map((link) => {
                const { host, path } = describeLink(link.url);
                return (
                  <Hover key={link.url} style={styles.chipBox}>
                    {(over) => (
                      <Pressable
                        accessibilityRole="link"
                        accessibilityLabel={link.url}
                        onPress={guard(() => onLink(link.url))}
                        style={[styles.chip, { borderColor: edge }, over && styles.chipHover]}
                      >
                        <View style={styles.chipText}>
                          {/* Always the real host and path: a label from the agent never stands in for where a link goes. */}
                          <Text style={styles.host}>{host}</Text>
                          {path ? <Text style={styles.path}>{path}</Text> : null}
                        </View>
                        <Icon name="ArrowUpRight" size={11} color={over ? colors.foreground : colors.foregroundMuted} />
                      </Pressable>
                    )}
                  </Hover>
                );
              })}
            </View>
          ) : null}
          {expanded && todo.steps.length > 0 ? (
            <View style={styles.steps}>
              {todo.steps.map((step, index) => (
                <View key={index} style={styles.step}>
                  <Text style={[styles.stepMarker, todo.listStyle === "numbers" ? styles.numberMarker : styles.bulletMarker]}>
                    {todo.listStyle === "numbers" ? `${index + 1}.` : "\u2022"}
                  </Text>
                  <Text style={styles.stepText}>{step.text}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
        {todo.tags.length > 0 ? (
          <View style={[styles.labelsRow, { borderTopColor: edge }]}>
            {todo.tags.map((tag) => (
              <TagChip key={tag} theme={theme} name={tag} registry={registry} />
            ))}
          </View>
        ) : null}
        <View style={[styles.timeRow, { borderTopColor: edge }]}>
          {/* The arrow, the time and the chat's name are the only jump target. */}
          <Hover onChange={setOverJump}>
            {() => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Jump to chat"
                accessibilityHint={fullWhen(todo)}
                onPress={guard(onJump)}
                style={[styles.jump, POINTER]}
                {...({ title: fullWhen(todo) } as object)}
              >
                <Icon name="CornerUpLeft" size={12} color={overJump ? colors.foreground : colors.foregroundMuted} />
                <Text style={[styles.time, overJump && styles.timeHover]}>{whenOf(todo)}</Text>
                {meta ? <ChatName theme={theme} agentId={meta.agentId} fallback={meta.fallback} /> : null}
              </Pressable>
            )}
          </Hover>
          <Hover>
            {(over) => (
              <Pressable
                ref={tagButton}
                accessibilityRole="button"
                accessibilityLabel="Tags"
                onPress={guard(() => onLabels(tagButton.current))}
                style={[styles.tagButton, over && { backgroundColor: tint(colors.foreground, 0.07, colors.surface2) }]}
              >
                <Icon name="Hash" size={13} color={over ? colors.foreground : colors.foregroundMuted} />
              </Pressable>
            )}
          </Hover>
        </View>
        </Animated.View>
      </DragCard>
    </Animated.View>
    </Animated.View>
  );
}

/** The chat's name, muted, kept current with the chat's own title. */
function ChatName({ theme, agentId, fallback }: { theme: PluginTheme; agentId: string; fallback: string | null }) {
  const title = useAgent(agentId, (agent) => agent.title);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1, minWidth: 0, opacity: 0.6 }}>
      <Text style={{ flexShrink: 1, color: theme.colors.foregroundMuted, fontSize: 11.5 }}>
        {title ?? fallback ?? "Untitled chat"}
      </Text>
    </View>
  );
}
