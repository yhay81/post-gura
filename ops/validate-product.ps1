[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PagesPath = Join-Path $RepoRoot "src\ui\pages.tsx"
$ProductPath = Join-Path $RepoRoot "src\config\product.ts"
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$CorePath = Join-Path $RepoRoot "public\archive-core.js"
$ClientPath = Join-Path $RepoRoot "public\app.js"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_events.sql"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$PublicDirectory = Join-Path $RepoRoot "public"
$Pages = Get-Content -Raw -LiteralPath $PagesPath
$Product = Get-Content -Raw -LiteralPath $ProductPath
$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Core = Get-Content -Raw -LiteralPath $CorePath
$Client = Get-Content -Raw -LiteralPath $ClientPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath

if ($Pages.Contains('data-template-surface="replace-before-release"')) {
    throw "Replace the starter workspace before release"
}
if ($Pages.Contains('class="hero"') -or $Pages.Contains('class="product-flow"')) {
    throw "Text-led hero and generic product-flow sections are not releaseable"
}
if (-not $Pages.Contains('class="archive-stage"') -or
    -not $Pages.Contains('class="archive-crate"') -or
    -not $Pages.Contains('class="year-cabinet"') -or
    -not $Pages.Contains('class="result-slips"')) {
    throw "Expected the archive-to-cabinet-to-result visualization"
}
if (-not $Pages.Contains('id="archive-files"') -or
    -not $Pages.Contains('id="search-query"') -or
    -not $Pages.Contains('id="result-list"')) {
    throw "Expected import, search, and result workspaces"
}
if ($Pages -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア') {
    throw "Research copy must not appear on the product surface"
}
if (-not $Pages.Contains("アップロードしない") -or
    -not $Pages.Contains("DMを読まない") -or
    -not $Pages.Contains("ログイン不要")) {
    throw "Expected the local-only boundary on the product surface"
}
if (-not $Core.Contains("supportedNamePattern") -or
    $Core.Contains("direct-messages.js") -or
    $Core.Contains("direct-messages.json")) {
    throw "Expected a post-file allowlist with no direct-message support"
}
if ($Core -match '(?i)eval\(|new Function|innerHTML|direct-messages\.(js|json)') {
    throw "Archive data must never be executed or rendered as HTML, and DMs must remain unsupported"
}
if (-not $Core.Contains('DecompressionStream("deflate-raw")') -or
    -not $Core.Contains("ZIP64_EOCD_SIGNATURE") -or
    -not $Core.Contains("MAX_SELECTED_TEXT_BYTES")) {
    throw "Expected bounded ZIP and ZIP64 parsing"
}
if (-not $Client.Contains("indexedDB.open") -or
    -not $Client.Contains('sendTelemetry("archive_opened")') -or
    $Client.Contains("searchParams:")) {
    throw "Expected explicit local persistence and content-free telemetry"
}
if (-not $Worker.Contains("telemetryNames") -or
    -not $Worker.Contains("45 * 86400") -or
    $Migration -match '(?i)query|content|file_name|post_text|account') {
    throw "Telemetry must be allowlisted, content-free, and retained for 45 days"
}
if ($Product.Contains('"ano-hon-fuda"') -or $Product.Contains('"あの本札"')) {
    throw "Replace the previous product identity before release"
}
if ($Styles -match '(?s)\.import-panel h1.*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px') {
    throw "Primary heading is too large"
}

$OgPath = Join-Path $PublicDirectory "og.svg"
if (-not (Test-Path -LiteralPath $OgPath) -or (Get-Item -LiteralPath $OgPath).Length -lt 3000) {
    throw "Expected a product-specific OG SVG larger than 3 KB"
}

$KeyFiles = @(
    Get-ChildItem -LiteralPath $PublicDirectory -File |
        Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" }
)
if ($KeyFiles.Count -ne 1) {
    throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)"
}
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) {
    throw "IndexNow key file name and content do not match"
}

Write-Output "Product release contract is satisfied"
