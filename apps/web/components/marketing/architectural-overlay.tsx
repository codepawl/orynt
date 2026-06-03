type ArchitecturalOverlayProps = {
  className?: string;
};

export function ArchitecturalOverlay({
  className = "",
}: ArchitecturalOverlayProps) {
  return (
    <div
      className={`pointer-events-none absolute hidden select-none md:block ${className}`}
      aria-hidden="true"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 520 560"
        fill="none"
        focusable="false"
      >
        <rect
          x="34"
          y="42"
          width="188"
          height="188"
          className="stroke-ink-4"
          strokeWidth="4"
        />
        <rect
          x="286"
          y="22"
          width="168"
          height="104"
          className="stroke-ink-4"
          strokeWidth="4"
        />
        <rect
          x="110"
          y="282"
          width="116"
          height="180"
          className="stroke-ink-4"
          strokeWidth="4"
        />
        <rect
          x="322"
          y="252"
          width="132"
          height="132"
          className="stroke-ink-4"
          strokeWidth="4"
        />
        <rect
          x="252"
          y="438"
          width="214"
          height="62"
          className="stroke-ink-4"
          strokeWidth="4"
        />
        <rect
          x="56"
          y="248"
          width="328"
          height="14"
          className="fill-ratchet"
        />
      </svg>
    </div>
  );
}
