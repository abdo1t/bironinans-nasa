import sys
from pathlib import Path

# Make `import scoring` / `import config` work when pytest runs from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
