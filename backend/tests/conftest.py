import os
import tempfile
from pathlib import Path

# Must be set before the app modules are imported.
_tmp = Path(tempfile.mkdtemp(prefix="jobradar-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["ENABLE_SCHEDULER"] = "false"
os.environ["OPENAI_API_KEY"] = ""
os.environ["AI_API_KEY"] = ""
os.environ["HUNTER_API_KEY"] = ""

FIXTURES = Path(__file__).parent / "fixtures"
