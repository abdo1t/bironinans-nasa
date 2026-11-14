// One-line verdicts for the Compare page. Display only; scores come from scoring.js.
import { pct, describeSiteValue } from './format.js'
import { scoreRangeText } from './explain.js'
import { similarity } from './scoring.js'

/**
 * Verdict lines for 2–3 compared sites.
 *  - Best overall (with its score range when missing data could move it).
 *  - A warning when another site's range overlaps the best site's range.
 *  - The top-weighted criterion that has data for at least one compared site
 *    (criteria with no data for every compared site are skipped and named).
 */
export function compareVerdict(sites, target, features, weights, rankBySite) {
  const lines = []
  const entry = (s) => rankBySite[s.id]
  const scored = sites.filter((s) => entry(s)?.score !== null && entry(s)?.score !== undefined)

  if (scored.length === 0) {
    lines.push('None of these sites can be scored yet — data pending.')
  } else {
    const best = Math.max(...scored.map((s) => entry(s).score))
    const winners = scored.filter((s) => entry(s).score === best)
    if (winners.length > 1) {
      lines.push(`Best overall: ${winners.map((s) => s.name).join(' and ')} tie on ${best}.`)
    } else {
      const w = winners[0]
      const range = scoreRangeText(best, entry(w).scoreRange)
      lines.push(
        range
          ? `Best overall: ${w.name} (${best}/100; ${range} if its missing criteria were a total mismatch or a perfect match).`
          : `Best overall: ${w.name} (${best}/100).`,
      )
      const lo = entry(w).scoreRange?.[0] ?? best
      const rivals = scored.filter((s) => s !== w && (entry(s).scoreRange?.[1] ?? entry(s).score) >= lo)
      if (rivals.length) {
        lines.push(
          `Not settled: ${rivals.map((s) => s.name).join(' and ')} could match or beat it once missing data are filled.`,
        )
      }
    }
  }

  const selected = features.filter((f) => (weights[f.id] || 0) > 0)
  const withData = []
  const noData = []
  for (const f of selected) {
    const vals = sites
      .map((s) => ({ s, v: similarity(f, s.norm[f.id], target.norm[f.id]) }))
      .filter((x) => x.v !== null)
    ;(vals.length ? withData : noData).push({ f, vals })
  }
  if (withData.length) {
    const topWeight = Math.max(...withData.map(({ f }) => weights[f.id]))
    for (const { f, vals } of withData.filter(({ f }) => weights[f.id] === topWeight)) {
      const max = Math.max(...vals.map((x) => x.v))
      if (max === 0) {
        lines.push(`${f.label} (weight ${topWeight}): none of these sites matches the target.`)
        continue
      }
      const best = vals.filter((x) => x.v === max)
      const detail = best
        .map((x) => {
          const t = describeSiteValue(f, x.s).text
          return t ? `${x.s.name} (${t})` : x.s.name
        })
        .join(' and ')
      lines.push(`${f.label} (weight ${topWeight}): ${detail} closest (${pct(max)} similar).`)
    }
  }
  if (noData.length) {
    const isMissingValue = (v) => v === null || v === undefined || v === ''
    const targetSide = noData.filter(({ f }) => isMissingValue(target.norm[f.id]))
    const siteSide = noData.filter(({ f }) => !isMissingValue(target.norm[f.id]))
    if (targetSide.length) {
      lines.push(`Not compared — no verified target value: ${targetSide.map(({ f }) => f.label).join(', ')}.`)
    }
    if (siteSide.length) {
      lines.push(`Not compared — no data for these sites: ${siteSide.map(({ f }) => f.label).join(', ')}.`)
    }
  }
  return lines
}
