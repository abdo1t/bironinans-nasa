// The two ways to order the same scores (URL `rank=`): display labels only.
// 'score' = scoring.js order (the default); 'min' = guaranteed minimum (explain.js
// orderRanking), the conservative order. Labels match docs/methodology.md.
export const RANK_METHODS = {
  score: {
    label: 'Score',
    short: 'Ranked by score. A range marks scores that missing data could still move.',
    help: 'Ranked by score, computed from the criteria that have data. Sites with missing data show a range; switch to “Conservative lower bound” to rank by evidence-backed score.',
  },
  min: {
    label: 'Conservative lower bound',
    short: 'Conservative order: ranked by the lower bound, the low end of each range.',
    help: 'Ranked by conservative lower bound: the score each site keeps if every criterion missing for it were a total mismatch — favours evidence-backed sites.',
  },
}

export const RANK_ORDER = ['score', 'min']
