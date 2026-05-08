# Deploy EasyEletric SaaS v0.4

## Deploy local com PAT seguro

Nunca coloque o PAT no código. Use variável de ambiente.

### Bash

```bash
export GITHUB_TOKEN=seu_token
./scripts/deploy_local.sh
```

### PowerShell

```powershell
$env:GITHUB_TOKEN="seu_token"
./scripts/deploy_local.ps1
```

## GitHub Pages

1. Faça push para `main`.
2. Vá em Settings > Pages.
3. Em Build and deployment, selecione GitHub Actions.
4. Valide a workflow `Deploy static site to GitHub Pages`.

## Permissões mínimas do PAT para push

- Contents: Read and write.
- Metadata: Read-only.

## Permissões para workflow Pages

O workflow usa permissões do `GITHUB_TOKEN`:

- contents: read
- pages: write
- id-token: write
