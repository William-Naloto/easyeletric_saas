# Deploy Git Repository — EasyEletric SaaS

Repositório alvo:

```text
https://github.com/William-Naloto/easyeletric_saas
```

## Importante sobre segurança

Não salve PAT no código, no README, em scripts versionados ou no histórico do terminal.

Use uma das opções:

1. GitHub CLI com autenticação interativa:

```bash
gh auth login
```

2. Variável de ambiente temporária:

```bash
export GITHUB_TOKEN="SEU_TOKEN_NOVO_AQUI"
```

3. Git Credential Manager.

## Permissões recomendadas do fine-grained PAT

Para push básico no repositório:

- Repository access: `Only select repositories` → `William-Naloto/easyeletric_saas`
- Metadata: Read-only
- Contents: Read and write

Opcional:

- Pull requests: Read and write, se for abrir PR em vez de push direto.
- Pages: Read and write, se configurar GitHub Pages via API.
- Workflows: Read and write, somente se for alterar arquivos em `.github/workflows`.

## Comandos locais de deploy

### Linux/macOS/Git Bash

```bash
cd easyeletric_saas_v0_3_repo
export GITHUB_TOKEN="SEU_TOKEN_NOVO_AQUI"
bash scripts/deploy_local.sh
```

### PowerShell

```powershell
cd easyeletric_saas_v0_3_repo
$env:GITHUB_TOKEN="SEU_TOKEN_NOVO_AQUI"
.\scripts\deploy_local.ps1
```

## GitHub Pages

Depois do push:

1. Abrir GitHub → repositório `easyeletric_saas`.
2. Settings → Pages.
3. Source: `Deploy from a branch`.
4. Branch: `main`.
5. Folder: `/root`.
6. Save.

## Vercel/Netlify

- Framework: Other/static.
- Build command: vazio.
- Output directory: `/`.
- Entry file: `index.html`.
