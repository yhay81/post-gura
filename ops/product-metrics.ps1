[CmdletBinding()]
param(
    [switch]$Local
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute post-gura $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) {
    throw "D1 metrics query failed with exit code $LASTEXITCODE"
}

$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) {
    throw "D1 metrics query returned no result"
}

function Get-Percent {
    param([int]$Numerator, [int]$Denominator)
    if ($Denominator -eq 0) { return $null }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
$Openers = [int]$Row.archive_openers
$Searchers = [int]$Row.searchers

[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "post-gura"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        archive_openers = $Openers
        searchers = $Searchers
        exporters = [int]$Row.exporters
        local_savers = [int]$Row.local_savers
        local_reopeners = [int]$Row.local_reopeners
        clearers = [int]$Row.clearers
        returned = [int]$Row.returned
        users_7d = [int]$Row.users_7d
        archive_openers_7d = [int]$Row.archive_openers_7d
        searchers_7d = [int]$Row.searchers_7d
    }
    rates = [ordered]@{
        open_percent = Get-Percent $Openers $Users
        search_percent = Get-Percent $Searchers $Openers
        export_percent = Get-Percent ([int]$Row.exporters) $Openers
        local_reopen_percent = Get-Percent ([int]$Row.local_reopeners) ([int]$Row.local_savers)
        return_percent = Get-Percent ([int]$Row.returned) $Users
    }
} | ConvertTo-Json -Depth 4
