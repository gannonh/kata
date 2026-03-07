# Kata Agents Windows Installer
# Downloads and installs from GitHub Releases
#
# NOTE: This script was adapted from the original Craft Agents installer.
# It now downloads from GitHub Releases instead of agents.craft.do.

$ErrorActionPreference = "Stop"

$GITHUB_REPO = "gannonh/kata-agents"
$GITHUB_RELEASES_URL = "https://github.com/$GITHUB_REPO/releases"
$DOWNLOAD_DIR = "$env:TEMP\kata-agents-install"
$APP_NAME = "Kata Agents"

# Colors for output
function Write-Info { Write-Host "> $args" -ForegroundColor Blue }
function Write-Success { Write-Host "> $args" -ForegroundColor Green }
function Write-Warn { Write-Host "! $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "x $args" -ForegroundColor Red; exit 1 }

# Check for Windows
if ($env:OS -ne "Windows_NT") {
    Write-Err "This installer is for Windows only."
}

# Detect architecture
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$platform = "win32-$arch"
$filename = "Kata-Agents-$arch.exe"

Write-Host ""
Write-Info "Detected platform: $platform (arch: $arch)"

# Create download directory
New-Item -ItemType Directory -Force -Path $DOWNLOAD_DIR | Out-Null

# Get latest release from GitHub
Write-Info "Fetching latest release from GitHub..."
try {
    $latestRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/$GITHUB_REPO/releases/latest" -UseBasicParsing
    $version = $latestRelease.tag_name -replace '^v', ''
    $asset = $latestRelease.assets | Where-Object { $_.name -eq $filename }
    if (-not $asset) {
        Write-Err "Asset $filename not found in release"
    }
    $installerUrl = $asset.browser_download_url
    $fileSize = $asset.size
} catch {
    Write-Err "Failed to fetch latest release: $_"
}

if (-not $version) {
    Write-Err "Failed to get latest version"
}

Write-Info "Latest version: $version"

# Download installer with progress
$installerPath = Join-Path $DOWNLOAD_DIR $filename
$fileSizeMB = [math]::Round($fileSize / 1MB, 1)

# Clean up any partial download from previous attempts
Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue

Write-Info "Downloading $filename ($fileSizeMB MB)..."

try {
    # Use WebRequest for download with progress
    $webRequest = [System.Net.HttpWebRequest]::Create($installerUrl)
    $webRequest.Timeout = 600000  # 10 minutes
    $response = $webRequest.GetResponse()
    $responseStream = $response.GetResponseStream()
    $fileStream = [System.IO.File]::Create($installerPath)

    $buffer = New-Object byte[] 65536
    $totalRead = 0
    $lastPercent = -1

    while (($read = $responseStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        $fileStream.Write($buffer, 0, $read)
        $totalRead += $read

        if ($fileSize -gt 0) {
            $percent = [math]::Floor(($totalRead / $fileSize) * 100)
            if ($percent -ne $lastPercent) {
                $downloadedMB = [math]::Round($totalRead / 1MB, 1)
                $barWidth = 40
                # Cap at 100% for display (actual download may exceed manifest size slightly)
                $displayPercent = [math]::Min($percent, 100)
                $filled = [math]::Min([math]::Floor($displayPercent / (100 / $barWidth)), $barWidth)
                $bar = "[" + ("#" * $filled) + ("-" * ($barWidth - $filled)) + "]"
                Write-Host -NoNewline ("`r  $bar $percent% ($downloadedMB / $fileSizeMB MB)   ")
                $lastPercent = $percent
            }
        }
    }

    $fileStream.Close()
    $responseStream.Close()
    $response.Close()

    Write-Host ""
    Write-Success "Download complete!"
} catch {
    # Clean up partial download on failure
    if ($fileStream) { $fileStream.Close() }
    if ($responseStream) { $responseStream.Close() }
    if ($response) { $response.Close() }
    Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue
    Write-Err "Download failed: $_"
}

# Verify file was downloaded
if (-not (Test-Path $installerPath)) {
    Write-Err "Download failed: file not found"
}

# Close the app if it's running
$process = Get-Process -Name "Kata Agents" -ErrorAction SilentlyContinue
if ($process) {
    Write-Info "Closing Kata Agents..."
    $process | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# Run the installer
Write-Info "Running installer (follow the installer prompts)..."

try {
    $installerProcess = Start-Process -FilePath $installerPath -PassThru
    $spinner = @('|', '/', '-', '\')
    $i = 0

    while (-not $installerProcess.HasExited) {
        Write-Host -NoNewline ("`r  Installing... " + $spinner[$i % 4] + "   ")
        Start-Sleep -Milliseconds 200
        $i++
    }

    Write-Host -NoNewline "`r                      `r"

    if ($installerProcess.ExitCode -ne 0) {
        Write-Err "Installation failed with exit code: $($installerProcess.ExitCode)"
    }
} catch {
    Write-Err "Installation failed: $_"
}

# Clean up installer
Write-Info "Cleaning up..."
Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue

# Add command line shortcut
Write-Info "Adding 'kata-agents' command to PATH..."

$binDir = "$env:LOCALAPPDATA\Kata Agents\bin"
$cmdFile = "$binDir\kata-agents.cmd"
$exePath = "$env:LOCALAPPDATA\Programs\Kata Agents\Kata Agents.exe"

# Create bin directory
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

# Create batch file launcher
$cmdContent = "@echo off`r`nstart `"`" `"$exePath`" %*"
Set-Content -Path $cmdFile -Value $cmdContent -Encoding ASCII

# Add to user PATH if not already there
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$binDir*") {
    $newPath = "$userPath;$binDir"
    [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
    Write-Success "Added to PATH (restart terminal to use 'kata-agents' command)"
} else {
    Write-Success "Command 'kata-agents' is ready"
}

Write-Host ""
Write-Host "---------------------------------------------------------------------"
Write-Host ""
Write-Success "Installation complete!"
Write-Host ""
Write-Host "  Kata Agents has been installed."
Write-Host ""
Write-Host "  Launch from:"
Write-Host "    - Start Menu or desktop shortcut"
Write-Host "    - Command line: kata-agents (restart terminal first)"
Write-Host ""
