import json
import os

import numpy as np
import pandas as pd

class AnalogEngine:
    def __init__(self):
        # Phase 2 Scientific Weights
        # geology is 0 until it has a measure comparable between Earth and Moon
        # (today it is a radar proxy); its former 0.30 is spread over the other axes.
        self.weights = {
            'topography': 0.43,
            'geology': 0.0,
            'aridity': 0.29,
            'thermal': 0.14,
            'altitude': 0.14
        }

        # Planetary Targets (Reference Data from NASA PDS/LRO/MOLA)
        self.targets = {
            'shackleton': {
                'name': 'Shackleton Crater (Moon South Pole)',
                'body': 'Moon',
                'features': {'topography': 0.9, 'geology': 0.8, 'aridity': 1.0, 'thermal': 0.9, 'altitude': 0.8},
                'description': 'Permanently shadowed region, water ice potential, near-constant rim light.'
            },
            'jezero': {
                'name': 'Jezero Crater (Mars)',
                'body': 'Mars',
                'features': {'topography': 0.6, 'geology': 0.9, 'aridity': 0.9, 'thermal': 0.8, 'altitude': 0.6},
                'description': 'Ancient river delta, rich in clay and carbonates, prime astrobiology site.'
            },
            'marius': {
                'name': 'Marius Hills Lava Tube (Moon)',
                'body': 'Moon',
                'features': {'topography': 0.7, 'geology': 0.9, 'aridity': 0.9, 'thermal': 0.5, 'altitude': 0.4},
                'description': 'Subterranean lava tube, radiation shielding, stable temperatures.'
            }
        }

        # Earth Analog Candidates (Verified via Research)
        self.analogs = [
            {'id': 1, 'name': 'Atacama Desert', 'country': 'Chile', 'features': {'topography': 0.6, 'geology': 0.8, 'aridity': 1.0, 'thermal': 0.8, 'altitude': 0.7}, 'missions': 'Viking, Curiosity testing'},
            {'id': 2, 'name': 'Devon Island (Haughton)', 'country': 'Canada', 'features': {'topography': 0.9, 'geology': 0.9, 'aridity': 0.8, 'thermal': 0.9, 'altitude': 0.4}, 'missions': 'Haughton-Mars Project'},
            {'id': 3, 'name': 'White Desert', 'country': 'Egypt', 'features': {'topography': 0.5, 'geology': 0.7, 'aridity': 0.9, 'thermal': 0.7, 'altitude': 0.3}, 'missions': 'General geological analog'},
            {'id': 4, 'name': 'McMurdo Dry Valleys', 'country': 'Antarctica', 'features': {'topography': 0.8, 'geology': 0.8, 'aridity': 1.0, 'thermal': 1.0, 'altitude': 0.8}, 'missions': 'Mars subsurface ice studies'},
            {'id': 5, 'name': 'Iceland Lava Fields', 'country': 'Iceland', 'features': {'topography': 0.7, 'geology': 0.9, 'aridity': 0.4, 'thermal': 0.6, 'altitude': 0.4}, 'missions': 'Apollo training, MSL testing'},
            {'id': 6, 'name': 'Mauna Kea', 'country': 'USA', 'features': {'topography': 0.8, 'geology': 0.9, 'aridity': 0.7, 'thermal': 0.7, 'altitude': 0.9}, 'missions': 'Lunar rover testing'},
            {'id': 7, 'name': 'Siwa Oasis (Arid salt flats)', 'country': 'Egypt', 'features': {'topography': 0.3, 'geology': 0.6, 'aridity': 0.8, 'thermal': 0.7, 'altitude': 0.1}, 'missions': 'Evaporite study analog'}
        ]

        self._load_extracted_features()

    def _load_extracted_features(self):
        """Replace the hand-written vectors with ones computed from the raw data
        (data-tools/build_scores.py -> data/features.json). Falls back silently."""
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            'data', 'features.json')
        if not os.path.exists(path):
            return
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        axes = data['axes']
        self.targets = {
            tid: {'name': t['name'], 'body': t['body'], 'description': t['desc'],
                  'features': dict(zip(axes, t['features']))}
            for tid, t in data['targets'].items()
        }
        self.analogs = [
            {'id': i + 1, 'name': a['name'], 'country': a['country'], 'role': a['role'],
             'features': dict(zip(axes, a['features'])), 'missions': a['why']}
            for i, a in enumerate(data['analogs'])
        ]

    def calculate_similarity(self, target_id, custom_weights=None):
        if target_id not in self.targets:
            return None

        target = self.targets[target_id]
        t_vec = target['features']
        w = custom_weights if custom_weights else self.weights

        results = []
        for site in self.analogs:
            s_vec = site['features']

            # Weighted Euclidean Distance
            dist = np.sqrt(sum(w[k] * (t_vec[k] - s_vec[k])**2 for k in w.keys()))

            # Convert to Score (0-100)
            score = max(0, 100 * (1 - dist))

            results.append({
                'name': site['name'],
                'country': site['country'],
                'score': round(score, 2),
                'missions': site['missions'],
                'breakdown': {k: round(abs(t_vec[k] - s_vec[k]), 2) for k in w.keys()}
            })

        # Sort by score
        results.sort(key=lambda x: x['score'], reverse=True)
        return results

if __name__ == "__main__":
    engine = AnalogEngine()
    for tid in engine.targets:
        print(f"--- Analogs for {engine.targets[tid]['name']} ---")
        for i, m in enumerate(engine.calculate_similarity(tid)):
            print(f"{i+1:>2}. {m['name']} ({m['country']}): {m['score']}%")
