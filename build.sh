#!/usr/bin/env bash

# Music Practice - Build Script
# Builds the web app, and wraps it for Android when asked

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

cd "$(dirname "${BASH_SOURCE[0]}")"

DEV=false PREVIEW=false ANDROID=false RELEASE=false BUNDLE=false
INSTALL=false RUN=false ANALYZE=false CLEAN=false
SERIAL=""

usage() {
    cat <<EOF
Usage: ./build.sh [OPTIONS]

Options:
      --dev             Start the Vite dev server
      --preview         Build, then serve dist/ locally
      --android         Build the web app, sync it into android/, assemble a debug APK
      --release         Release build; with --android, assembles a release APK
      --bundle          Play Store AAB (implies --android --release)
  -i, --install         Install the APK on a device
  -r, --run             Install and launch (implies --install)
  -s, --device SERIAL   Target a particular device
      --analyze         Build and report what is in the bundle
      --clean           Remove dist/, the Vite cache and the Android build output
  -h, --help            This message

Examples:
  ./build.sh                    # production web build
  ./build.sh --dev              # dev server at http://localhost:5173
  ./build.sh --android --run    # onto a phone

The notation library and its font are a separate chunk on purpose, so --analyze
is the quickest way to see whether a change has pulled them into the app shell.
EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --dev) DEV=true; shift ;;
        --preview) PREVIEW=true; shift ;;
        --android) ANDROID=true; shift ;;
        --release) RELEASE=true; shift ;;
        --bundle) BUNDLE=true; ANDROID=true; RELEASE=true; shift ;;
        -i|--install) INSTALL=true; ANDROID=true; shift ;;
        -r|--run) RUN=true; INSTALL=true; ANDROID=true; shift ;;
        -s|--device) SERIAL="$2"; shift 2 ;;
        --analyze) ANALYZE=true; shift ;;
        --clean) CLEAN=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Run './build.sh --help' for usage information"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}Music Practice - Build${NC}"
echo -e "${BLUE}=====================================${NC}"
echo

if $CLEAN; then
    rm -rf dist node_modules/.vite android/app/build
    echo -e "${GREEN}✓${NC} cleaned dist/, the Vite cache and android/app/build"
    echo
fi

if $DEV; then
    echo -e "${BLUE}Dev server${NC} — Ctrl-C to stop"
    exec npm run dev
fi

# ---- Web build -----------------------------------------------------------

echo -e "${BLUE}Building the web app${NC}"
npm run build
echo -e "${GREEN}✓${NC} built"

if [ -d dist ]; then
    total=$(du -sh dist | cut -f1)
    echo "  Output:   dist/ ($total)"
    # The gzipped figure is the one that matters on a phone, and it is not
    # what du reports.
    gz=$(find dist/assets -name '*.js' -exec sh -c 'gzip -c "$1" | wc -c' _ {} \; 2>/dev/null |
         awk '{s+=$1} END {printf "%.0f", s/1024}')
    [ -n "$gz" ] && echo "  JS:       ${gz} kB gzipped"
fi
echo

if $ANALYZE; then
    echo -e "${BLUE}Bundle contents${NC}"
    find dist/assets -name '*.js' -print0 2>/dev/null | while IFS= read -r -d '' f; do
        printf '  %-36s %6s raw  %6s gzipped\n' "$(basename "$f")" \
            "$(du -h "$f" | cut -f1)" \
            "$(gzip -c "$f" | wc -c | awk '{printf "%.0fk", $1/1024}')"
    done
    echo
fi

if $PREVIEW; then
    echo -e "${BLUE}Serving dist/${NC} — Ctrl-C to stop"
    exec npm run preview
fi

# ---- Android -------------------------------------------------------------

if ! $ANDROID; then
    echo -e "${BLUE}Next steps:${NC}"
    echo "  ./build.sh --preview        serve this build locally"
    echo "  ./build.sh --android --run  put it on a phone"
    exit 0
fi

if [ ! -d android ]; then
    echo -e "${RED}✗${NC} There is no android/ directory."
    echo "  Capacitor has not been set up yet. See docs/ROADMAP.md; until then"
    echo "  the app ships as a PWA only."
    exit 1
fi

echo -e "${BLUE}Syncing into android/${NC}"
npx --no-install cap sync android
echo -e "${GREEN}✓${NC} synced"
echo

cd android
if $BUNDLE; then
    ./gradlew bundleRelease
    artifact=$(ls -S app/build/outputs/bundle/release/*.aab 2>/dev/null | head -1)
elif $RELEASE; then
    ./gradlew assembleRelease
    artifact=$(ls -S app/build/outputs/apk/release/*.apk 2>/dev/null | head -1)
else
    ./gradlew assembleDebug
    artifact=$(ls -S app/build/outputs/apk/debug/*.apk 2>/dev/null | head -1)
fi
cd ..

if [ -z "${artifact:-}" ]; then
    echo -e "${RED}✗${NC} Gradle reported success but produced no artifact"
    exit 1
fi
echo -e "${GREEN}✓${NC} $(basename "$artifact") ($(du -h "android/$artifact" | cut -f1))"
echo "  Location: android/$artifact"
echo

if ! $INSTALL; then exit 0; fi

# adb refuses to guess between devices, so fail here with something actionable
# rather than letting the install blow up after a full build.
if ! command -v adb >/dev/null 2>&1; then
    echo -e "${RED}✗${NC} adb is not on PATH"; exit 1
fi
devices=$(adb devices | grep -v "List" | grep "device$" | awk '{print $1}' || true)
count=$(printf '%s' "$devices" | grep -c . || true)
if [ "$count" -eq 0 ]; then
    echo -e "${RED}✗${NC} No device attached. Start an emulator or plug a phone in."
    exit 1
elif [ -n "$SERIAL" ]; then
    printf '%s\n' "$devices" | grep -qx "$SERIAL" ||
        { echo -e "${RED}✗${NC} $SERIAL is not attached"; exit 1; }
elif [ "$count" -gt 1 ]; then
    echo -e "${RED}✗${NC} More than one device attached."
    echo "  Pick one with --device <serial>, e.g.:"
    echo "    ./build.sh --android --run --device $(printf '%s' "$devices" | head -1)"
    exit 1
else
    SERIAL=$(printf '%s' "$devices" | head -1)
fi

adb -s "$SERIAL" install -r "android/$artifact"
echo -e "${GREEN}✓${NC} installed on $SERIAL"

if $RUN; then
    app_id=$(node -p "require('./capacitor.config.json').appId" 2>/dev/null || echo '')
    if [ -z "$app_id" ]; then
        echo -e "${YELLOW}⚠${NC} could not read appId from capacitor.config.json; launch it by hand"
        exit 0
    fi
    adb -s "$SERIAL" shell monkey -p "$app_id" -c android.intent.category.LAUNCHER 1 >/dev/null
    echo -e "${GREEN}✓${NC} launched"
fi
