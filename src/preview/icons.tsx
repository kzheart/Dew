import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number; weight?: number };

function Svg({ size = 14, weight = 1.9, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const Chevron = (p: IconProps) => <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>;
export const Calendar = (p: IconProps) => <Svg size={12} weight={2} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>;
export const Person = (p: IconProps) => <Svg size={12} weight={2} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></Svg>;
export const Hash = (p: IconProps) => <Svg {...p}><path d="M5 9h14M5 15h14M10 3L8 21M16 3l-2 18" /></Svg>;
export const Expand = (p: IconProps) => <Svg {...p}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>;
export const Check = (p: IconProps) => <Svg weight={2.2} {...p}><path d="M5 12l5 5 9-10" /></Svg>;
export const CopyIcon = (p: IconProps) => <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Svg>;

/** Icons of the callout variants, after GitHub's alerts. */
export const calloutIcons: Record<string, ReactNode> = {
  note: <Svg size={15} weight={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>,
  tip: <Svg size={15} weight={2}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.6 1 2.5h6c0-.9.2-1.7 1-2.5A6 6 0 0 0 12 3z" /></Svg>,
  important: <Svg size={15} weight={2}><path d="M4 4h16v12H8l-4 4z" /><path d="M12 7v4M12 13.5h.01" /></Svg>,
  warning: <Svg size={15} weight={2}><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17h.01" /></Svg>,
  caution: <Svg size={15} weight={2}><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /><path d="M12 8v5M12 16h.01" /></Svg>,
};
