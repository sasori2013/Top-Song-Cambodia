# YouTube Ranking System: Knowledge Base & Postmortem

本書は、YouTubeのデータ取得からランキング生成、Facebookへの自動投稿を行う本システムのアーキテクチャ、および開発中に直面した主要な問題とその解決策をまとめたものです。今後の類似プロジェクトの基盤資料として活用してください。

## 1. システム構成（構築方法）

本システムは、完全サーバーレスかつランニングコストゼロで構築されています。

*   **バックエンド＆スケジューラー:** Google Apps Script (GAS)
    *   定期実行タイマー（Time-driven Triggers）を利用し、日次・週次の処理を完全自動化。
*   **データベース:** Google Sheets
    *   楽曲リスト（対象URL）、日々の視聴回数スナップショット、ランキング結果の保存先として機能。視覚的なデータ確認・手動修正も容易。
*   **データソース:** YouTube Data API v3
    *   指定した動画IDの視聴回数（viewCount）を定期取得。
*   **SNS連携:** Facebook Graph API (v19.0+)
    *   生成されたランキング情報をFacebookの指定ページ（Page）へ自動投稿し、自己コメントとしてTOP20の詳細リンクを付与。
*   **フロントエンド:** Next.js (Vercel) + GAS Web API
    *   GASの `doGet` 関数をWeb APIとして公開し、Next.js側でJSONデータを取得・レンダリング。

---

## 2. 遭遇した問題と解決方法（トラブルシューティング）

### 2.1. Facebook Graph API 関連（最難関）

開発中、SNS連携において権限周りとAPIの仕様変更による謎のエラーに最も時間を費やしました。

#### 問題1: 投稿が「自分（開発者）にしか見えない」
*   **原因:** Facebookアプリが「開発モード（Development Mode）」になっていたため。
*   **解決方法:** 
    1. Facebook Developersダッシュボードで、アプリの設定（基本）に「プライバシーポリシーURL」を設定。
    2. ダッシュボード左メニューの「公開（Publish）」からアプリを**「ライブモード（Live）」**に切り替える。

#### 問題2: 自動投稿は成功するが、自動コメント付与時に `403 Forbidden` エラーになる
*   **原因:** 発行したアクセストークンにコメント用の権限（`pages_manage_engagement`）が不足していた。また、PageトークンではなくUserトークンを使っていた。
*   **解決方法:**
    *   必要な権限: `pages_manage_posts` (投稿用), `pages_manage_engagement` (コメント・いいね等用), `pages_show_list`, `pages_read_engagement`, `public_profile`。
    *   必ず **Graph API Explorer** で「User or Page」ドロップダウンから対象の**Page（HEAT等のページ名）**を選択し、**Page Access Token** を発行する。

#### 問題3: Graph API Explorerで権限追加時に無限ループ（Invalid Scopes）に陥る
*   **原因:** Facebook側のキャッシュやUIのバグにより、アプリに未登録の古い権限（`pages_read_user_content` など）が自動リクエストされ、「不正な権限」として永遠に弾かれ続ける現象。
*   **解決方法:** 
    1.  **クリーン・スレート（最強の解決策）:** Facebook個人の「設定 -> ビジネス統合」から対象アプリを一度「削除（Remove）」し、連携を強制リセットしてから再度アクセストークンを発行する。
    2.  **直接認証URLの使用:** エラーの原因となる権限を除外したOAuth認証URLを自作し、直接アクセスしてトークンを生成する。

#### 問題4: 投稿ID（Post ID）の形式がAPIバージョンや状況で変動する
*   **原因:** 投稿成功時に返されるIDが `971418716059046_122102310909266585` のような `PageID_PostID` 形式の時と、単一の識別子（`122102...`）の時があり、そのままコメントAPI (`/{post_id}/comments`) に渡すとエラーになる。
*   **解決方法:** 
    *   GAS側で受け取ったIDを `String.split('_')` で分割し、後ろの部分（実際のPost ID）を抽出。Page IDと結合して正確なエンドポイントURLを構築するよう、堅牢な正規化処理コード（`Main.gs`）を実装した。

#### 問題5: トークンの有効期限がすぐに切れる（1時間）
*   **原因:** デフォルトで発行されるのは短期トークン（Short-lived token）。
*   **解決方法:**
    *   「アクセストークンデバッガー」画面下部の **「アクセストークンを延長 (Extend Access Token)」** を実行し、**約60日間有効な長期トークン（Long-lived token）** に変換してから環境変数（GASのスクリプトプロパティ等）に保存する。（※60日ごとの手動更新をカレンダーに登録して運用）

---

### 2.2. Google Apps Script (GAS) 関連

#### 問題1: ローカル環境（VS Code等）とGASエディタのコードの乖離
*   **解決方法:** `clasp`（Command Line Apps Script Projects）を導入。
    *   ターミナルで `npx clasp pull` で最新のGASコードをローカルに取得。
    *   `npx clasp push` で手元のモダンなエディタで書いたコードをGASに一括反映。
    *   これにより、Git（GitHub）でのバージョン管理と連携しながらのチーム開発やマルチデバイス開発（Mac/Win両立）が可能になった。

---

### 2.3. YouTube Data API 関連

#### 問題1: 実行時間が6分を超えるとタイムアウトで強制終了する＆API制限
*   **原因:** GASの仕様（1回の実行は最大6分）。動画が何百件もある際に、1件ずつAPIを叩くと「時間切れ」と「1日のリクエスト制限（Quota）」に引っかかる。
*   **解決方法:** 
    *   **バッチ処理化:** YouTube APIリクエスト実行時、1件ずつではなく `maxResults=50` を利用し、カンマ区切りのID（`id1,id2,id3...`）を渡すことで、**最大50件のデータを1回のAPIリクエストで一括取得**するよう最適化した。

---

## 3. 次のプロジェクトへの教訓（Best Practices）

1.  **外部API（特にMeta/Facebook）の仕様は「疑ってかかる」**
    *   公式ドキュメントが現状と合っていないことが多々あります。「アクセストークンデバッガー」と「Graph API Explorer」を常に併用し、自分が持っているトークンの**「権限（Scopes）」**と**「種別（User or Page）」**を一次情報として確認しながら進めるのが鉄則です。
2.  **GASでのデータベース（スプレッドシート）操作は「一括処理（Bulk）」が基本**
    *   GASのループ内で `getValue()` や `setValue()` を呼び出すと極端に遅くなります。必ず `getValues()` で二次元配列として全データを一括取得し、メモリ上で処理した後、最後に一度だけ `setValues()` で一括書き込みするアーキテクチャにすること。
3.  **シークレット情報は「スクリプトプロパティ」へ**
    *   FacebookトークンやYouTube APIキーなどの機密情報をコード（`.gs`ファイル）に直書きすると、GitHub公開時などに漏洩します。必ずGASの「スクリプトプロパティ」に保存し、コードからは `PropertiesService.getScriptProperties().getProperty(...)` で呼び出す設計を徹底すること。

---
*Created by Antigravity (AI Assistant) based on project development history.*
