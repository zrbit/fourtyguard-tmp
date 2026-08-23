import type { ReactElement, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
};

export function ImperviousIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="14" width="4" height="7" />
      <rect x="10" y="9" width="4" height="12" />
      <rect x="17" y="4" width="4" height="17" />
    </svg>
  );
}

export function CanopyIcon(props: IconProps) {
  return (
    <svg {...base} strokeLinejoin="round" {...props}>
      <path d="M12 3l4 6h-2.5l3.5 5.5H14L12 21l-2-6.5H7l3.5-5.5H8z" />
    </svg>
  );
}

export function WindIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8h11a3 3 0 1 0-3-3" />
      <path d="M3 14h15a3 3 0 1 1-3 3" />
    </svg>
  );
}

export function GeometryIcon(props: IconProps) {
  return (
    <svg {...base} strokeLinejoin="round" {...props}>
      <rect x="4" y="10" width="6" height="10" />
      <rect x="14" y="5" width="6" height="15" />
    </svg>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <svg {...base} strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}

export function ThermometerIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 2v13M9 9l3 3 3-3" />
      <circle cx="12" cy="19" r="3" />
    </svg>
  );
}

export const HYPOTHESIS_ICON: Record<string, (p: IconProps) => ReactElement> = {
  "h-impervious": ImperviousIcon,
  "h-canopy": CanopyIcon,
  "h-wind": WindIcon,
  "h-density": GeometryIcon,
};
