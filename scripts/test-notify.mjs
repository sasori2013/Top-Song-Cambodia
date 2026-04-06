import { sendTelegramNotification } from './telegram-node.mjs';

async function testNotify() {
  console.log('Sending test notification...');
  try {
    await sendTelegramNotification('📢 <b>システム診断</b>\nテスト通知の送信を開始します。');
    console.log('Success!');
  } catch (err) {
    console.error('Failed:', err.message);
  }
}

testNotify().catch(console.error);
