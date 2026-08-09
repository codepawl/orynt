export const PROBABILITY_LOADER_FRAMES = [
  "♚",
  "♛",
  "♜",
  "♝",
  "♞",
  "♟",
  "♠",
  "♣",
  "♥",
  "♦",
] as const;

const PROBABILITY_LOADER_FRAME_MS = 100;

export function ProbabilityLoader({ className }: { className?: string }) {
  const classes = ["probability-loader", className].filter(Boolean).join(" ");
  return (
    <span className={classes} aria-hidden="true">
      {PROBABILITY_LOADER_FRAMES.map((frame, index) => (
        <span
          className="probability-loader-frame"
          key={frame}
          style={{ animationDelay: `${index * PROBABILITY_LOADER_FRAME_MS}ms` }}
        >
          {frame}
        </span>
      ))}
    </span>
  );
}
