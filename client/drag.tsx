import { useRef, type ReactNode } from "react";
import { PanResponder, View, type ViewProps } from "react-native";

/** How far the pointer moves before a press on a card becomes a drag, so a click is still a click. */
const THRESHOLD = 7;

interface DragCardProps extends ViewProps {
  children: ReactNode;
  /**
   * A mouse can drag a card by moving it past a small threshold. A finger cannot: the list under
   * it scrolls, so a touch drags only after a long press has armed the card.
   */
  mouse: boolean;
  armed: boolean;
  onStart(): void;
  /** How far the pointer has moved down (and right) since the card was picked up; negative is up (left). */
  onMove(dy: number, dx: number): void;
  onEnd(dy: number, dx: number): void;
  /** A swipe sideways is on: how far the pointer has moved right (negative: left) since it began. */
  onSwipe(dx: number): void;
  onSwipeEnd(dx: number): void;
  /** Whether this card can be swiped at all. */
  swipeable: boolean;
  /** A swipe that goes this far sideways turns into a drag, for cards that can be dropped in another column. */
  crossover?: number;
}

/**
 * A card that drags up and down. It claims the press in the capture phase, but only once the
 * pointer has clearly moved up or down (or the card was armed by a long press), so the clicks that
 * expand, tick and jump keep working. The responder is made once, so a drag survives the
 * re-renders it causes. PanResponder restarts `dy` at 0 when the card takes over mid-gesture,
 * which only costs the few pixels the pointer moved before it did.
 */
export function DragCard({ mouse, armed, onStart, onMove, onEnd, onSwipe, onSwipeEnd, swipeable, crossover = Infinity, children, ...view }: DragCardProps) {
  const latest = useRef({ mouse, armed, onStart, onMove, onEnd, onSwipe, onSwipeEnd, swipeable, crossover });
  latest.current = { mouse, armed, onStart, onMove, onEnd, onSwipe, onSwipeEnd, swipeable, crossover };
  // What the gesture turned out to be, decided by its first clear direction.
  const mode = useRef<"drag" | "swipe">("drag");
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) => {
        const l = latest.current;
        if (l.armed) {
          mode.current = "drag";
          return true;
        }
        // Mostly sideways is a swipe, with a mouse or a finger. Mostly vertical is a reorder drag.
        if (l.swipeable && Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
          mode.current = "swipe";
          return true;
        }
        if (l.mouse && Math.abs(dy) > THRESHOLD && Math.abs(dy) > Math.abs(dx)) {
          mode.current = "drag";
          return true;
        }
        return false;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (mode.current === "drag") latest.current.onStart();
      },
      onPanResponderMove: (_, { dx, dy }) => {
        if (mode.current === "swipe" && Math.abs(dx) > latest.current.crossover) {
          // Far enough sideways to be leaving the column: the card springs back and is carried instead.
          mode.current = "drag";
          latest.current.onSwipeEnd(0);
          latest.current.onStart();
        }
        if (mode.current === "swipe") latest.current.onSwipe(dx);
        else latest.current.onMove(dy, dx);
      },
      onPanResponderRelease: (_, { dx, dy }) => {
        if (mode.current === "swipe") latest.current.onSwipeEnd(dx);
        else latest.current.onEnd(dy, dx);
      },
      onPanResponderTerminate: (_, { dx, dy }) => {
        if (mode.current === "swipe") latest.current.onSwipeEnd(dx);
        else latest.current.onEnd(dy, dx);
      },
    }),
  ).current;
  return (
    <View {...view} {...responder.panHandlers}>
      {children}
    </View>
  );
}
