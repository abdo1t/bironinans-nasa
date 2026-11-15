/**
 * Decorative planet artwork (procedural SVG drawn for this app — no imagery, no data).
 * Both worlds are always rendered and stacked; the current one fades in (CSS crossfade,
 * styles/theme.css), so switching Moon ↔ Mars never flashes an empty frame.
 *
 * It is ILLUSTRATION ONLY. Scientific terrain images (shaded relief from elevation data)
 * are shown elsewhere in framed, captioned panels with their source and scale.
 */

const CRATERS = [
  [356, 168, 26],
  [214, 412, 34],
  [402, 352, 18],
  [168, 206, 14],
  [312, 444, 12],
  [430, 252, 11],
  [260, 120, 9],
  [128, 360, 10],
]

function Moon() {
  return (
    <svg viewBox="0 0 600 600" className="planet-art__svg" focusable="false">
      <defs>
        <radialGradient id="pa-moon-body" cx="36%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#f3f6fa" />
          <stop offset="38%" stopColor="#c3cad3" />
          <stop offset="70%" stopColor="#7c8592" />
          <stop offset="100%" stopColor="#2a313c" />
        </radialGradient>
        <radialGradient id="pa-moon-shade" cx="30%" cy="28%" r="82%">
          <stop offset="48%" stopColor="#020610" stopOpacity="0" />
          <stop offset="86%" stopColor="#020610" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#020610" stopOpacity="0.95" />
        </radialGradient>
        <radialGradient id="pa-crater" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#4a525e" stopOpacity="0.55" />
          <stop offset="75%" stopColor="#5d6672" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#e9eef4" stopOpacity="0.35" />
        </radialGradient>
        <filter id="pa-moon-tex" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="7" />
          <feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.22  0 0 0 0 0.26  0 0 0 0.9 -0.28" />
        </filter>
        <filter id="pa-soft">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <clipPath id="pa-moon-clip">
          <circle cx="300" cy="300" r="250" />
        </clipPath>
      </defs>
      <circle cx="300" cy="300" r="250" fill="url(#pa-moon-body)" />
      <g clipPath="url(#pa-moon-clip)">
        <rect x="50" y="50" width="500" height="500" filter="url(#pa-moon-tex)" opacity="0.55" />
        {/* maria: dark basalt plains */}
        <g fill="#56606d" opacity="0.42" filter="url(#pa-soft)">
          <ellipse cx="248" cy="232" rx="78" ry="54" />
          <ellipse cx="338" cy="262" rx="52" ry="40" />
          <ellipse cx="292" cy="338" rx="64" ry="36" />
          <ellipse cx="190" cy="318" rx="38" ry="46" />
        </g>
        {CRATERS.map(([x, y, r]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r={r} fill="url(#pa-crater)" />
            <circle cx={x - r * 0.12} cy={y - r * 0.12} r={r} fill="none" stroke="#f4f7fb" strokeOpacity="0.28" strokeWidth="1.5" />
          </g>
        ))}
        <circle cx="300" cy="300" r="250" fill="url(#pa-moon-shade)" />
      </g>
      <circle cx="300" cy="300" r="250.5" fill="none" stroke="#9feaf7" strokeOpacity="0.32" strokeWidth="1.5" />
    </svg>
  )
}

function Mars() {
  return (
    <svg viewBox="0 0 600 600" className="planet-art__svg" focusable="false">
      <defs>
        <radialGradient id="pa-mars-body" cx="36%" cy="32%" r="78%">
          <stop offset="0%" stopColor="#f6b27a" />
          <stop offset="36%" stopColor="#d9783f" />
          <stop offset="70%" stopColor="#97401c" />
          <stop offset="100%" stopColor="#3a1307" />
        </radialGradient>
        <radialGradient id="pa-mars-shade" cx="30%" cy="28%" r="82%">
          <stop offset="48%" stopColor="#0a0302" stopOpacity="0" />
          <stop offset="86%" stopColor="#0a0302" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#0a0302" stopOpacity="0.95" />
        </radialGradient>
        <filter id="pa-mars-tex" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.02" numOctaves="5" seed="11" />
          <feColorMatrix values="0 0 0 0 0.32  0 0 0 0 0.11  0 0 0 0 0.04  0 0 0 1.1 -0.36" />
        </filter>
        <filter id="pa-mars-soft">
          <feGaussianBlur stdDeviation="12" />
        </filter>
        <clipPath id="pa-mars-clip">
          <circle cx="300" cy="300" r="250" />
        </clipPath>
      </defs>
      <circle cx="300" cy="300" r="250" fill="url(#pa-mars-body)" />
      <g clipPath="url(#pa-mars-clip)">
        <rect x="50" y="50" width="500" height="500" filter="url(#pa-mars-tex)" opacity="0.75" />
        {/* dark albedo regions */}
        <g fill="#5a210c" opacity="0.5" filter="url(#pa-mars-soft)">
          <path d="M150 300 C 190 250, 260 268, 300 300 S 400 330, 450 300 L 455 340 C 400 372, 330 350, 290 338 S 190 350, 150 340 Z" />
          <ellipse cx="350" cy="230" rx="44" ry="20" />
          <ellipse cx="220" cy="390" rx="58" ry="22" />
        </g>
        <path
          d="M200 262 C 250 250, 300 256, 362 248"
          stroke="#4a1a08"
          strokeOpacity="0.55"
          strokeWidth="5"
          fill="none"
          filter="url(#pa-mars-soft)"
        />
        {/* north polar cap */}
        <ellipse cx="292" cy="66" rx="70" ry="22" fill="#fff4ea" opacity="0.78" filter="url(#pa-mars-soft)" />
        <circle cx="300" cy="300" r="250" fill="url(#pa-mars-shade)" />
      </g>
      <circle cx="300" cy="300" r="250.5" fill="none" stroke="#ffc58a" strokeOpacity="0.38" strokeWidth="1.5" />
    </svg>
  )
}

export default function PlanetArt({ world, className = '' }) {
  const current = world === 'mars' ? 'mars' : 'moon'
  return (
    <div className={`planet-art planet-art--${current} ${className}`.trim()} aria-hidden="true">
      <div className={`planet-art__layer planet-art__layer--moon${current === 'moon' ? ' is-on' : ''}`}>
        <Moon />
      </div>
      <div className={`planet-art__layer planet-art__layer--mars${current === 'mars' ? ' is-on' : ''}`}>
        <Mars />
      </div>
    </div>
  )
}
