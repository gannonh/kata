#!/bin/bash

# Kata Agents Installer
# Downloads and installs from GitHub Releases
#
# NOTE: This script was adapted from the original Craft Agents installer.
# It now downloads from GitHub Releases instead of agents.craft.do.

set -e

# GitHub Release URL base
GITHUB_REPO="gannonh/kata-agents"
GITHUB_RELEASES_URL="https://github.com/$GITHUB_REPO/releases"
DOWNLOAD_DIR="$HOME/.kata-agents/downloads"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info() { printf "%b\n" "${BLUE}>${NC} $1"; }
success() { printf "%b\n" "${GREEN}>${NC} $1"; }
warn() { printf "%b\n" "${YELLOW}!${NC} $1"; }
error() { printf "%b\n" "${RED}x${NC} $1"; exit 1; }

# Detect OS
OS="$(uname -s)"
case "$OS" in
    Darwin) OS_TYPE="darwin" ;;
    Linux)  OS_TYPE="linux" ;;
    *)      error "Unsupported operating system: $OS" ;;
esac

# Check for required dependencies
DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
else
    error "Either curl or wget is required but neither is installed"
fi

# Check if jq is available (optional)
HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
    HAS_JQ=true
fi

# Download function that works with both curl and wget
# Usage: download_file <url> [output_file] [show_progress]
download_file() {
    local url="$1"
    local output="$2"
    local show_progress="${3:-false}"

    if [ "$DOWNLOADER" = "curl" ]; then
        if [ -n "$output" ]; then
            if [ "$show_progress" = "true" ]; then
                curl -fL --progress-bar -o "$output" "$url"
            else
                curl -fsSL -o "$output" "$url"
            fi
        else
            curl -fsSL "$url"
        fi
    elif [ "$DOWNLOADER" = "wget" ]; then
        if [ -n "$output" ]; then
            if [ "$show_progress" = "true" ]; then
                wget --show-progress -q -O "$output" "$url"
            else
                wget -q -O "$output" "$url"
            fi
        else
            wget -q -O - "$url"
        fi
    else
        return 1
    fi
}

# Detect architecture
case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) error "Unsupported architecture: $(uname -m)" ;;
esac

# Set platform-specific variables
if [ "$OS_TYPE" = "darwin" ]; then
    platform="darwin-${arch}"
    APP_NAME="Kata Agents.app"
    INSTALL_DIR="/Applications"
    ext="dmg"
    filename="Kata-Agents-${arch}.dmg"
else
    # Linux only supports x64 currently
    if [ "$arch" != "x64" ]; then
        error "Linux currently only supports x64 architecture. Your architecture: $arch"
    fi
    platform="linux-${arch}"
    APP_NAME="Kata-Agents-x64.AppImage"
    INSTALL_DIR="$HOME/.local/bin"
    ext="AppImage"
    filename="Kata-Agents-x64.AppImage"
fi

echo ""
info "Detected platform: $platform"

mkdir -p "$DOWNLOAD_DIR"
mkdir -p "$INSTALL_DIR"

# Get latest release from GitHub
info "Fetching latest release from GitHub..."

if [ "$HAS_JQ" = true ]; then
    latest_json=$(download_file "https://api.github.com/repos/$GITHUB_REPO/releases/latest")
    version=$(echo "$latest_json" | jq -r '.tag_name // empty' | sed 's/^v//')
    download_url=$(echo "$latest_json" | jq -r ".assets[] | select(.name == \"$filename\") | .browser_download_url // empty")
else
    # Fallback: redirect-based download from latest release
    version="latest"
    download_url="$GITHUB_RELEASES_URL/latest/download/$filename"
fi

if [ -z "$version" ]; then
    error "Failed to get latest version"
fi

info "Latest version: $version"

# Download installer
installer_path="$DOWNLOAD_DIR/$filename"

info "Downloading $filename..."
echo ""
if ! download_file "$download_url" "$installer_path" true; then
    rm -f "$installer_path"
    error "Download failed"
fi
echo ""

success "Download complete!"

# Platform-specific installation
if [ "$OS_TYPE" = "darwin" ]; then
    # macOS installation
    dmg_path="$installer_path"

    # Quit the app if it's running (use bundle ID for reliability)
    APP_BUNDLE_ID="sh.kata.desktop"
    if pgrep -x "Kata Agents" >/dev/null 2>&1; then
        info "Quitting Kata Agents..."
        osascript -e "tell application id \"$APP_BUNDLE_ID\" to quit" 2>/dev/null || true
        # Wait for app to quit (max 5 seconds) - POSIX compatible loop
        i=0
        while [ $i -lt 10 ]; do
            if ! pgrep -x "Kata Agents" >/dev/null 2>&1; then
                break
            fi
            sleep 0.5
            i=$((i + 1))
        done
        # Force kill if still running
        if pgrep -x "Kata Agents" >/dev/null 2>&1; then
            warn "App didn't quit gracefully. Force quitting (unsaved data may be lost)..."
            pkill -9 -x "Kata Agents" 2>/dev/null || true
            # Wait longer for macOS to release file handles
            sleep 3
        fi
    fi

    # Remove existing installation if present
    if [ -d "$INSTALL_DIR/$APP_NAME" ]; then
        info "Removing previous installation..."
        rm -rf "$INSTALL_DIR/$APP_NAME"
    fi

    # Mount DMG
    info "Mounting disk image..."
    mount_point=$(hdiutil attach "$dmg_path" -nobrowse -mountrandom /tmp 2>/dev/null | tail -1 | awk '{print $NF}')

    if [ -z "$mount_point" ] || [ ! -d "$mount_point" ]; then
        rm -f "$dmg_path"
        error "Failed to mount DMG"
    fi

    # Find the .app in the mounted volume
    app_source=$(find "$mount_point" -maxdepth 1 -name "*.app" -type d | head -1)

    if [ -z "$app_source" ]; then
        hdiutil detach "$mount_point" -quiet 2>/dev/null || true
        rm -f "$dmg_path"
        error "No .app found in DMG"
    fi

    # Copy app to /Applications
    info "Installing to $INSTALL_DIR..."
    cp -R "$app_source" "$INSTALL_DIR/$APP_NAME"

    # Unmount DMG
    info "Cleaning up..."
    hdiutil detach "$mount_point" -quiet 2>/dev/null || true
    rm -f "$dmg_path"

    # Remove quarantine attribute if present
    xattr -rd com.apple.quarantine "$INSTALL_DIR/$APP_NAME" 2>/dev/null || true

    echo ""
    echo "─────────────────────────────────────────────────────────────────────────"
    echo ""
    success "Installation complete!"
    echo ""
    printf "%b\n" "  Kata Agents has been installed to ${BOLD}$INSTALL_DIR/$APP_NAME${NC}"
    echo ""
    printf "%b\n" "  You can launch it from ${BOLD}Applications${NC} or by running:"
    printf "%b\n" "    ${BOLD}open -a 'Kata Agents'${NC}"
    echo ""

else
    # Linux installation
    appimage_path="$installer_path"

    # New paths
    APP_DIR="$HOME/.kata-agents/app"
    WRAPPER_PATH="$INSTALL_DIR/kata-agents"
    APPIMAGE_INSTALL_PATH="$APP_DIR/Kata-Agents-x64.AppImage"

    # Kill the app if it's running
    if pgrep -f "Kata-Agents.*AppImage" >/dev/null 2>&1; then
        info "Stopping Kata Agents..."
        pkill -f "Kata-Agents.*AppImage" 2>/dev/null || true
        sleep 2
    fi

    # Create directories
    mkdir -p "$APP_DIR"
    mkdir -p "$INSTALL_DIR"

    # Remove existing AppImage
    [ -f "$APPIMAGE_INSTALL_PATH" ] && rm -f "$APPIMAGE_INSTALL_PATH"

    # Install AppImage
    info "Installing AppImage to $APP_DIR..."
    mv "$appimage_path" "$APPIMAGE_INSTALL_PATH"
    chmod +x "$APPIMAGE_INSTALL_PATH"

    # Create wrapper script
    info "Creating launcher at $WRAPPER_PATH..."
    cat > "$WRAPPER_PATH" << 'WRAPPER_EOF'
#!/bin/bash
# Kata Agents launcher - handles Linux-specific AppImage issues

APPIMAGE_PATH="$HOME/.kata-agents/app/Kata-Agents-x64.AppImage"
ELECTRON_CACHE="$HOME/.config/@kata-agents"
ELECTRON_CACHE_ALT="$HOME/.cache/@kata-agents"

# Verify AppImage exists
if [ ! -f "$APPIMAGE_PATH" ]; then
    echo "Error: Kata Agents not found at $APPIMAGE_PATH"
    echo "Reinstall from: https://github.com/gannonh/kata-agents/releases"
    exit 1
fi

# Ensure DISPLAY is set (required for X11)
if [ -z "$DISPLAY" ]; then
    export DISPLAY=:0.0
fi

# Clear stale cache referencing AppImage mount paths
# AppImage creates a new /tmp/.mount_Kata-XXXX each launch, so any cached path is stale
for cache_dir in "$ELECTRON_CACHE" "$ELECTRON_CACHE_ALT"; do
    if [ -d "$cache_dir" ] && grep -rq '/tmp/\.mount_Kata' "$cache_dir" 2>/dev/null; then
        rm -rf "$cache_dir"
    fi
done

# Set APPIMAGE for auto-update
export APPIMAGE="$APPIMAGE_PATH"

# Launch with --no-sandbox (AppImage extracts to /tmp, losing SUID on chrome-sandbox)
exec "$APPIMAGE_PATH" --no-sandbox "$@"
WRAPPER_EOF

    chmod +x "$WRAPPER_PATH"

    # Migrate old installation
    OLD_APPIMAGE="$INSTALL_DIR/Kata-Agents-x64.AppImage"
    [ -f "$OLD_APPIMAGE" ] && rm -f "$OLD_APPIMAGE"

    echo ""
    echo "─────────────────────────────────────────────────────────────────────────"
    echo ""
    success "Installation complete!"
    echo ""
    printf "%b\n" "  AppImage: ${BOLD}$APPIMAGE_INSTALL_PATH${NC}"
    printf "%b\n" "  Launcher: ${BOLD}$WRAPPER_PATH${NC}"
    echo ""
    printf "%b\n" "  Run with: ${BOLD}kata-agents${NC}"
    echo ""
    printf "%b\n" "  Add to PATH if needed:"
    printf "%b\n" "    ${BOLD}echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc${NC}"
    echo ""

    # FUSE check
    if ! command -v fusermount >/dev/null 2>&1; then
        warn "FUSE required but not detected."
        printf "%b\n" "  Install: ${BOLD}sudo apt install fuse libfuse2${NC} (Debian/Ubuntu)"
        printf "%b\n" "           ${BOLD}sudo dnf install fuse fuse-libs${NC} (Fedora)"
    fi
fi
