# Music Practice — the same things ./build.sh and ./test.sh do, wrapped.
#
# Every target is a one-line delegation. The logic lives in the scripts so
# there is one implementation, and this file exists for the `## ` descriptions
# that `make help` prints and for the composite shortcuts at the bottom.

.DEFAULT_GOAL := help
.PHONY: help check test watch coverage types lint all offline build dev preview \
        analyze clean android android-release bundle install run info ci

# Built with printf so they survive a plain echo under /bin/sh, which does not
# expand backslash escapes.
GREEN := $(shell printf '\033[0;32m')
BLUE  := $(shell printf '\033[0;34m')
NC    := $(shell printf '\033[0m')

help: ## Show this message
	@printf '$(BLUE)Music Practice$(NC)\n\n'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-16s$(NC) %s\n", $$1, $$2}'
	@printf '\nExamples:\n'
	@printf '  make check        # is this machine set up\n'
	@printf '  make all          # what CI runs\n'
	@printf '  make run          # build and launch on a phone\n'

check: ## Check this machine can build the app
	@./test.sh --check

test: ## Run the unit tests
	@./test.sh --unit

watch: ## Run the unit tests in watch mode
	@./test.sh --watch

coverage: ## Run the unit tests with a coverage report
	@./test.sh --coverage

types: ## Type check
	@./test.sh --types

lint: ## Lint
	@./test.sh --lint

offline: ## Assert the service worker precaches what the app needs
	@./test.sh --offline

all: ## Tests, types, lint and the offline check
	@./test.sh --all

build: ## Production web build
	@./build.sh

dev: ## Dev server
	@./build.sh --dev

preview: ## Build, then serve dist/ locally
	@./build.sh --preview

analyze: ## Build and report what is in the bundle
	@./build.sh --analyze

clean: ## Remove build output and caches
	@./build.sh --clean

android: ## Debug APK
	@./build.sh --android

android-release: ## Release APK
	@./build.sh --android --release

bundle: ## Play Store AAB
	@./build.sh --bundle

install: ## Build and install on a device
	@./build.sh --android --install

run: ## Build, install and launch on a device
	@./build.sh --android --run

info: ## Print the versions and paths this build depends on
	@printf 'node     %s\n' "$$(node -v)"
	@printf 'npm      %s\n' "$$(npm -v)"
	@printf 'package  %s %s\n' "$$(node -p "require('./package.json').name")" \
		"$$(node -p "require('./package.json').version")"
	@printf 'vite     %s\n' "$$(node -p "require('./node_modules/vite/package.json').version" 2>/dev/null || echo 'not installed')"
	@printf 'android  %s\n' "$$([ -d android ] && echo present || echo 'not set up')"
	@printf 'tests    %s files\n' "$$(git ls-files 'src/**/*.test.ts' 'src/**/*.test.tsx' | wc -l | tr -d ' ')"
	@printf 'adrs     %s\n' "$$(ls docs/adr/[0-9]*.md 2>/dev/null | wc -l | tr -d ' ')"

# Development shortcuts
ci: all ## Everything CI runs, locally
