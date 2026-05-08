#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/William-Naloto/easyeletric_saas.git"
BRANCH="main"

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "ERROR: set GITHUB_TOKEN before running."
  exit 1
fi

git init
git checkout -B "$BRANCH"
git add .
git commit -m "release: EasyEletric SaaS v0.4" || true
git remote remove origin 2>/dev/null || true
git remote add origin "https://William-Naloto:${GITHUB_TOKEN}@github.com/William-Naloto/easyeletric_saas.git"
git push -u origin "$BRANCH"

echo "Deploy pushed. Validate GitHub Actions > Deploy static site to GitHub Pages."
