import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { SERIES_COLORS } from '../lib/format.js'
import { similarity } from '../lib/scoring.js'

// Short axis labels so they fit around the radar; the table uses full labels.
const SHORT_LABELS = {
  terrain: 'Terrain',
  aridity: 'Aridity',
  temp: 'Temperature',
  temp_range: 'Temp. swing',
  veg: 'Bare ground',
  geology: 'Geology',
  ice: 'Ground ice',
}

/**
 * One series per site: similarity to the target per criterion (0–100%).
 * Criteria with missing data for any compared site are NOT plotted (a missing
 * value must never be drawn as 0) — they are listed under the chart instead.
 */
export default function RadarCompare({ sites, target, features }) {
  const simOf = (f, s) => similarity(f, s.norm[f.id], target.norm[f.id])
  const plotted = features.filter((f) => sites.every((s) => simOf(f, s) !== null))
  const skipped = features.filter((f) => !plotted.includes(f))

  const data = plotted.map((f) => ({
    criterion: SHORT_LABELS[f.id] || f.label,
    ...Object.fromEntries(sites.map((s) => [s.id, Math.round(simOf(f, s) * 100)])),
  }))

  return (
    <figure className="radar">
      {plotted.length >= 3 ? (
        <ResponsiveContainer width="100%" height={380}>
          <RadarChart data={data} outerRadius="68%" margin={{ top: 8, right: 36, bottom: 8, left: 36 }}>
            <PolarGrid stroke="#3a3d48" />
            <PolarAngleAxis dataKey="criterion" tick={{ fill: '#c3c2b7', fontSize: 12 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tickCount={5} tick={{ fill: '#9aa0b0', fontSize: 10 }} axisLine={false} />
            {sites.map((s, i) => (
              <Radar
                key={s.id}
                name={s.name}
                dataKey={s.id}
                stroke={SERIES_COLORS[i]}
                fill={SERIES_COLORS[i]}
                fillOpacity={0.1}
                strokeWidth={2}
                dot={{ r: 4, fill: SERIES_COLORS[i], stroke: '#181b24', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              formatter={(v) => `${v}% similar`}
              contentStyle={{ background: '#181b24', border: '1px solid #2a2e3a', borderRadius: 6 }}
              labelStyle={{ color: '#e8e9ee' }}
              itemStyle={{ color: '#e8e9ee' }}
            />
            <Legend wrapperStyle={{ color: '#e8e9ee', fontSize: 13 }} />
          </RadarChart>
        </ResponsiveContainer>
      ) : (
        <p className="empty">Not enough criteria with data for every site to draw a radar chart — see the table below.</p>
      )}
      <figcaption className="hint">
        Similarity to {target.name} per criterion (100% = identical on the normalised scale). Weights change the overall
        score, not these values.
        {skipped.length > 0 && (
          <>
            {' '}
            <strong>Not plotted (data pending for at least one site):</strong>{' '}
            {skipped
              .map((f) => {
                const missing = sites.filter((s) => simOf(f, s) === null).map((s) => s.name)
                return `${f.label} (${missing.join(', ')})`
              })
              .join('; ')}
            .
          </>
        )}
      </figcaption>
    </figure>
  )
}
