import fetch from 'node-fetch';

export async function sendTelegramNotification(message) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim().replace(/^['"]|['"]$/g, '');
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim().replace(/^['"]|['"]$/g, '');

  if (!token || !chatId) {
    console.warn('Telegram token or chat ID is missing. Notification skipped.');
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML' // Allow simple bolding via <b> and </b>
      })
    });

    if (!res.ok) {
        console.error('Telegram notification failed with status', res.status);
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}
