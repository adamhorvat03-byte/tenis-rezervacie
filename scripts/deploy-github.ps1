param(
  [Parameter(Mandatory=$true, HelpMessage="Zadajte URL vášho GitHub repozitára, napr. https://github.com/meno/tenis-rezervacie.git")]
  [string]$RepoUrl
)

$ErrorActionPreference = "Stop"

Write-Host "==> Nastavujem hlavnú vetvu na 'main'..." -ForegroundColor Cyan
git branch -M main

if ((git remote) -contains "origin") {
  Write-Host "==> Aktualizujem existujúci remote 'origin' na $RepoUrl..." -ForegroundColor Cyan
  git remote set-url origin $RepoUrl
} else {
  Write-Host "==> Pridávam remote 'origin' ($RepoUrl)..." -ForegroundColor Cyan
  git remote add origin $RepoUrl
}

Write-Host "==> Odosielam kód na GitHub (git push -u origin main)..." -ForegroundColor Cyan
git push -u origin main

Write-Host "`n✓ Repozitár bol úspešne odoslaný na GitHub!" -ForegroundColor Green
Write-Host "Ďalší krok: Otvorte https://app.netlify.com -> Add new site -> Import an existing project -> vyberte tento GitHub repozitár." -ForegroundColor Yellow
