"""Run: python -m unittest discover -s tools"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import leakcheck  # noqa: E402
import new_update  # noqa: E402


def scan(text):
    return leakcheck.scan_text("x.md", text, [])


class LeakcheckTest(unittest.TestCase):
    def test_private_hosts_fail_but_network_constants_and_doc_ranges_pass(self):
        self.assertTrue(scan("the hub is at 10.31.4.7"))
        self.assertTrue(scan("peer 100.80.1.2"))
        self.assertTrue(scan("Address = 10.31.4.7/16"))
        self.assertFalse(scan('PRIVATE = ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10")'))
        self.assertFalse(scan("example attacker 203.0.113.9 and 198.51.100.4; bind 127.0.0.1 or 0.0.0.0"))

    def test_secret_shapes_fail(self):
        self.assertTrue(scan("key kg_" + "a" * 43))
        self.assertTrue(scan("-----BEGIN OPENSSH PRIVATE KEY-----"))
        self.assertTrue(scan("PrivateKey = " + "A" * 43 + "="))
        self.assertTrue(scan("token ghp_" + "b" * 36))

    def test_personal_paths_fail(self):
        self.assertTrue(scan(r"C:\Users\someone\bin\tool.ps1"))
        self.assertTrue(scan("cd /home/someone/src"))

    def test_hashed_names_match_without_listing_them(self):
        # A name is caught by hash; the source never spells it out.
        h = next(iter(leakcheck.NAME_HASHES))
        self.assertEqual(len(h), 64)
        self.assertFalse(scan("hub, agent box and workstation"))

    def test_local_names_file_is_honoured(self):
        leakcheck._LOCAL_NAMES.add("examplehost")
        try:
            self.assertTrue(scan("deployed on examplehost today"))
        finally:
            leakcheck._LOCAL_NAMES.discard("examplehost")


class NewUpdateTest(unittest.TestCase):
    def test_clean_drops_urls_trailers_and_hashes(self):
        body = "Fixes the gate.\nSee https://github.com/someone/private/pull/5\nCo-Authored-By: Bot <b@x>\nlanded in 3f66485abc"
        out = new_update.clean(body)
        self.assertNotIn("github.com", out)
        self.assertNotIn("Co-Authored", out)
        self.assertNotIn("3f66485abc", out)
        self.assertIn("Fixes the gate.", out)

    def test_draft_shape(self):
        text = new_update.draft("Gate content rules", "serving",
                                [{"title": "gate: content rules", "body": "why", "commits": ["a", "b"], "date": ""}],
                                "2026-10-29")
        self.assertIn("area: serving", text)
        self.assertIn("## What changed", text)
        self.assertFalse(scan(text))


if __name__ == "__main__":
    unittest.main()
