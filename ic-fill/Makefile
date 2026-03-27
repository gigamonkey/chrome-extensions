VERSION := $(shell python3 -c "import json; print(json.load(open('manifest.json'))['version'])")

DIST_FILES = manifest.json background.js fill.js icon.png README.md
DIST_DIR = ic-fill-$(VERSION)

.PHONY: zip bump-patch bump-minor bump-major version clean

zip: $(DIST_DIR).zip

$(DIST_DIR).zip: $(DIST_FILES)
	rm -rf $(DIST_DIR)
	mkdir $(DIST_DIR)
	cp $^ $(DIST_DIR)/
	zip -r $@ $(DIST_DIR)
	rm -rf $(DIST_DIR)

clean:
	rm -rf ic-fill-*.zip ic-fill-[0-9]*/

bump-patch:
	@python3 bump-version.py patch

bump-minor:
	@python3 bump-version.py minor

bump-major:
	@python3 bump-version.py major

version:
	@echo $(VERSION)
