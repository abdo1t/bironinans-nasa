// Plain-language definitions for the short "?" tooltips (components/Term.jsx).
// UI text only: nothing here affects a score. Keep each definition to one or two
// sentences and consistent with docs/methodology.md.
export const GLOSSARY = {
  score: {
    title: 'Similarity score',
    text: 'How closely this Earth site resembles the chosen Moon or Mars site on the selected criteria, from 0 to 100. It measures resemblance, not mission suitability.',
  },
  range: {
    title: 'Possible range',
    text: 'Where the score could land if the criteria we have no data for at this site turned out to be a total mismatch (low end) or a perfect match (high end). It comes from missing data — it is not a statistical confidence interval.',
  },
  min: {
    title: 'Conservative lower bound',
    text: 'The score a site keeps even if every criterion missing for it were a total mismatch (the low end of its possible range). Ranking by it favours sites whose score rests on data.',
  },
  rankBy: {
    title: 'Ranking method',
    text: 'Score ranks by the similarity score from the criteria that have data. Conservative lower bound is the cautious order: it ranks by the low end of each range, so a site cannot rank high on missing data.',
  },
  evidence: {
    title: 'Evidence coverage',
    text: 'How much of the selected weight rests on criteria that have data for both the site and the target. High: at least 80 %. Low: under 50 % or fewer than 3 criteria. It says how much of the score is backed by data, not how accurate the data are.',
  },
  coverage: {
    title: 'Criteria with data',
    text: 'How many of the selected criteria had data for both this site and the target. Criteria without data are left out of the score — never counted as zero.',
  },
  catalogued: {
    title: 'Catalogued analog',
    text: 'A site with a peer-reviewed analog study, or on this project’s reference list of known analog sites. The other sites are uncatalogued candidates: leads for field checking, not validated analogs.',
  },
  uncatalogued: {
    title: 'Uncatalogued candidate',
    text: 'More than 300 km from every site in this project’s analog reference list, with no peer-reviewed analog study found. A lead for field checking — not a validated analog.',
  },
  noScore: {
    title: 'No score',
    text: 'Too few of the selected criteria have data for this site and target, so it is not scored. That is different from a low score.',
  },
  weight: {
    title: 'Criterion weight',
    text: 'How much a criterion counts toward the score, from 0 (ignored) to 5 (most important). A research objective is simply a preset of weights.',
  },
  similarity: {
    title: 'Similarity to target',
    text: 'How close the site is to the target on one criterion: 100 % is identical on that criterion’s Earth scale, 0 % is the opposite end.',
  },
  relief: {
    title: 'Terrain relief',
    text: 'Height difference between the high and low ground in a 10 × 10 km window, measured the same way on Earth, the Moon and Mars.',
  },
  reanalysis: {
    title: 'Reanalysis',
    text: 'A climate model constrained by observations (NASA POWER / MERRA-2). Values are averages for a grid cell about 50 km across, not a station at the exact point.',
  },
  clipped: {
    title: 'Beyond Earth’s range',
    text: 'The Moon or Mars value lies outside anything found on Earth, so the comparison asks how close a site comes to Earth’s extreme.',
  },
  analog: {
    title: 'Earth analog',
    text: 'A place on Earth that resembles a Moon or Mars site in some respects, used to rehearse science and engineering before flying. No analog reproduces gravity, vacuum or radiation.',
  },
}
