"""Run: python -m unittest discover -s models"""
import copy
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import render  # noqa: E402

EXAMPLES = Path(__file__).resolve().parent / "prompts.example"


class RenderTest(unittest.TestCase):
    def setUp(self):
        self.cfg = render.load()

    def test_every_role_renders(self):
        with tempfile.TemporaryDirectory() as d:
            files = render.render(self.cfg, EXAMPLES, Path(d))
            self.assertEqual(len(files), len(render.roles(self.cfg)))
            alert = (Path(d) / "scout-sec-alert1.3.0.Modelfile").read_text()
            self.assertIn("FROM qwen3:8b", alert)
            self.assertIn("/no_think", alert)
            self.assertIn("PARAMETER temperature 0.0", alert)
            manager = (Path(d) / "scout-sec-manager1.3.0.Modelfile").read_text()
            self.assertNotIn("/no_think", manager, "managers keep reasoning")

    def test_contract_roles_stay_cold(self):
        cfg = copy.deepcopy(self.cfg)
        cfg["security"]["alert"]["temp"] = 0.7
        with self.assertRaises(ValueError):
            render.validate(cfg)

    def test_abliterated_bases_refused(self):
        cfg = copy.deepcopy(self.cfg)
        cfg["nav"]["rank"]["base"] = "some/qwen3-abliterated:14b"
        with self.assertRaises(ValueError):
            render.validate(cfg)

    def test_missing_prompt_is_an_error(self):
        with tempfile.TemporaryDirectory() as empty, tempfile.TemporaryDirectory() as out:
            with self.assertRaises(FileNotFoundError):
                render.render(self.cfg, Path(empty), Path(out))

    def test_one_tag_one_setting(self):
        cfg = copy.deepcopy(self.cfg)
        cfg["nav"]["alert"]["tag"] = "scout-rank"   # same tag as nav.rank, different base/temp is fine only if equal
        cfg["nav"]["alert"]["base"] = "qwen3:8b"
        with self.assertRaises(ValueError):
            render.validate(cfg)


if __name__ == "__main__":
    unittest.main()
