import json
from pathlib import Path
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET

import check_android_localization as native


class AndroidLocalizationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.app = Path(self.directory.name) / "main"
        shutil.copytree(native.APP, self.app)
        self.spanish = self.app / "res/values-es/strings.xml"

    def mutate(self, update):
        tree = ET.parse(self.spanish)
        update(tree.getroot())
        tree.write(self.spanish, encoding="unicode")

    def test_maintained_resources_match_review_record(self):
        native.validate(self.app)

    def test_missing_translation_fails(self):
        self.mutate(lambda root: root.remove(root[0]))
        with self.assertRaisesRegex(ValueError, "Missing, stale"):
            native.inspect(self.app)

    def test_stale_key_fails(self):
        self.mutate(lambda root: ET.SubElement(root, "string", name="unused").__setattr__("text", "Viejo"))
        with self.assertRaisesRegex(ValueError, "Missing, stale"):
            native.inspect(self.app)

    def test_missing_plural_case_fails(self):
        self.mutate(lambda root: root.find("plurals").remove(root.find("plurals/item")))
        with self.assertRaisesRegex(ValueError, "plural cases"):
            native.inspect(self.app)

    def test_format_type_mismatch_fails(self):
        self.mutate(lambda root: root.find("string[@name='shell_version']").__setattr__("text", "%1$s (%2$s)"))
        with self.assertRaisesRegex(ValueError, "argument mismatch"):
            native.inspect(self.app)

    def test_missing_spanish_many_case_fails(self):
        self.mutate(lambda root: root.find("plurals").remove(root.find("plurals/item[@quantity='many']")))
        with self.assertRaisesRegex(ValueError, "Spanish many"):
            native.inspect(self.app)

    def test_source_wording_change_requires_review(self):
        path = self.app / "res/values/strings.xml"
        path.write_text(path.read_text().replace("Browse", "Explore"))
        with self.assertRaisesRegex(ValueError, "needs translation review"):
            native.validate(self.app)

    def test_translation_wording_change_requires_review(self):
        self.spanish.write_text(self.spanish.read_text().replace("Explorar", "Buscar"))
        with self.assertRaisesRegex(ValueError, "needs translation review"):
            native.validate(self.app)

    def test_native_xml_translator_round_trip(self):
        # Export the maintained native file, parse/save as an XML editor would, then import it.
        exported = Path(self.directory.name) / "translator/values-es/strings.xml"
        exported.parent.mkdir(parents=True)
        shutil.copy2(self.spanish, exported)
        tree = ET.parse(exported)
        ET.indent(tree)
        tree.write(exported, encoding="unicode", xml_declaration=True)
        shutil.copy2(exported, self.spanish)
        self.assertEqual(native.validate(self.app), json.loads(native.REVIEW.read_text())["resources"])


if __name__ == "__main__":
    unittest.main()
