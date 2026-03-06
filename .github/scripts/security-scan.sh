#!/usr/bin/env bash
# ==============================================================================
# Security scan for the public piut docs repo.
#
# Scans ALL tracked files (excluding CI scripts and the sensitive-guard
# library + its tests, which contain detection patterns and fake test data)
# for secrets,
# credentials, internal architecture details, and other sensitive data that
# must never appear in a public repo.
#
# Exit codes:
#   0 — clean
#   1 — violations found (blocks merge)
# ==============================================================================
set -euo pipefail

VIOLATIONS=0

echo "=== piut Public Repo Security Scan ==="
echo ""

# --- Helper -------------------------------------------------------------------
# Scans all tracked files except CI scripts and the sensitive-guard module
# (which contain detection patterns and fake test data, not real secrets).
scan() {
  local label="$1"
  local pattern="$2"
  local matches

  matches=$(git ls-files -z \
    | grep -zv '\.github/scripts/security-scan\.sh' \
    | grep -zv '\.github/workflows/security-scan\.yml' \
    | grep -zv 'src/lib/sensitive-guard\.ts' \
    | grep -zv '__tests__/sensitive-guard\.test\.ts' \
    | xargs -0 grep -rlE "$pattern" 2>/dev/null || true)

  if [ -n "$matches" ]; then
    echo "BLOCKED: $label"
    echo "  Pattern: $pattern"
    echo "  Found in:"
    echo "$matches" | while IFS= read -r f; do
      echo "    $f"
      grep -nE "$pattern" "$f" 2>/dev/null | head -3 | sed 's/^/      /'
    done
    echo ""
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

# ==============================================================================
# 1. API KEYS & TOKENS
# ==============================================================================
echo "--- Checking for API keys & tokens ---"

scan "JWT / Supabase key"              'eyJ[A-Za-z0-9_-]{20,}'
scan "Stripe live secret key"          'sk_live_[A-Za-z0-9]+'
scan "Stripe test secret key"          'sk_test_[A-Za-z0-9]{10,}'
scan "Stripe webhook secret"           'whsec_[A-Za-z0-9]+'
scan "Anthropic API key"               'sk-ant-[A-Za-z0-9_-]+'
scan "Resend API key"                  're_[A-Za-z0-9]{20,}'
scan "Generic private key block"       '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----'
scan "AWS access key"                  'AKIA[0-9A-Z]{16}'
scan "GitHub personal access token"    'ghp_[A-Za-z0-9]{36}'

# ==============================================================================
# 2. SUPABASE PROJECT IDS & URLS
# ==============================================================================
echo "--- Checking for Supabase identifiers ---"

scan "Dev Supabase project ID"         'xjgmsqozthhxbkzrhshj'
scan "Prod Supabase project ID"        'erprxtsdamvaaqnybtsg'
scan "Supabase URL with path"          'supabase\.co/[a-z]'

# ==============================================================================
# 3. ENVIRONMENT VARIABLE NAMES (internal-only)
# ==============================================================================
echo "--- Checking for internal env var references ---"

scan "SUPABASE_SERVICE_ROLE_KEY"       'SUPABASE_SERVICE_ROLE_KEY'
scan "ANTHROPIC_API_KEY"               'ANTHROPIC_API_KEY'
scan "RESEND_API_KEY"                  'RESEND_API_KEY'
scan "STRIPE_SECRET_KEY"               'STRIPE_SECRET_KEY'
scan "STRIPE_WEBHOOK_SECRET"           'STRIPE_WEBHOOK_SECRET'
scan "Reference to .env.local"         '\.env\.local'

# ==============================================================================
# 4. INTERNAL ARCHITECTURE (source code, file paths, internal docs)
# ==============================================================================
echo "--- Checking for internal architecture leaks ---"

scan "sbaas import alias"              "from ['\"]@/"
scan "Internal docs reference"         'docs/(ARCHITECTURE|API_ROUTES|COMPONENTS|LIB)\.md'
scan "Database table with schema"      'public\.(users|brains|subscriptions|encryption_keys|profiles|brain_sections)'
scan "Internal file path"              '/Users/brian/'

# Note: /api/mcp/ is the PUBLIC endpoint — only flag internal API routes.
scan "Internal API path"               '/api/(auth|webhooks|brain|stripe|admin)/'

# ==============================================================================
# RESULT
# ==============================================================================
echo ""
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "================================================"
  echo "FAILED: $VIOLATIONS security violation(s) found."
  echo "================================================"
  echo ""
  echo "This repo is PUBLIC. Remove all flagged content before merging."
  exit 1
else
  echo "================================================"
  echo "PASSED: No secrets or sensitive data detected."
  echo "================================================"
  exit 0
fi
