import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";

const COUNT = 36;
const DURATION = 1300;
/** Gravity in the same units as the launch speed, over the burst's unit of time. */
const GRAVITY = 520;

interface Piece {
  vx: number;
  vy: number;
  width: number;
  height: number;
  spin: number;
  color: number;
}

function pieces(): Piece[] {
  return Array.from({ length: COUNT }, (_, at) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95;
    const speed = 180 + Math.random() * 260;
    return {
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      width: 5 + Math.random() * 4,
      height: 3 + Math.random() * 3,
      spin: (Math.random() - 0.5) * 900,
      color: at,
    };
  });
}

const STOPS = [0, 0.2, 0.4, 0.6, 0.8, 1];

/**
 * A burst of paper from a point, drawn with Animated Views so it works off the web too. Each piece
 * follows its own arc: the arc is sampled at a few stops and the animation runs between them.
 */
export function Burst({ x, y, colors, onDone }: { x: number; y: number; colors: readonly string[]; onDone: () => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const set = useMemo(pieces, []);

  useEffect(() => {
    const run = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== "web",
    });
    run.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => run.stop();
  }, [progress, onDone]);

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: x, top: y, width: 0, height: 0 }}>
      {set.map((piece, at) => {
        const seconds = DURATION / 1000;
        const time = (stop: number) => stop * seconds;
        return (
          <Animated.View
            key={at}
            style={{
              position: "absolute",
              width: piece.width,
              height: piece.height,
              borderRadius: 1,
              backgroundColor: colors[piece.color % colors.length],
              opacity: progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0] }),
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: STOPS,
                    outputRange: STOPS.map((stop) => piece.vx * time(stop) * 0.9),
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: STOPS,
                    outputRange: STOPS.map((stop) => piece.vy * time(stop) * 0.9 + 0.5 * GRAVITY * time(stop) ** 2),
                  }),
                },
                {
                  rotate: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", `${piece.spin}deg`],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
