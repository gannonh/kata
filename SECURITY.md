# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in Kata Agents, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please use one of the following methods:

1. **GitHub Security Advisories**: Report via [GitHub Security Advisories](https://github.com/gannonh/kata-agents/security/advisories)
2. **Email**: Contact the maintainer directly

Include the following information:
- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 7 days
- **Resolution Timeline**: We aim to resolve critical issues within 30 days

### Scope

This policy applies to:
- The Kata Agents application
- The `@craft-agent/*` npm packages (as used in this fork)
- This repository

### Out of Scope

- Third-party dependencies (report to their maintainers)
- Social engineering attacks
- Denial of service attacks

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest | :x:               |

We only provide security updates for the latest version. Please keep your installation up to date.

## Security Best Practices

When using Kata Agents:

1. **Keep credentials secure**: Never commit `.env` files or credentials
2. **Use environment variables**: Store secrets in environment variables
3. **Review permissions**: Be cautious with "Execute" permission mode
4. **Update regularly**: Keep the application updated

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers who report valid vulnerabilities (with their permission).
