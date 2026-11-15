// Inline stroke icons (24 × 24, 1.75 px stroke, currentColor). Drawn for this app: no icon
// library is added. Decorative by default (aria-hidden); the text beside each icon names it.

function Svg({ children, size = 24, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Discover: a planet with an orbit. */
export const IconDiscover = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="5" />
    <ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-22 12 12)" />
  </Svg>
)

/** Explore map: folded map. */
export const IconMap = (p) => (
  <Svg {...p}>
    <path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z" />
    <path d="M8.5 4v13.5M15.5 6.5V20" />
  </Svg>
)

/** Planetary Mirror: two half-discs facing each other across a line. */
export const IconMirror = (p) => (
  <Svg {...p}>
    <path d="M10 5a7 7 0 0 0 0 14z" />
    <path d="M14 5a7 7 0 0 1 0 14" />
    <path d="M12 3v18" strokeDasharray="2 2.5" />
  </Svg>
)

/** Compare: three bars of different height. */
export const IconCompare = (p) => (
  <Svg {...p}>
    <rect x="3.5" y="10" width="4" height="10" rx="1" />
    <rect x="10" y="4" width="4" height="16" rx="1" />
    <rect x="16.5" y="13" width="4" height="7" rx="1" />
  </Svg>
)

/** Scientific data: stacked dataset layers. */
export const IconData = (p) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
    <path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
    <path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
  </Svg>
)

/** Methodology: an open book. */
export const IconMethod = (p) => (
  <Svg {...p}>
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" />
    <path d="M12 6.5v13" />
  </Svg>
)

export const IconMenu = (p) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

/** Dataset indicator: a document with a check. */
export const IconDataset = (p) => (
  <Svg {...p}>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4" />
    <path d="m9.5 14 2 2 3.5-4" />
  </Svg>
)

/** Analysis: a pulse line over a frame. */
export const IconAnalysis = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M6 14h3l2-5 2.5 8 2-4H18" />
  </Svg>
)

/** Terrain: a ridge line. */
export const IconTerrain = (p) => (
  <Svg {...p}>
    <path d="m2.5 19 6-9 4 6 3-4 6 7z" />
  </Svg>
)

/** Ranked list. */
export const IconList = (p) => (
  <Svg {...p}>
    <path d="M10 6h10M10 12h10M10 18h10" />
    <circle cx="5" cy="6" r="1.4" />
    <circle cx="5" cy="12" r="1.4" />
    <circle cx="5" cy="18" r="1.4" />
  </Svg>
)

/** Evidence: a magnifier. */
export const IconEvidence = (p) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5.5 5.5M7.5 10.5h6" />
  </Svg>
)

export const IconSliders = (p) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="8" cy="17" r="2" />
  </Svg>
)
