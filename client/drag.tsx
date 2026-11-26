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
  /** How far the pointer has moved down since the card was picked up; negative is up. */
  onMove(dy: number): void;
  onEnd(dy: number): void;
  /** A swipe to the right is on: how far the pointer has moved right since it began. */
  onSwipe(dx: number): void;
  onSwipeEnd(dx: number): void;
  /** Whether this card can be swiped at all. */
  swipeable: boolean;
}

/**
 * A card that drags up and down. It claims the press in the capture phase, but only once the
 * pointer has clearly moved up or down (or the card was armed by a long press), so the clicks that
 * expand, tick and jump keep working. The responder is made once, so a drag survives the
 * re-renders it causes. PanResponder restarts `dy` at 0 when the card takes over mid-gesture,
 * which only costs the few pixels the pointer moved before it did.
 */
export function DragCard({ mouse, armed, onStart, onMove, onEnd, onSwipe, onSwipeEnd, swipeable, children, ...view }: DragCardProps) {
  const latest = useRef({ mouse, armed, onStart, onMove, onEnd, onSwipe, onSwipeEnd, swipeable });
  latest.current = { mouse, armed, onStart, onMove, onEnd, onSwipe, onSwipeEnd, swipeable };
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
        // Mostly rightward is a swipe, with a mouse or a finger. Mostly vertical is a reorder drag.
        if (l.swipeable && dx > THRESHOLD && dx > Math.abs(dy)) {
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
        if (mode.current === "swipe") latest.current.onSwipe(dx);
        else latest.current.onMove(dy);
      },
      onPanResponderRelease: (_, { dx, dy }) => {
        if (mode.current === "swipe") latest.current.onSwipeEnd(dx);
        else latest.current.onEnd(dy);
      },
      onPanResponderTerminate: (_, { dx, dy }) => {
        if (mode.current === "swipe") latest.current.onSwipeEnd(dx);
        else latest.current.onEnd(dy);
      },
    }),
  ).current;
  return (
    <View {...view} {...responder.panHandlers}>
      {children}
    </View>
  );
}
