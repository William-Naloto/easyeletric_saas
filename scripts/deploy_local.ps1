$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/William-Naloto/easyeletric_saas.git"
$Branch = "main"
$CommitMsg = "release: EasyEletric SaaS v0.3"

if (-not $env:GITHUB_TOKEN) {
  Write-Error "GITHUB_TOKEN não definido. Crie um token novo com Contents: read/write e defina em variável de ambiente."
}

if (-not (Test-Path ".git")) {
  git init
  git branch -M $Branch
}

git config user.name "William Naloto"
git config user.email "William-Naloto@users.noreply.github.com"

git add index.html README.md CHANGELOG.md .nojekyll .gitignore docs scripts releases
try { git commit -m $CommitMsg } catch { Write-Host "Nada novo para commitar." }

try { git remote remove origin } catch {}
git remote add origin "https://x-access-token:$env:GITHUB_TOKEN@github.com/William-Naloto/easyeletric_saas.git"

git push -u origin $Branch

git remote set-url origin $RepoUrl
Write-Host "Deploy concluído. Remote restaurado sem token."
