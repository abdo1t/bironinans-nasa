// Integrity rules for the static data bundle. Pure (no fetch/crypto) so it is unit-testable.
// The loader refuses to start the app if any rule fails, so a real build can
// never silently show — or mix in — synthetic (mock) values.

export const CONTRACT = 'eaf-bundle/2'
export const BUNDLE_FILES = ['features.json', 'targets.json', 'sites.geojson', 'scores.json']

const isMockLabel = (s) => typeof s === 'string' && s.startsWith('MOCK')

/**
 * @param manifest   parsed manifest.json
 * @param hashes     { file: sha256 hex } computed from the fetched bytes (or null to skip)
 * @param parsed     { features, targets, sites (GeoJSON), scores }
 * @param expectedKind 'real' | 'mock' (from the build mode)
 * @returns array of human-readable problems (empty = OK)
 */
export function checkBundle({ manifest, hashes, parsed, expectedKind }) {
  const problems = []
  if (!manifest || manifest.contract !== CONTRACT) problems.push(`manifest contract is not ${CONTRACT}`)
  if (manifest?.kind !== expectedKind) {
    problems.push(`bundle kind is "${manifest?.kind}" but this build expects "${expectedKind}"`)
  }
  if (hashes) {
    for (const f of BUNDLE_FILES) {
      if (manifest?.files?.[f] !== hashes[f]) problems.push(`${f} does not match manifest.json (hash mismatch)`)
    }
  }

  const { targets = [], sites, scores } = parsed
  const siteProps = sites?.features?.map((x) => x.properties) ?? []

  if (expectedKind === 'real') {
    if (scores?.generatedAt === 'MOCK') problems.push('scores.json is marked MOCK in a real build')
    for (const s of siteProps) {
      for (const [fid, src] of Object.entries(s.sources ?? {})) {
        if (isMockLabel(src) || isMockLabel(src?.dataset)) problems.push(`site ${s.id}: ${fid} has a MOCK source`)
      }
    }
    for (const t of targets) {
      for (const [fid, ref] of Object.entries(t.refs ?? {})) {
        if (isMockLabel(ref)) problems.push(`target ${t.id}: ${fid} has a MOCK reference`)
      }
    }
  } else if (scores?.generatedAt !== 'MOCK') {
    problems.push('mock bundle must have scores.generatedAt = "MOCK"')
  }
  return problems
}
