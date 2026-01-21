#!/bin/bash

# Script to replace "gsd" and "get-shit-done" with "kata" in all .md files
# across agents, kata, hooks, commands, and skills directories

set -e

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories to search
DIRS=("agents" "kata" "hooks" "commands" "skills")

# Track statistics
total_files=0
modified_files=0
total_replacements=0

echo -e "${BLUE}=== GSD to KATA Replacement Script ===${NC}\n"

# Create a temporary file to store results
RESULTS_FILE=$(mktemp)

# Function to process a single file
process_file() {
    local file="$1"
    local replacements=0

    # Create a backup
    cp "$file" "$file.bak"

    # Perform replacements and count them
    # Replace case variations of "get-shit-done"
    replacements=$((replacements + $(grep -o "get-shit-done" "$file" | wc -l)))
    sed -i.tmp 's/get-shit-done/kata/g' "$file"

    replacements=$((replacements + $(grep -o "Get-Shit-Done" "$file.bak" | wc -l)))
    sed -i.tmp 's/Get-Shit-Done/Kata/g' "$file"

    replacements=$((replacements + $(grep -o "GET-SHIT-DONE" "$file.bak" | wc -l)))
    sed -i.tmp 's/GET-SHIT-DONE/KATA/g' "$file"

    # Replace case variations of "gsd" (but not as part of longer words)
    replacements=$((replacements + $(grep -oE '\bgsd\b' "$file.bak" | wc -l)))
    sed -i.tmp 's/\bgsd\b/kata/g' "$file"

    replacements=$((replacements + $(grep -oE '\bGSD\b' "$file.bak" | wc -l)))
    sed -i.tmp 's/\bGSD\b/KATA/g' "$file"

    replacements=$((replacements + $(grep -oE '\bGsd\b' "$file.bak" | wc -l)))
    sed -i.tmp 's/\bGsd\b/Kata/g' "$file"

    # Clean up temp file
    rm -f "$file.tmp"

    # If changes were made, report it
    if [ $replacements -gt 0 ]; then
        echo "$file: $replacements replacements" >> "$RESULTS_FILE"
        modified_files=$((modified_files + 1))
        total_replacements=$((total_replacements + replacements))
        rm "$file.bak"
    else
        # No changes, restore from backup
        mv "$file.bak" "$file"
    fi

    total_files=$((total_files + 1))
}

# Process each directory
for dir in "${DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${YELLOW}Processing directory: $dir${NC}"

        # Find all .md files and process them
        while IFS= read -r -d '' file; do
            process_file "$file"
        done < <(find "$dir" -type f -name "*.md" -print0)
    else
        echo -e "${YELLOW}Warning: Directory '$dir' not found, skipping...${NC}"
    fi
done

# Display results
echo -e "\n${BLUE}=== Results ===${NC}\n"

if [ $modified_files -gt 0 ]; then
    echo -e "${GREEN}Modified files:${NC}\n"
    cat "$RESULTS_FILE"
    echo ""
fi

echo -e "${GREEN}Summary:${NC}"
echo "  Total files scanned: $total_files"
echo "  Files modified: $modified_files"
echo "  Total replacements: $total_replacements"

# Cleanup
rm -f "$RESULTS_FILE"

echo -e "\n${BLUE}=== Complete ===${NC}"
