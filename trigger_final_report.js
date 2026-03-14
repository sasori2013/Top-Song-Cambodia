const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function run() {
  const content = `業務日報：ランキング更新システムの抜本的改善報告 (2026/03/11)
================================================================

【1. 問題と原因】
3月10日〜11日の自動更新がGASの6分制限でタイムアウト失敗。
原因はSNAPSHOTシート（8,200行）走査中の高コストな外部サービス呼出の蓄積。

【2. 修正内容】
- データ読込処理を純粋なJS処理に置換し、逆順スキャンに変更。
- 読込時間を「280秒」から「1秒未満」へ100倍以上の高速化。
- AI分析（30曲維持）のコメント取得数を50件に最適化。

【3. 今後の影響】
- データ増に左右されないスケーラビリティを確保。
- Antigravityから直接Driveへ日報を保存する自動連携機能を確立。

保存先フォルダ：1-T3b1IhAYA8Z6hY87i4QBbdRGxX9Vfyf
`;

  const url = `https://script.google.com/macros/s/AKfycbwcCVTf4NPMO2NHdqeQ5OolplixthM4vUwYeyCKJaA1vpp48dG9NBwGG0wI781bfrxBkg/exec?action=save_report&content=${encodeURIComponent(content)}`;
  
  try {
    const res = await fetch(url);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

run();
