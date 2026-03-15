# export_migration.ps1
# WindowsからMacへの移行用パッケージを作成します

$exportDir = "migration_package"
if (Test-Path $exportDir) { Remove-Item -Recurse -Force $exportDir }
New-Item -ItemType Directory -Path $exportDir

# 1. リポジトリ内の無視された重要なファイルをコピー
$filesToCopy = @(".env.local", "google-credentials.json")
foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        Copy-Item $file -Destination $exportDir
        Write-Host "Copied: $file"
    }
}

# 2. Antigravityの脳フォルダをコピー
$brainSource = "C:\Users\kenxx\.gemini\antigravity\brain\c0d61a29-68c2-46da-8122-05b4bc55ff55"
$brainDest = Join-Path $exportDir "brain"
if (Test-Path $brainSource) {
    Copy-Item -Recurse $brainSource -Destination $brainDest
    Write-Host "Copied Antigravity context (brain folder)"
}

# 3. ZIP圧縮
$zipFile = "migration.zip"
if (Test-Path $zipFile) { Remove-Item $zipFile }
Compress-Archive -Path "$exportDir\*" -DestinationPath $zipFile

Write-Host "`n完了！ $zipFile をMacに送ってください。"
Write-Host "Mac側で解凍して配置するための手順も別途お伝えします。"
