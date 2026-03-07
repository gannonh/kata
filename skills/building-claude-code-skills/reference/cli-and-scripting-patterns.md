# CLI and Scripting Patterns Reference

## Philosophy: CLI-First, Right Tool for the Task

**Core principles:**
- Use CLI tools liberally (gh, aws, npm, git, jq, etc.)
- Prefer simple CLI commands over scripts when possible
- Choose the right scripting language for the task
- Provide complete, runnable commands
- Show command chaining patterns

## When to Use Each Approach

| Approach | Best For |
|----------|----------|
| **CLI commands** | Simple operations, quick lookups, piping data |
| **Bash scripts** | CLI chaining, file operations, git workflows, automation |
| **Python scripts** | Data science, ML, mature Python ecosystem (pandas, numpy) |
| **Node.js scripts** | JSON processing, web tasks, API integrations |

## CLI Tools to Leverage

### GitHub CLI (`gh`)

```bash
# View repository information
gh repo view --json name,description,url

# List and view pull requests
gh pr list --state open --limit 10
gh pr view 123 --json title,body,commits
gh pr diff 123

# Create pull requests
gh pr create --title "Feature: Add auth" --body "Implementation details..."

# Work with issues
gh issue list --label bug --limit 20
gh issue view 456
gh issue create --title "Bug: Login fails" --body "Description..."

# GitHub Actions workflows
gh run list --limit 10
gh run view 789
gh workflow run deploy.yml
```

### AWS CLI (`aws`)

```bash
# S3 operations
aws s3 ls s3://bucket-name/
aws s3 cp local-file.txt s3://bucket-name/
aws s3 sync ./dist/ s3://bucket-name/

# Lambda operations
aws lambda list-functions
aws lambda invoke --function-name my-function output.json
aws lambda get-function --function-name my-function

# DynamoDB operations
aws dynamodb scan --table-name MyTable
aws dynamodb get-item --table-name MyTable --key '{"id": {"S": "123"}}'

# CloudWatch Logs
aws logs tail /aws/lambda/my-function --follow
```

### Git CLI

```bash
# Repository inspection
git status
git log --oneline -10
git log --author="name" --since="2024-01-01"
git diff main...feature-branch
git blame filename.js

# Branch operations
git branch --list
git checkout -b new-feature

# Commit history
git show HEAD
git log --graph --all --oneline
```

### jq (JSON processor)

```bash
# Extract fields
echo '{"name": "John", "age": 30}' | jq '.name'

# Filter arrays
cat data.json | jq '.[] | select(.active == true)'

# Transform structure
cat input.json | jq '{id: .id, name: .user.name}'

# Combine with other CLI tools
gh pr view 123 --json title,author | jq '.author.login'
aws lambda get-function --function-name my-fn | jq '.Configuration.Environment'
```

### Command Chaining

```bash
# Sequential with &&
gh pr view 123 --json commits && git diff main...pr-123 && npm test

# Piping output
aws lambda list-functions | jq '.Functions[].FunctionName' | xargs -I {} echo "Function: {}"

# With error handling
gh pr diff 123 > changes.diff && cat changes.diff | wc -l && echo "Lines changed"
```

## Bash Scripting Patterns

**Best for:** CLI chaining, file operations, git workflows, simple automation

### File Processing

```bash
#!/bin/bash
# Filter and transform CSV
cat data.csv | grep "active" | cut -d',' -f1,3 > filtered.csv

# Process multiple files
for file in *.json; do
  echo "Processing $file"
  jq '.data' "$file" > "processed_$file"
done
```

### Git Workflows

```bash
#!/bin/bash
# Create a commit with context
BRANCH=$(git branch --show-current)
STATUS=$(git status --short)
DIFF=$(git diff --stat HEAD)

echo "Branch: $BRANCH"
echo "Status: $STATUS"
echo "Changes: $DIFF"

git add -A
git commit -m "$1"
```

### Error Handling

```bash
#!/bin/bash
set -e  # Exit on error

# Function with error handling
check_prerequisites() {
  if ! command -v gh &> /dev/null; then
    echo "Error: gh CLI not found"
    exit 1
  fi
}

check_prerequisites
gh pr list
```

## Python Scripting Patterns

**Best for:** Data science, ML, when pandas/numpy/scipy are needed

### Data Analysis with Pandas

```python
#!/usr/bin/env python3
import pandas as pd

# Load and analyze
df = pd.read_csv('data.csv')
print(f"Rows: {len(df)}")
print(df.describe())

# Filter and transform
active = df[df['status'] == 'active']
summary = active.groupby('category').agg({
    'value': ['mean', 'sum', 'count']
})

summary.to_csv('summary.csv')
```

### Working with JSON

```python
#!/usr/bin/env python3
import json
from pathlib import Path

# Load JSON
data = json.loads(Path('data.json').read_text())

# Process
filtered = [item for item in data if item['active']]
transformed = [{'id': item['id'], 'name': item['name']} for item in filtered]

# Save
Path('output.json').write_text(json.dumps(transformed, indent=2))
```

### API Integration

```python
#!/usr/bin/env python3
import requests

def fetch_data(url):
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

data = fetch_data('https://api.example.com/data')
print(f"Fetched {len(data)} records")
```

### ML/Scientific Computing

```python
#!/usr/bin/env python3
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression

# This is where Python excels - mature ML ecosystem
X = np.array([[1, 2], [3, 4], [5, 6]])
y = np.array([0, 1, 1])

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
model = LogisticRegression()
model.fit(X_train, y_train)
```

## Node.js Scripting Patterns

**Best for:** JSON processing, web tasks, async operations, API integrations

### File Operations with ESM

```javascript
#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'fs/promises';

// Read and process JSON
const data = JSON.parse(await readFile('data.json', 'utf-8'));
const filtered = data.filter(item => item.active);
await writeFile('output.json', JSON.stringify(filtered, null, 2));

// Process directory
const files = await readdir('./data');
for (const file of files) {
  console.log(`Found: ${file}`);
}
```

### Running CLI Commands

```javascript
#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Run CLI and parse output
const { stdout } = await execAsync('gh pr view 123 --json title,author');
const pr = JSON.parse(stdout);
console.log(`PR: ${pr.title} by ${pr.author.login}`);
```

### Async Patterns

```javascript
#!/usr/bin/env node
import { readFile } from 'fs/promises';

// Parallel processing
const files = ['file1.json', 'file2.json', 'file3.json'];
const contents = await Promise.all(
  files.map(f => readFile(f, 'utf-8'))
);

// Process results
const allData = contents.flatMap(c => JSON.parse(c));
console.log(`Total records: ${allData.length}`);
```

### API Integration

```javascript
#!/usr/bin/env node

// Fetch API (built-in Node.js 18+)
const response = await fetch('https://api.github.com/repos/owner/repo');
const data = await response.json();
console.log(data.name);
```

## Choosing the Right Tool

### Use Bash when:
- Chaining CLI commands together
- Simple file operations (copy, move, grep)
- Git operations and workflows
- Quick one-liners that can use pipes
- Shell environment manipulation

### Use Python when:
- Working with data science libraries (pandas, numpy, scipy)
- Machine learning tasks (scikit-learn, tensorflow)
- PDF processing (pdfplumber, PyPDF)
- Complex data transformations on tabular data
- The project already uses Python tooling

### Use Node.js when:
- Heavy JSON processing
- Web-related tasks and API integrations
- The project is JavaScript/TypeScript based
- Async operations with complex flow control
- When you need to call CLI tools and process their JSON output

## Complete Examples

### Bash: Git Workflow Script

```bash
#!/bin/bash
set -e

# Gather context
echo "=== Git Status ==="
git status --short

echo "=== Recent Commits ==="
git log --oneline -5

echo "=== Creating commit ==="
git add -A
git commit -m "$1"
git push
```

### Python: Data Analysis Script

```python
#!/usr/bin/env python3
import pandas as pd
import sys

def analyze_sales(filepath):
    df = pd.read_csv(filepath)

    summary = {
        'total_revenue': df['revenue'].sum(),
        'avg_order': df['revenue'].mean(),
        'top_product': df.groupby('product')['revenue'].sum().idxmax(),
        'orders_by_region': df.groupby('region').size().to_dict()
    }

    print(f"Total Revenue: ${summary['total_revenue']:,.2f}")
    print(f"Average Order: ${summary['avg_order']:,.2f}")
    print(f"Top Product: {summary['top_product']}")
    print(f"Orders by Region: {summary['orders_by_region']}")

if __name__ == '__main__':
    analyze_sales(sys.argv[1] if len(sys.argv) > 1 else 'sales.csv')
```

### Node.js: GitHub PR Analyzer

```javascript
#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function analyzePR(prNumber) {
  const { stdout } = await execAsync(
    `gh pr view ${prNumber} --json title,author,commits,additions,deletions`
  );
  const pr = JSON.parse(stdout);

  console.log('PR Analysis:');
  console.log(`  Title: ${pr.title}`);
  console.log(`  Author: ${pr.author.login}`);
  console.log(`  Commits: ${pr.commits.length}`);
  console.log(`  Lines: +${pr.additions} / -${pr.deletions}`);
}

const prNumber = process.argv[2];
if (!prNumber) {
  console.error('Usage: analyze-pr.js <pr-number>');
  process.exit(1);
}

analyzePR(prNumber);
```

## Best Practices

1. **Start with CLI** - Can a simple command or pipe solve this?
2. **Match the ecosystem** - Use Python for data science, Node for web/JSON
3. **Document dependencies** - List required tools and packages
4. **Handle errors gracefully** - Meaningful error messages
5. **Accept CLI arguments** - Make scripts flexible
6. **Keep scripts focused** - One clear purpose per script
7. **Use appropriate shebang** - `#!/bin/bash`, `#!/usr/bin/env python3`, `#!/usr/bin/env node`
