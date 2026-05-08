#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/William-Naloto/easyeletric_saas.git"
BRANCH="main"
COMMIT_MSG="release: EasyEletric SaaS v0.3"

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "ERROR: GITHUB_TOKEN não definido. Exporte um token novo com Contents: read/write."
  exit 1
fi

if [[ ! -d .git ]]; then
  git init
  git branch -M "$BRANCH"
fi

git config user.name "William Naloto"
git config user.email "William-Naloto@users.noreply.github.com"

git add index.html README.md CHANGELOG.md .nojekyll .gitignore docs scripts releases
git commit -m "$COMMIT_MSG" || echo "Nada novo para commitar."

git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:${GITHUB_TOKEN}@github.com/William-Naloto/easyeletric_saas.git"

git push -u origin "$BRANCH"

git remote set-url origin "$REPO_URL"
echo "Deploy concluído. Remote restaurado sem token."
