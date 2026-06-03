.PHONY: update

update:
	@echo "Checking working tree and index..."
	@git diff --quiet && git diff --cached --quiet || { echo "Error: working tree or index is not clean"; exit 1; }
	@echo "Fetching from origin..."
	@git fetch origin
	@echo "Merging origin/main into current branch..."
	@git merge --no-edit origin/main
