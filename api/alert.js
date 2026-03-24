export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method Not Allowed',
    });
  }

  try {
    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : (req.body || {});

    const source = String(body.source || '').trim();
    const type = String(body.type || '').trim();
    const message = String(body.message || '').trim();
    const sessionId = String(body.sessionId || '').trim();
    const subid = String(body.subid || '').trim();
    const chatflowId = String(body.chatflowId || '').trim();
    const question = String(body.question || '').trim();
    const extra = body.extra || {};

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return res.status(500).json({
        success: false,
        message: 'Telegram env is missing',
      });
    }

    const lines = [
      '🚨 ALERT',
      `Source: ${source || '-'}`,
      `Type: ${type || '-'}`,
      `Message: ${message || '-'}`,
      `Session: ${sessionId || '-'}`,
      `Subid: ${subid || '-'}`,
      `Chatflow: ${chatflowId || '-'}`,
      `Question: ${question || '-'}`,
    ];

    if (extra && Object.keys(extra).length > 0) {
      lines.push(`Extra: ${JSON.stringify(extra)}`);
    }

    const text = lines.join('\n');

    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    const tgData = await tgResponse.json();

    if (!tgResponse.ok || !tgData.ok) {
      return res.status(500).json({
        success: false,
        message: 'Telegram send failed',
        telegram_response: tgData,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Alert sent',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
