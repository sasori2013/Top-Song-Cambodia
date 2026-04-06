import { sendTelegramNotification } from './telegram-node.mjs';

async function testDeletedNotify() {
  const missingVideos = [
    { id: 'UCrmidtzX3ZPVxYRjTI6V6tA', artist: 'VannDa', title: 'Deleted Song Test' },
    { id: 'dQw4w9WgXcQ', artist: 'Rick Astley', title: 'Never Gonna Give You Up (Mock Deleted)' }
  ];

  const listStr = missingVideos.map(m => 
    `- ${m.artist}: ${m.title}\n  <a href="https://youtu.be/${m.id}">🔗 リンクを表示</a>`
  ).join('\n');

  const message = `⚠️ <b>警告: ${missingVideos.length}件の動画が非公開/削除されました</b>\n` +
                 `シート上で「[DELETED/PRIVATE]」とマークしました。\n\n` +
                 listStr;

  console.log('Sending detailed Telegram notification...');
  try {
    await sendTelegramNotification(message);
    console.log('Success!');
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

testDeletedNotify().catch(console.error);
