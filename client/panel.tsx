import {
  openExternalUrl,
  useAgent,
  useRpc,
  useSettings,
  useSubscription,
  type PluginScreenProps,
  type PluginWorkspacePanelProps,
  useWorkspaces,
} from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { cleanTags, tagKey, type RegisteredTag, type TagHue } from "../shared/tags";
import {
  addComment,
  addTodo,
  clearTodos,
  createLabel,
  firstStatus,
  normalizeStatuses,
  paseoLabels,
  removeComment,
  reorderTodos,
  resolveStatus,
  setStatus,
  setTags,
  statusIcon,
  todoSettings,
  watchTodos,
  viewOf,
  type Group,
  type Sort,
  type Status,
  type Todo,
} from "../shared/todos";
import { TodoCard, type CardDrag } from "./card";
import { NewTodoZone, type NewTodoValues } from "./compose";
import { Burst } from "./confetti";
import { useCurrentChat, useTodoData } from "./data";
import { StatusEditor } from "./forms";
import { LabelsMenu, MenuLayer, type MenuOption, type MenuState } from "./menu";
import { sortTodos } from "./order";
import { Hover, Segmented, StatusPill, statusInk, tint } from "./parts";
import { SettingsPopover } from "./settings";
import { fingerOnWeb, holdSelection, revealMessage } from "./web";

type Scope = "chat" | "all";

const defaults = todoSettings.schema.parse({});

function makeStyles(theme: PluginTheme) {
  const { colors } = theme;
  return {
    root: { flex: 1, backgroundColor: colors.surface0 },
    head: {
      height: 44,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 6,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    acts: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
    },
    iconButton: {
      width: 28,
      height: 28,
      borderRadius: 7,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    iconHover: {
      backgroundColor: tint(colors.foreground, 0.07, colors.surface2),
    },
    list: { paddingTop: 12, paddingHorizontal: 12 },
    group: { marginTop: 4 },
    groupText: { color: colors.foregroundMuted, fontSize: 12 },
    done: { paddingTop: 4, paddingHorizontal: 12 },
    groupBar: { paddingHorizontal: 12 },
    groupHead: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      height: 32,
      paddingHorizontal: 4,
      borderRadius: 6,
    },
    groupTextHover: { color: colors.foreground },
    doneRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      minHeight: 32,
      paddingVertical: 2,
      paddingLeft: 0,
      paddingRight: 0,
    },
    doneTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.foregroundMuted,
      fontSize: 12.5,
      lineHeight: 20,
      textDecorationLine: "line-through" as const,
    },
    told: { color: colors.foregroundMuted, fontSize: 11, lineHeight: 20 },
    empty: {
      alignItems: "center" as const,
      gap: 10,
      paddingVertical: 28,
      paddingHorizontal: 32,
    },
    emptyText: {
      color: colors.foregroundMuted,
      fontSize: 12.5,
      lineHeight: 19,
      textAlign: "center" as const,
    },
    foot: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footText: { color: colors.foregroundMuted, fontSize: 11.5, lineHeight: 16 },
  };
}

type Styles = ReturnType<typeof makeStyles>;

function IconButton({
  styles,
  theme,
  icon,
  label,
  active = false,
  disabled = false,
  large = false,
  onPress,
}: {
  styles: Styles;
  theme: PluginTheme;
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  large?: boolean;
  onPress(node: View | null): void;
}) {
  const node = useRef<View>(null);
  return (
    <Hover>
      {(hovered) => (
        <Pressable
          ref={node}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: active, disabled }}
          disabled={disabled}
          onPress={() => onPress(node.current)}
          style={[
            styles.iconButton,
            large && { width: 40, height: 40, borderRadius: 10 },
            (hovered || active) && styles.iconHover,
            disabled && { opacity: 0.4 },
          ]}
        >
          <Icon
            name={icon}
            size={large ? 20 : 16}
            color={
              hovered || active
                ? theme.colors.foreground
                : theme.colors.foregroundMuted
            }
          />
        </Pressable>
      )}
    </Hover>
  );
}

/** Whether each chat's group is folded in All chats. Module-level, so it survives a tab switch but not a reload. */
const folded = new Map<string, boolean>();
/** Whether a group is folded: what the user chose, else its default (closing statuses start folded). */
const isFolded = (key: string, byDefault = false) => folded.get(key) ?? byDefault;

/**
 * The row above a group of todos: a chevron, a name, a count. The whole row folds the group, and
 * hovering it changes the name's color and nothing else.
 */
function GroupHeader({
  styles,
  theme,
  name,
  icon,
  count,
  open,
  strong = false,
  onPress,
}: {
  styles: Styles;
  theme: PluginTheme;
  name: string;
  /** A status heading's icon, in the status color. */
  icon?: { name: string; color: string };
  count: number;
  open: boolean;
  /** A repo's heading, set above its chats' headings. */
  strong?: boolean;
  onPress(): void;
}) {
  return (
    <View style={styles.groupBar}>
      <Hover>
        {(hovered) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}, ${count}`}
            accessibilityState={{ expanded: open }}
            onPress={onPress}
            style={[styles.groupHead, strong && { height: 40 }]}
          >
            <Icon
              name={open ? "ChevronDown" : "ChevronRight"}
              size={13}
              color={theme.colors.foregroundMuted}
            />
            {icon ? <Icon name={icon.name} size={14} color={icon.color} /> : null}
            <Text
              style={[
                styles.groupText,
                { flexShrink: 1 },
                strong && { color: theme.colors.foreground, fontSize: 16, fontWeight: "600" as const },
                hovered && styles.groupTextHover,
              ]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text style={[styles.groupText, { flexShrink: 0 }]}>· {count}</Text>
          </Pressable>
        )}
      </Hover>
    </View>
  );
}

/** A chat's name over its todos in All chats, kept current with the chat's own title. */
function ChatHead({
  styles,
  theme,
  agentId,
  fallback,
  count,
  open,
  onPress,
}: {
  styles: Styles;
  theme: PluginTheme;
  agentId: string;
  fallback: string | null;
  count: number;
  open: boolean;
  onPress(): void;
}) {
  const title = useAgent(agentId, (agent) => agent.title);
  return (
    <GroupHeader
      styles={styles}
      theme={theme}
      name={title ?? fallback ?? "Untitled chat"}
      count={count}
      open={open}
      onPress={onPress}
    />
  );
}

/** A closed todo in the Done group: its status icon reopens it, and its chevron opens the status menu. */
function DoneRow({
  styles,
  theme,
  todo,
  status,
  onMenu,
}: {
  styles: Styles;
  theme: PluginTheme;
  todo: Todo;
  status: Status;
  onMenu(anchor: View | null): void;
}) {
  return (
    <View style={styles.doneRow}>
      <Text style={styles.doneTitle}>{todo.title}</Text>
      <StatusPill theme={theme} status={status} neutral={false} onMenu={onMenu} />
    </View>
  );
}

const SORT_LABELS: Record<Exclude<Sort, "status">, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  manual: "Manual",
};
const GROUP_LABELS: Record<Group, string> = { chat: "Chat", status: "Status" };
/** Below this width the scope tabs can't show both labels, so the unselected one shrinks to its count. */
const TABS_FULL_WIDTH = 150;

/** Room between two cards in a list, which the drag layout adds back wherever it works out positions. */
const GAP = 10;
const COMPACT_GAP = 18;

/** Paseo's phone header row (`HEADER_INNER_HEIGHT_MOBILE`): the screen's buttons are drawn into its empty right end. */
const PHONE_HEADER = 56;

/** The fade under the list's top edge: strips of the background, solid at the top and gone at the bottom. */
const FADE_STEPS = 8;
const FADE_STEP = 2;

/** What a card in no drag is told. */
const NO_DRAG: CardDrag = {
  hidden: false,
  active: false,
  offset: 0,
  armed: false,
  mouse: false,
  nodeRef: () => {},
  arm: () => {},
  release: () => {},
  onStart: () => {},
  onMove: () => {},
  onEnd: () => {},
  swiped: () => {},
};

/** The drag in progress, once its cards are measured. Everything else about it lives in refs. */
interface Lifted {
  id: string;
  group: readonly string[];
  /** The card's height, which is also the placeholder's. */
  height: number;
  /** Where the card started, from the top of the scroll content. */
  top: number;
  /** The slot it would drop into now. Changing this is the only thing that re-renders a drag. */
  target: number;
}

/** Measurements for one drag, in window coordinates, kept out of state so a pointer move costs no render. */
interface Session {
  id: string;
  group: readonly string[];
  frames: Map<string, { y: number; height: number }>;
  contentY: number;
  /** How far the card may move up and down and stay inside its group. */
  min: number;
  max: number;
  ready: boolean;
}

/** The repo a todo belongs to: its workspace's project, keyed so two repos with one name stay apart. */
type RepoOf = (workspaceId: string | null) => { key: string; title: string };

/** What the all-repos screen narrows its list to: a todo must hold one of the statuses and one of the labels chosen. */
interface Narrow {
  statuses: ReadonlySet<string>;
  labels: ReadonlySet<string>;
}
const NOT_NARROWED: Narrow = { statuses: new Set(), labels: new Set() };

/** Every repo's workspaces, grouped by project, for the all-repos screen. */
const BY_PROJECT = {
  groupBy: (workspace: { projectId: string; projectDisplayName: string }) => ({
    key: workspace.projectId,
    title: workspace.projectDisplayName,
  }),
};

export function TodoPanel({ theme, workspaceId, navigation, layout }: PluginWorkspacePanelProps) {
  return <Todos theme={theme} workspaceId={workspaceId} navigation={navigation} compact={layout.compact} />;
}

/** The screen opened from the sidebar: every todo in every repo, repo over chat over cards. */
export function AllTodosScreen({ theme, navigation, layout }: PluginScreenProps) {
  const projects = useWorkspaces(BY_PROJECT);
  const repoOf = useCallback<RepoOf>(
    (workspaceId) => {
      const found = workspaceId ? projects.find((project) => project.items.some((ref) => ref.id === workspaceId)) : undefined;
      return found ? { key: found.key, title: found.title ?? "Untitled repo" } : { key: "other", title: "Other" };
    },
    [projects],
  );
  return <Todos theme={theme} workspaceId={null} navigation={navigation} repoOf={repoOf} compact={layout.compact} />;
}

/**
 * The list itself. With a `workspaceId` it is the workspace's panel; with none it is the screen
 * that reads every workspace's todos, which has no Current tab, no new-todo button, and a filter.
 */
function Todos({
  theme,
  workspaceId,
  navigation,
  repoOf,
  compact,
}: {
  theme: PluginTheme;
  workspaceId: string | null;
  navigation: PluginWorkspacePanelProps["navigation"];
  repoOf?: RepoOf;
  /** A phone: bigger, wider-spaced buttons, and more room between cards for a finger. */
  compact: boolean;
}) {
  const everywhere = workspaceId === null;
  const gap = compact ? COMPACT_GAP : GAP;
  // The list has scrolled, so cards fade out under its top edge.
  const [scrolled, setScrolled] = useState(false);
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { data, failed, patch, reorder, refresh } = useTodoData(workspaceId);
  const currentChat = useCurrentChat();
  const chat = everywhere ? null : currentChat;
  const settings = useSettings(todoSettings);
  const values = settings.status === "ready" ? settings.values : defaults;
  const statuses = useMemo(() => normalizeStatuses(values.statuses), [values.statuses]);
  const readPaseo = useRpc(paseoLabels);
  /** Paseo's own workspace labels, read from its file: read-only here. */
  const [paseoTags, setPaseoTags] = useState<RegisteredTag[]>([]);
  useEffect(() => {
    void readPaseo({}).then((result) => setPaseoTags(result.labels), () => {});
  }, [readPaseo]);
  useSubscription(watchTodos, {}, (event) => {
    if (event.kind === "labels") void readPaseo({}).then((result) => setPaseoTags(result.labels), () => {});
  });
  /** The labels made from this panel, with the color each was given. */
  const ownTags = values.tags;
  /**
   * Every label to offer: exactly Paseo's, so a label deleted in Paseo is gone here too. A label made
   * here still wears the color it was given while Paseo shows its default violet, since the plugin
   * cannot set a color in Paseo.
   */
  const registry = useMemo(() => {
    const own = new Map(ownTags.map((tag) => [tagKey(tag.name), tag]));
    return paseoTags.map((tag) => {
      const mine = own.get(tagKey(tag.name));
      return mine && tag.color === "violet" ? { ...tag, color: mine.color } : tag;
    });
  }, [paseoTags, ownTags]);
  const makeLabel = useRpc(createLabel);
  const changeStatus = useRpc(setStatus);
  const changeTags = useRpc(setTags);
  const addNote = useRpc(addComment);
  const dropNote = useRpc(removeComment);
  const clear = useRpc(clearTodos);
  const add = useRpc(addTodo);
  const saveOrder = useRpc(reorderTodos);

  const [chosenScope, setScope] = useState<Scope>("chat");
  const scope: Scope = everywhere ? "all" : chosenScope;
  const [narrow, setNarrow] = useState<Narrow>(NOT_NARROWED);
  const narrowed = narrow.statuses.size > 0 || narrow.labels.size > 0;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusesOpen, setStatusesOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  /** What the composer has chosen outside its own fields: its starting status and its tags. */
  const [draft, setDraft] = useState<{ statusId: string | null; tags: string[] }>({ statusId: null, tags: [] });
  useEffect(() => {
    if (!composing) setDraft({ statusId: null, tags: [] });
  }, [composing]);
  const [doneOpen, setDoneOpen] = useState(false);
  const [, setFoldEpoch] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  /** Cards that were just closed: they stay in the list while they fade, then fold into Done. */
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  /** Cards just reopened from Done, which grow into the list. */
  const [entering, setEntering] = useState<ReadonlySet<string>>(new Set());
  const [bursts, setBursts] = useState<{ key: number; x: number; y: number }[]>([]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [labels, setLabels] = useState<{ id: string; rect: MenuState["rect"] } | null>(null);
  const [tabsWidth, setTabsWidth] = useState(Number.POSITIVE_INFINITY);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const root = useRef<View>(null);
  const content = useRef<View>(null);
  const overlay = useRef<View>(null);
  const burstKey = useRef(0);

  // Dragging. A mouse drags past a small threshold, a touch after a long press. The card being
  // dragged is drawn as a copy in a layer above the list, moved only by an Animated.Value, and its
  // place is held by an outlined placeholder that slides to the slot it would drop into. State
  // changes only when that slot does.
  const mouse = Platform.OS === "web" && !fingerOnWeb();
  /** The status a card was in when it started to leave, so it stays in its section while it fades. */
  const leftFrom = useRef(new Map<string, string>());
  const nodes = useRef(new Map<string, View>());
  const session = useRef<Session | null>(null);
  const travel = useRef(0);
  const slot = useRef(-1);
  const lastDrag = useRef(0);
  const dragY = useRef(new Animated.Value(0)).current;
  const placeholderY = useRef(new Animated.Value(0)).current;
  const [lifted, setLifted] = useState<Lifted | null>(null);
  const [armed, setArmed] = useState<string | null>(null);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  const save = (change: Partial<typeof values>) => {
    if (settings.status === "ready")
      void settings.save({ ...settings.values, ...change }, settings.revision);
  };

  const todos = useMemo(() => data?.todos ?? [], [data]);
  const inScope = (todo: { agentId: string }) => scope === "all" || todo.agentId === chat;
  const isOpen = (todo: Todo) => todo.status === "open" && !todo.closed;
  const passes = (todo: Todo) =>
    (narrow.statuses.size === 0 || narrow.statuses.has(resolveStatus(statuses, todo.statusId).id)) &&
    (narrow.labels.size === 0 || todo.tags.some((tag) => narrow.labels.has(tagKey(tag))));
  const view = viewOf(values);
  const open = sortTodos(
    todos.filter((todo) => (isOpen(todo) || leaving.has(todo.id)) && inScope(todo) && passes(todo)),
    view.sort,
    statuses,
  );
  const done = sortTodos(
    todos.filter((todo) => !isOpen(todo) && !leaving.has(todo.id) && inScope(todo) && passes(todo)),
    view.sort === "oldest" ? "oldest" : "newest",
    statuses,
  );
  const thisChatCount = todos.filter((todo) => isOpen(todo) && todo.agentId === chat).length;
  const allCount = todos.filter(isOpen).length;
  const waiting = (data?.pending ?? []).filter(inScope);
  const soonest = waiting.length ? Math.min(...waiting.map((item) => item.left)) : 0;
  const plainStatus = firstStatus(statuses, false);
  const closingStatus = firstStatus(statuses, true);
  /** Swiping left: CANCEL, or else the last closing status, the opposite end from DONE. */
  const cancelStatus = statuses.find((status) => status.id === "cancel") ?? [...statuses].reverse().find((status) => status.closes) ?? closingStatus;

  const expand = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** Finds `node` in the panel's own coordinates, to hang a menu from. */
  const placeAt = (node: View | null, place: (rect: MenuState["rect"]) => void) => {
    if (!node || !root.current) return;
    node.measureInWindow((x, y, width, height) => {
      root.current?.measureInWindow((originX, originY) => {
        place({ x: x - originX, y: y - originY, width, height });
      });
    });
  };
  const openMenu = (node: View | null, options: readonly MenuOption[], align: "start" | "end" = "end") =>
    placeAt(node, (rect) => setMenu({ rect, options, align }));

  /** Sets a todo's status. Closing one fades it out, pops confetti from `origin`, and files it under Done. */
  const choose = useCallback(
    (todo: Todo, next: Status, origin: View | null) => {
      if (next.id === todo.statusId) return;
      if (next.closes && !todo.closed) {
        if (
          values.confetti &&
          !reduceMotion &&
          origin &&
          overlay.current &&
          next.id === firstStatus(statuses, true).id
        ) {
          origin.measureInWindow((x, y, width, height) => {
            overlay.current?.measureInWindow((originX, originY) => {
              setBursts((current) => [
                ...current,
                { key: ++burstKey.current, x: x - originX + width / 2, y: y - originY + height / 2 },
              ]);
            });
          });
        }
        leftFrom.current.set(todo.id, todo.statusId);
        setLeaving((current) => new Set(current).add(todo.id));
        setTimeout(() => {
          setLeaving((current) => {
            const copy = new Set(current);
            copy.delete(todo.id);
            return copy;
          });
          setExpanded((current) => {
            const copy = new Set(current);
            copy.delete(todo.id);
            return copy;
          });
        }, reduceMotion ? 0 : 520);
      }
      if (!next.closes && todo.closed) {
        setEntering((current) => new Set(current).add(todo.id));
        setTimeout(
          () =>
            setEntering((current) => {
              const copy = new Set(current);
              copy.delete(todo.id);
              return copy;
            }),
          800,
        );
      }
      patch(todo.id, (current) => ({ ...current, statusId: next.id, closed: next.closes, told: false }));
      void changeStatus({ id: todo.id, statusId: next.id }).catch(() => void refresh());
    },
    [values.confetti, reduceMotion, statuses, patch, changeStatus, refresh],
  );

  const statusMenu = (todo: Todo, anchor: View | null) =>
    openMenu(
      anchor,
      statuses.map((status) => ({
        key: status.id,
        label: status.label,
        selected: status.id === todo.statusId,
        icon: { name: statusIcon(status), color: statusInk(theme, status.color) },
        onSelect: () => choose(todo, status, anchor),
      })),
      "end",
    );


  const flip = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };
  /** The all-repos screen's filter: Paseo's labels are one list for every repo, so one list is offered. */
  const filterOptions: MenuOption[] = [
    ...(narrowed ? [{ key: "clear", label: "Clear filter", onSelect: () => setNarrow(NOT_NARROWED) }] : []),
    ...statuses.map((status, at) => ({
      key: `status-${status.id}`,
      label: status.label,
      heading: at === 0 ? "Status" : undefined,
      divider: at === 0 && narrowed,
      selected: narrow.statuses.has(status.id),
      icon: { name: statusIcon(status), color: statusInk(theme, status.color) },
      onSelect: () => setNarrow((current) => ({ ...current, statuses: flip(current.statuses, status.id) })),
    })),
    ...registry.map((tag, at) => ({
      key: `label-${tag.name}`,
      label: tag.name,
      heading: at === 0 ? "Label" : undefined,
      divider: at === 0,
      selected: narrow.labels.has(tagKey(tag.name)),
      onSelect: () => setNarrow((current) => ({ ...current, labels: flip(current.labels, tagKey(tag.name)) })),
    })),
  ];

  const comment = (todo: Todo, text: string) => {
    void addNote({ id: todo.id, text })
      .then(({ comment: saved }) => {
        if (!saved) return void refresh();
        patch(todo.id, (current) =>
          current.comments.some((item) => item.id === saved.id)
            ? current
            : { ...current, comments: [...current.comments, saved] },
        );
      })
      .catch(() => void refresh());
  };

  const uncomment = (todo: Todo, commentId: string) => {
    patch(todo.id, (current) => ({ ...current, comments: current.comments.filter((item) => item.id !== commentId) }));
    void dropNote({ id: todo.id, commentId }).catch(() => void refresh());
  };

  const editTags = (todo: Todo, tags: string[]) => {
    patch(todo.id, (current) => ({ ...current, tags }));
    void changeTags({ id: todo.id, tags }).catch(() => void refresh());
  };

  const labelled = labels
    ? labels.id === "new"
      ? ({ id: "new", tags: draft.tags } as Pick<Todo, "id" | "tags">)
      : todos.find((todo) => todo.id === labels.id)
    : undefined;

  /** Changes the tags of a todo, or of the todo being written. */
  const retag = (target: Pick<Todo, "id" | "tags">, tags: string[]) => {
    if (target.id === "new") setDraft((current) => ({ ...current, tags }));
    else editTags(target as Todo, tags);
  };

  /** The labels of a todo that are on offer: the rest stay in the store and are never shown. */
  const isKnown = (tag: string) => registry.some((label) => tagKey(label.name) === tagKey(tag));

  const toggleTag = (todo: Pick<Todo, "id" | "tags">, name: string) => {
    const shown = todo.tags.filter(isKnown);
    const kept = todo.tags.filter((tag) => !isKnown(tag));
    const on = shown.some((tag) => tagKey(tag) === tagKey(name));
    // Shown labels first, so a limit on tags never drops one the user just picked.
    retag(todo, [...(on ? shown.filter((tag) => tagKey(tag) !== tagKey(name)) : [...shown, name]), ...kept]);
  };

  /** Makes the label in Paseo, records the chosen color here, and puts it on the todo. */
  const createTag = async (todo: Pick<Todo, "id" | "tags">, raw: string, color: TagHue) => {
    const known = registry.find((tag) => tagKey(tag.name) === tagKey(raw));
    let name = known?.name ?? null;
    if (!known) {
      // The label is made through the todo's own workspace, or through this panel's for a todo still being written.
      const home = ("workspaceId" in todo ? (todo as Todo).workspaceId : null) ?? workspaceId;
      if (!home) return;
      const result = await makeLabel({ workspaceId: home, name: raw }).catch(() => null);
      name = result?.name ?? null;
      if (!name) return;
      if (!ownTags.some((tag) => tagKey(tag.name) === tagKey(name!))) save({ tags: [...ownTags, { name, color }] });
    }
    if (!todo.tags.some((tag) => tagKey(tag) === tagKey(name!))) {
      const shown = todo.tags.filter(isKnown);
      retag(todo, [...cleanTags([...shown, name!]), ...todo.tags.filter((tag) => !isKnown(tag))]);
    }
  };

  const clearAll = () => {
    const filter = everywhere
      ? { all: true }
      : scope === "all"
        ? { workspaceId: workspaceId! }
        : chat
          ? { agentId: chat }
          : null;
    if (!filter) return;
    void clear(filter).then(refresh, () => void refresh());
  };

  const jump = (todo: Todo) => {
    if (todo.agentId !== chat) navigation?.openAgent({ agentId: todo.agentId });
    const ids = [
      todo.messageId,
      todo.turnId && todo.callId ? `agent_tool_turn:${todo.turnId}/${encodeURIComponent(todo.callId)}` : null,
    ].filter((id): id is string => id !== null);
    if (ids.length)
      void revealMessage(ids, tint(theme.colors.statusSuccess, 0.18, theme.colors.surface2));
  };

  const create = async (input: NewTodoValues) => {
    if (!chat || !workspaceId) return "No chat is open.";
    const result = await add({
      agentId: chat,
      workspaceId,
      chatTitle: null,
      title: input.title,
      why: input.why,
      steps: input.steps,
      listStyle: input.listStyle,
      links: input.links,
      tags: input.tags,
      statusId: input.statusId,
    });
    if (!result.ok) return result.error ?? "Could not add the todo.";
    setComposing(false);
    void refresh();
    return null;
  };

  // ---- dragging ----------------------------------------------------------------------

  /** A press that ends a drag is also a click on the web, so presses just after one do nothing. */
  const guard =
    <Args extends unknown[]>(run: (...args: Args) => void) =>
    (...args: Args) => {
      if (Date.now() - lastDrag.current < 300) return;
      run(...args);
    };

  const clamp = (dy: number) => {
    const s = session.current;
    return s ? Math.max(s.min, Math.min(s.max, dy)) : dy;
  };

  /**
   * The slot the dragged card is over. Moving down it passes a neighbor when its bottom edge goes
   * past that neighbor's center, moving up when its top edge does, so a card dragged to the end of
   * its group always reaches the last slot, whatever size its neighbors are.
   */
  const landing = (dy: number) => {
    const s = session.current;
    const mine = s?.frames.get(s.id);
    if (!s || !mine) return -1;
    const from = s.group.indexOf(s.id);
    const top = mine.y + dy;
    const bottom = top + mine.height;
    let at = from;
    s.group.forEach((key, index) => {
      const frame = s.frames.get(key);
      if (!frame || key === s.id) return;
      const center = frame.y + frame.height / 2;
      if (index > from && bottom > center) at++;
      if (index < from && top < center) at--;
    });
    return at;
  };

  /** Where each card of the group sits, from the top of the first, once the dragged one is in slot `to`. */
  const arranged = (to: number) => {
    const s = session.current;
    if (!s) return new Map<string, number>();
    const order = s.group.filter((key) => key !== s.id);
    order.splice(to, 0, s.id);
    const tops = new Map<string, number>();
    let y = s.frames.get(s.group[0]!)!.y;
    for (const key of order) {
      tops.set(key, y);
      y += (s.frames.get(key)?.height ?? 0) + gap;
    }
    return tops;
  };

  /** How far a card sits from its place while the group makes room, from the slot the drag is in. */
  const offsetOf = (id: string) => {
    const s = session.current;
    if (!lifted || !s || !lifted.group.includes(id) || id === lifted.id) return 0;
    return (arranged(lifted.target).get(id) ?? 0) - (s.frames.get(id)?.y ?? 0);
  };

  // The placeholder follows the slot, animated; the drag layer's copy follows the pointer directly.
  const placeholderTop = (to: number) => {
    const s = session.current;
    return s ? (arranged(to).get(s.id) ?? 0) - s.contentY : 0;
  };
  useEffect(() => {
    if (!lifted) return;
    const run = Animated.timing(placeholderY, {
      toValue: placeholderTop(lifted.target),
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifted?.id, lifted?.target]);

  const beginDrag = (id: string, group: readonly string[]) => {
    holdSelection(true);
    travel.current = 0;
    slot.current = -1;
    dragY.setValue(0);
    const s: Session = { id, group, frames: new Map(), contentY: 0, min: 0, max: 0, ready: false };
    session.current = s;
    let waiting = group.length + 1;
    const measured = () => {
      if (--waiting > 0 || session.current !== s) return;
      const mine = s.frames.get(id);
      const first = s.frames.get(group[0]!);
      const last = s.frames.get(group[group.length - 1]!);
      if (!mine || !first || !last) {
        session.current = null;
        holdSelection(false);
        return;
      }
      s.min = first.y - mine.y;
      s.max = last.y + last.height - (mine.y + mine.height);
      s.ready = true;
      const from = group.indexOf(id);
      slot.current = from;
      const top = mine.y - s.contentY;
      placeholderY.setValue(top);
      dragY.setValue(clamp(travel.current));
      setLifted({ id, group, height: mine.height, top, target: from });
      // The pointer may already have moved on while the cards were measured.
      const now = landing(clamp(travel.current));
      if (now >= 0 && now !== from) {
        slot.current = now;
        setLifted((current) => (current ? { ...current, target: now } : current));
      }
    };
    content.current?.measureInWindow((_x, y) => {
      s.contentY = y;
      measured();
    });
    for (const key of group) {
      nodes.current.get(key)?.measureInWindow((_x, y, _width, height) => {
        s.frames.set(key, { y, height });
        measured();
      });
    }
  };

  const moveDrag = (dy: number) => {
    travel.current = dy;
    const s = session.current;
    if (!s?.ready) return;
    const clamped = clamp(dy);
    dragY.setValue(clamped);
    const to = landing(clamped);
    if (to >= 0 && to !== slot.current) {
      slot.current = to;
      setLifted((current) => (current ? { ...current, target: to } : current));
    }
  };

  const endDrag = (agentId: string, dy: number) => {
    lastDrag.current = Date.now();
    setArmed(null);
    const s = session.current;
    if (!s?.ready) {
      session.current = null;
      holdSelection(false);
      return;
    }
    const to = Math.max(0, landing(clamp(dy)));
    const from = s.group.indexOf(s.id);
    const spot = placeholderTop(to) - (s.frames.get(s.id)!.y - s.contentY);
    if (to !== slot.current) {
      slot.current = to;
      setLifted((current) => (current ? { ...current, target: to } : current));
    }
    // The copy settles into the placeholder, and only then does the list take the new order.
    Animated.timing(dragY, {
      toValue: spot,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      lastDrag.current = Date.now();
      holdSelection(false);
      if (to !== from) {
        const moved = [...s.group];
        moved.splice(from, 1);
        moved.splice(to, 0, s.id);
        // Manual order is kept per chat, so a section that mixes chats saves this chat's cards only.
        const ids = moved.filter((id) => todos.find((todo) => todo.id === id)?.agentId === agentId);
        reorder(agentId, ids);
        save({ sort: "manual", group: view.group });
        void saveOrder({ agentId, ids }).then(refresh, () => void refresh());
      }
      session.current = null;
      setLifted(null);
    });
  };

  const dragFor = (todo: Todo, group: readonly string[]): CardDrag => ({
    hidden: lifted?.id === todo.id,
    active: lifted !== null && lifted.group.includes(todo.id),
    offset: offsetOf(todo.id),
    armed: armed === todo.id,
    mouse,
    nodeRef: (node) => {
      if (node) nodes.current.set(todo.id, node);
      else nodes.current.delete(todo.id);
    },
    arm: () => setArmed(todo.id),
    release: () => setArmed((current) => (session.current ? current : current === todo.id ? null : current)),
    onStart: () => beginDrag(todo.id, group),
    onMove: moveDrag,
    onEnd: (dy) => endDrag(todo.agentId, dy),
    swiped: () => {
      lastDrag.current = Date.now();
    },
  });

  const card = (todo: Todo, group: readonly string[], ghost = false) => (
    <TodoCard
      key={todo.id}
      theme={theme}
      gap={gap}
      todo={todo}
      status={resolveStatus(statuses, todo.statusId)}
      plain={resolveStatus(statuses, todo.statusId).id === plainStatus.id}
      registry={registry}
      meta={scope === "all" && view.group === "status" ? { agentId: todo.agentId, fallback: todo.chatTitle } : undefined}
      expanded={expanded.has(todo.id)}
      leaving={leaving.has(todo.id)}
      entering={entering.has(todo.id)}
      reduceMotion={reduceMotion}
      drag={ghost ? NO_DRAG : dragFor(todo, group)}
      ghost={ghost}
      guard={guard}
      onExpand={() => expand(todo.id)}
      onOpen={() => setExpanded((current) => new Set(current).add(todo.id))}
      onComment={(text) => comment(todo, text)}
      onUncomment={(commentId) => uncomment(todo, commentId)}
      onDone={(origin) => choose(todo, closingStatus, origin)}
      onCancel={() => choose(todo, cancelStatus, null)}
      onLink={(url) => void openExternalUrl(url).catch(() => {})}
      onJump={() => jump(todo)}
      onMenu={(anchor) => statusMenu(todo, anchor)}
      onLabels={(button) => placeAt(button, (rect) => setLabels({ id: todo.id, rect }))}
    />
  );

  // Grouped by status: open statuses first, closing ones last, in the status list's order. A card
  // that is fading out stays in the section it left until it is gone.
  const sectionStatuses = [...statuses.filter((item) => !item.closes), ...statuses.filter((item) => item.closes)];
  const effectiveId = (todo: Todo) =>
    resolveStatus(statuses, leaving.has(todo.id) ? (leftFrom.current.get(todo.id) ?? todo.statusId) : todo.statusId).id;
  const sectionsOf = (openTodos: readonly Todo[], doneTodos: readonly Todo[]) =>
    sectionStatuses
      .map((item) => ({
        status: item,
        items: item.closes
          ? doneTodos.filter((todo) => todo.status === "open" && resolveStatus(statuses, todo.statusId).id === item.id)
          : openTodos.filter((todo) => effectiveId(todo) === item.id),
      }))
      .filter((section) => section.items.length > 0);
  const toggleFold = (key: string, currentlyOpen: boolean) => {
    folded.set(key, currentlyOpen);
    setFoldEpoch((epoch) => epoch + 1);
  };

  const statusSections = (list: ReturnType<typeof sectionsOf>, prefix: string) =>
    list.map(({ status: item, items }) => {
      const key = `${prefix}status:${item.id}`;
      const shown = !isFolded(key, item.closes);
      const ids = items.map((todo) => todo.id);
      return (
        <View key={key} style={styles.group}>
          <GroupHeader
            styles={styles}
            theme={theme}
            name={item.label}
            icon={{ name: statusIcon(item), color: statusInk(theme, item.color) }}
            count={items.length}
            open={shown}
            onPress={() => toggleFold(key, shown)}
          />
          {!shown ? null : item.closes ? (
            <View style={styles.done}>
              {items.map((todo) => (
                <DoneRow
                  key={todo.id}
                  styles={styles}
                  theme={theme}
                  todo={todo}
                  status={resolveStatus(statuses, todo.statusId)}
                  onMenu={(anchor) => statusMenu(todo, anchor)}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.list, { paddingTop: 4 }]}>{items.map((todo) => card(todo, ids))}</View>
          )}
        </View>
      );
    });

  const actions = (
    <View style={[styles.acts, compact && { gap: 10 }]}>
      {everywhere ? (
        <IconButton
          styles={styles}
          theme={theme}
          icon="ListFilter"
          label="Filter"
          large={compact}
          active={narrowed}
          onPress={(node) => openMenu(node, filterOptions)}
        />
      ) : (
        <IconButton
          styles={styles}
          theme={theme}
          icon="Plus"
          label="New todo"
          large={compact}
          active={composing}
          disabled={!chat}
          onPress={() => setComposing((on) => !on)}
        />
      )}
      <IconButton
        styles={styles}
        theme={theme}
        icon="Settings2"
        label={`Sort: ${SORT_LABELS[view.sort]}`}
          large={compact}
        onPress={(node) =>
          openMenu(node, [
            ...(Object.keys(GROUP_LABELS) as Group[]).map((key, at) => ({
              key: `group-${key}`,
              label: GROUP_LABELS[key],
              heading: at === 0 ? "Group by" : undefined,
              selected: key === view.group,
              onSelect: () => save({ group: key, sort: view.sort }),
            })),
            ...(Object.keys(SORT_LABELS) as Exclude<Sort, "status">[]).map((key, at) => ({
              key: `sort-${key}`,
              label: SORT_LABELS[key],
              heading: at === 0 ? "Sort" : undefined,
              divider: at === 0,
              selected: key === view.sort,
              onSelect: () => save({ sort: key, group: view.group }),
            })),
          ])
        }
      />
      <IconButton
        styles={styles}
        theme={theme}
        icon="Settings"
        label="Panel settings"
          large={compact}
        onPress={() => setSettingsOpen((on) => !on)}
      />
    </View>
  );
  const groups = scope === "all" ? [...new Set(open.map((todo) => todo.agentId))] : [];
  // The screen's repo layer: each repo's chats, in the order the sort first meets them.
  const repos = new Map<string, { title: string; todos: Todo[]; agents: string[] }>();
  if (repoOf) {
    for (const todo of view.group === "status" ? [...open, ...done] : open) {
      const { key, title } = repoOf(todo.workspaceId);
      const repo = repos.get(key) ?? { title, todos: [], agents: [] };
      repo.todos.push(todo);
      if (!repo.agents.includes(todo.agentId)) repo.agents.push(todo.agentId);
      repos.set(key, repo);
    }
  }
  const chatSection = (agentId: string) => {
    const items = open.filter((todo) => todo.agentId === agentId);
    const ids = items.map((todo) => todo.id);
    return (
      <View key={agentId} style={styles.group}>
        <ChatHead
          styles={styles}
          theme={theme}
          agentId={agentId}
          fallback={items[0]?.chatTitle ?? null}
          count={items.length}
          open={!folded.get(agentId)}
          onPress={() => {
            folded.set(agentId, !folded.get(agentId));
            setFoldEpoch((epoch) => epoch + 1);
          }}
        />
        {folded.get(agentId) ? null : (
          <View style={[styles.list, { paddingTop: 4 }]}>{items.map((todo) => card(todo, ids))}</View>
        )}
      </View>
    );
  };
  const repoLevel = [...repos].map(([key, repo]) => {
    const repoKey = `repo:${key}`;
    const shown = !isFolded(repoKey);
    return (
      <View key={repoKey} style={styles.group}>
        <GroupHeader
          styles={styles}
          theme={theme}
          name={repo.title}
          count={repo.todos.length}
          open={shown}
          strong
          onPress={() => toggleFold(repoKey, shown)}
        />
        {!shown
          ? null
          : view.group === "status"
            ? statusSections(
                sectionsOf(
                  open.filter((todo) => repo.todos.includes(todo)),
                  done.filter((todo) => repo.todos.includes(todo)),
                ),
                `${repoKey}:`,
              )
            : repo.agents.map(chatSection)}
      </View>
    );
  });
  const empty = data !== null && open.length === 0 && done.length === 0 && !composing;
  const chatIds = open.map((todo) => todo.id);
  const liftedTodo = lifted ? todos.find((todo) => todo.id === lifted.id) : undefined;

  return (
    <View
      ref={root}
      style={styles.root}
      onLayout={({ nativeEvent }) =>
        setBounds({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })
      }
    >
      {everywhere ? (
        // A phone draws the buttons into Paseo's header row, below; elsewhere they keep a row of their own.
        compact ? null : <View style={[styles.head, { justifyContent: "flex-end", borderBottomWidth: 0 }]}>{actions}</View>
      ) : (
        <View style={styles.head}>
          <Segmented<Scope>
            theme={theme}
            height={26}
            compact={tabsWidth < TABS_FULL_WIDTH}
            onLayout={(event) => setTabsWidth(event.nativeEvent.layout.width)}
            style={{ flex: 1, minWidth: 0 }}
            value={scope}
            onChange={setScope}
            items={[
              { key: "chat", label: "Current", count: thisChatCount },
              { key: "all", label: "All", count: allCount },
            ]}
          />
          {actions}
        </View>
      )}
      <>
          <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 12 }}
            scrollEnabled={armed === null && lifted === null}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              const next = nativeEvent.contentOffset.y > 0;
              if (next !== scrolled) setScrolled(next);
            }}
          >
            <View ref={content} style={{ position: "relative" }}>
              <View style={{ paddingHorizontal: 12 }}>
                <NewTodoZone
                  theme={theme}
                  open={composing}
                  status={resolveStatus(statuses, draft.statusId ?? plainStatus.id)}
                  plain={resolveStatus(statuses, draft.statusId ?? plainStatus.id).id === plainStatus.id}
                  registry={registry}
                  tags={draft.tags}
                  onStatus={(anchor) =>
                    openMenu(
                      anchor,
                      statuses.map((item) => ({
                        key: item.id,
                        label: item.label,
                        selected: item.id === (draft.statusId ?? plainStatus.id),
                        icon: { name: statusIcon(item), color: statusInk(theme, item.color) },
                        onSelect: () => setDraft((current) => ({ ...current, statusId: item.id })),
                      })),
                      "end",
                    )
                  }
                  onLabels={(button) => placeAt(button, (rect) => setLabels({ id: "new", rect }))}
                  onSubmit={create}
                  onCancel={() => setComposing(false)}
                />
              </View>
              {data === null ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>
                    {failed ? "Could not read your todos." : ""}
                  </Text>
                </View>
              ) : empty ? (
                <View style={styles.empty}>
                  <Icon name="UserRound" size={20} color={theme.colors.foregroundMuted} />
                </View>
              ) : repoOf ? (
                repoLevel
              ) : view.group === "status" ? (
                statusSections(sectionsOf(open, done), "")
              ) : scope === "all" ? (
                groups.map(chatSection)
              ) : (
                <View style={[styles.list, composing && { paddingTop: 0 }]}>
                  {open.map((todo) => card(todo, chatIds))}
                </View>
              )}
              {view.group === "chat" && done.length > 0 ? (
                <View style={styles.done}>
                  <View style={{ marginHorizontal: -12 }}>
                    <GroupHeader
                      styles={styles}
                      theme={theme}
                      name="Done"
                      count={done.length}
                      open={doneOpen}
                      onPress={() => setDoneOpen((on) => !on)}
                    />
                  </View>
                  {doneOpen
                    ? done.map((todo) => (
                        <DoneRow
                          key={todo.id}
                          styles={styles}
                          theme={theme}
                          todo={todo}
                          status={resolveStatus(statuses, todo.statusId)}
                          onMenu={(anchor) => statusMenu(todo, anchor)}
                        />
                      ))
                    : null}
                </View>
              ) : null}
              {/* The drag layer: above every card and header, so nothing draws over a lifted card. */}
              {lifted && liftedTodo ? (
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 60 }}
                >
                  <Animated.View
                    style={{
                      position: "absolute",
                      left: 12,
                      right: 12,
                      top: 0,
                      height: lifted.height,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderStyle: "dashed",
                      borderColor: tint(theme.colors.foregroundMuted, 0.7, theme.colors.border),
                      transform: [{ translateY: placeholderY }],
                    }}
                  />
                  <Animated.View
                    style={{
                      position: "absolute",
                      left: 12,
                      right: 12,
                      top: lifted.top,
                      zIndex: 2,
                      transform: [{ translateY: dragY }],
                    }}
                  >
                    {card(liftedTodo, lifted.group, true)}
                  </Animated.View>
                </View>
              ) : null}
            </View>
          </ScrollView>
          {scrolled ? (
            <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
              {Array.from({ length: FADE_STEPS }, (_, at) => (
                <View
                  key={at}
                  style={{ height: FADE_STEP, backgroundColor: theme.colors.surface0, opacity: 1 - at / FADE_STEPS }}
                />
              ))}
            </View>
          ) : null}
          </View>
          {waiting.length > 0 ? (
            <View style={styles.foot}>
              <Text style={styles.footText}>
                {waiting.length} more arriving after {soonest <= 1 ? "the next turn" : `${soonest} turns`}
              </Text>
            </View>
          ) : null}
        </>
      {everywhere && compact ? (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: -PHONE_HEADER, right: 8, height: PHONE_HEADER, flexDirection: "row", alignItems: "center" }}
        >
          {actions}
        </View>
      ) : null}
      {settingsOpen ? (
        <SettingsPopover
          theme={theme}
          values={values}
          saving={settings.saving}
          onChange={save}
          onClose={() => setSettingsOpen(false)}
          clearLabel={scope === "all" ? "all chats" : "this chat"}
          clearCount={open.length + done.length + waiting.length}
          onClear={clearAll}
          onEditStatuses={() => {
            setSettingsOpen(false);
            setStatusesOpen(true);
          }}
        />
      ) : null}
      {labels && labelled ? (
        <LabelsMenu
          theme={theme}
          rect={labels.rect}
          bounds={bounds}
          labels={registry}
          active={labelled.tags.filter(isKnown)}
          onToggle={(name) => toggleTag(labelled, name)}
          onCreate={(name, color) => void createTag(labelled, name, color)}
          onClose={() => setLabels(null)}
        />
      ) : null}
      {menu ? <MenuLayer theme={theme} state={menu} bounds={bounds} onClose={() => setMenu(null)} /> : null}
      <StatusEditor
        theme={theme}
        open={statusesOpen}
        statuses={statuses}
        saving={settings.saving}
        onSave={(next) => save({ statuses: next })}
        onClose={() => setStatusesOpen(false)}
      />
      <View
        ref={overlay}
        pointerEvents="none"
        style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 30 }}
      >
        {bursts.map((burst) => (
          <Burst
            key={burst.key}
            x={burst.x}
            y={burst.y}
            colors={[
              theme.colors.statusSuccess,
              theme.colors.statusWarning,
              theme.colors.statusDanger,
              theme.colors.accent,
              theme.colors.foregroundMuted,
            ]}
            onDone={() => setBursts((current) => current.filter((item) => item.key !== burst.key))}
          />
        ))}
      </View>
    </View>
  );
}
