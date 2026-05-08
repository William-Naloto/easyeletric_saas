$ErrorActionPreference = "Stop"
$Branch = "main"

if (-not $env:GITHUB_TOKEN) {
  Write-Error "Set GITHUB_TOKEN before running."
}

git init
git checkout -B $Branch
git add .
git commit -m "release: EasyEletric SaaS v0.4"
git remote remove origin 2>$null
git remote add origin "https://William-Naloto:$env:GITHUB_TOKEN@github.com/William-Naloto/easyeletric_saas.git"
git push -u origin $Branch

Write-Host "Deploy pushed. Validate GitHub Actions > Deploy static site to GitHub Pages."
