#!/bin/bash
# import_migration.sh
# Mac側で実行して、移行ファイルを適切な場所に配置します

# 1. 秘匿ファイルを現在のディレクトリ（リポジトリ内）に配置
cp .env.local ../ 2>/dev/null
cp google-credentials.json ../ 2>/dev/null

# 2. Antigravityのコンテキスト（brain）を配置
# Mac側の brain フォルダの場所を確認する必要があります
# 通常は ~/Library/Application Support/antigravity/brain/ ですが
# 実際のパスに合わせて調整が必要です。
MAC_BRAIN_BASE="$HOME/Library/Application Support/antigravity/brain"
CONV_ID="c0d61a29-68c2-46da-8122-05b4bc55ff55"

if [ -d "brain" ]; then
    mkdir -p "$MAC_BRAIN_BASE"
    cp -R brain "$MAC_BRAIN_BASE/$CONV_ID"
    echo "Antigravity context restored to Mac."
fi

echo "Done! Please run 'npm install' in the project root."
