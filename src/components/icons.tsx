// Original line icons drawn for this app in the style of iOS system icons.
// (Apple's SF Symbols are licensed for Apple-platform apps, so they are not used here.)
import { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  cross: <path d="M12 3.5v17M6 9h12" />,
  plus: <path d="M12 5v14M5 12h14" />,
  arrowUp: <path d="M12 19.5v-15M5.5 11 12 4.5 18.5 11" />,
  arrowDown: <path d="M12 4.5v15M5.5 13 12 19.5 18.5 13" />,
  minus: <path d="M5 12h14" />,
  home: <path d="M4 11.5 12 4l8 7.5M6.5 9.5V20h4v-5.5h3V20h4V9.5" />,
  checklist: <><path d="m4 6.5 1.6 1.6L8.5 5M4 12.5l1.6 1.6 2.9-3.1M4 18.5l1.6 1.6 2.9-3.1" /><path d="M12 7h8M12 13h8M12 19h8" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6" /><path d="M16 4.8a3.4 3.4 0 0 1 0 6.4M18 14.4c2 .7 3.2 2.6 3.5 5.6" /></>,
  bubble: <path d="M12 4c-4.7 0-8.5 3.2-8.5 7.2 0 2.3 1.3 4.3 3.2 5.6-.1 1.2-.6 2.4-1.4 3.2 1.8-.1 3.4-.8 4.5-1.8.9.2 1.8.3 2.7.3 4.7 0 8.5-3.2 8.5-7.3S16.7 4 12 4Z" />,
  more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  chart: <path d="M4 19 9.5 12l4 3.5L20 6M20 6h-4.5M20 6v4.5" />,
  flame: <path d="M12 3c.5 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2.5 1.2-4 2.3-5.2.3 1.7 1 2.7 2 3.2-.4-3.5.2-6.5 1.2-9Z" />,
  cap: <><path d="m2.5 9.5 9.5-4.5 9.5 4.5-9.5 4.5-9.5-4.5Z" /><path d="M6.5 12v4.5c1.5 1.5 3.3 2 5.5 2s4-.5 5.5-2V12M21.5 9.5V15" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8" /></>,
  seal: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12.3 2.8 2.7L16 9.5" /></>,
  hourglass: <path d="M7 3.5h10M7 20.5h10M8 3.5v3.2c0 1.8 4 3.8 4 5.3s-4 3.5-4 5.3v3.2M16 3.5v3.2c0 1.8-4 3.8-4 5.3s4 3.5 4 5.3v3.2" />,
  doc: <><path d="M6.5 3.5h7.5l4 4v13h-11.5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14 3.5v4h4M9 12.5h6M9 16h6" /></>,
  bars: <path d="M5 20v-6M12 20V5M19 20v-10" />,
  share: <><path d="M12 15V3.5M8 7l4-3.5L16 7" /><path d="M7.5 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.3l3.5 2" /></>,
  chevronLeft: <path d="M15 4.5 7.5 12l7.5 7.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  signout: <path d="M14 4H7a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 7 20h7M16 8l4 4-4 4M20 12H10" />,
};

export function Icon({ name, size = 24, stroke = 1.8 }: { name: string; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
