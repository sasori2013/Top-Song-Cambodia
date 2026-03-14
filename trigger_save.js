const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function run() {
  const content = `業務日報 - 2026/03/11
================================

【実施項目】
ランキング更新システムの不具合解消とスケーラビリティの確保

【詳細】
1. SNAPSHOT処理の高速化: 1行ずつのGAS外部サービス呼び出しを廃止し、純粋なJS処理に書き換えることで、データ読み込み時間を280秒から1秒未満へ改善しました。
2. 30曲体制の維持: 読み込みの高速化により余裕が生まれたため、30曲すべてのAI分析を維持しつつ6分制限内での完結を実現しました。
3. AI分析の最適化: コメント取得数を100件から50件に調整し、API待機時間を削減しました。
4. 保存機能の復旧: Web API経由での保存に変更することで、Mac版と同様にチャット指示からDrive（ID: 1-T3b1IhAYA8Z6hY87i4QBbdRGxX9Vfyf）に直接保存できるようになりました。

【YouTube脚本用ヒント】
GASのタイムアウト対策には、Service Callの最小化が最も効果的である実例。`;

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
