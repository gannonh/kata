# Kata Agents Documentation

This directory contains the Mintlify documentation site for Kata Agents.

## Development

```bash
# Install Mintlify CLI
npm install -g mintlify

# Run development server
mintlify dev
```

The docs will be available at `http://localhost:3000`.

## Building

```bash
mintlify build
```

## Deploying

The docs are automatically deployed when changes are pushed to the main branch.

## Structure

- `mint.json` - Mintlify configuration
- `*.mdx` - Documentation pages
- `logo/` - Logo images (light/dark)
- `images/` - Screenshots and other images

## Adding Pages

1. Create a new `.mdx` file in the appropriate directory
2. Add front matter with title and description
3. Update `mint.json` navigation to include the new page
4. Test locally with `mintlify dev`

## Customization

Edit `mint.json` to customize:
- Colors and branding
- Navigation structure
- Social links
- Footer content
