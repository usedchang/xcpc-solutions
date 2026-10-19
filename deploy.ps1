param(
  [Parameter(Mandatory = $true)]
  [string]$RepoUrl
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw '没有找到 git。请先安装 Git，或按 README 手动上传到 GitHub。'
}

if (-not (Test-Path '.git')) {
  git init
}

git add .
$changes = git status --porcelain
if ($changes) {
  git commit -m 'deploy tutorial studio'
}

git branch -M main

$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
  git remote set-url origin $RepoUrl
} else {
  git remote add origin $RepoUrl
}

git push -u origin main
Write-Host ''
Write-Host '推送完成。现在到 GitHub 仓库 Settings -> Pages，把 Source 设为 GitHub Actions。' -ForegroundColor Green
