const { google } = require('googleapis');

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const result = {};
      if (body) {
        body.split('&').forEach(pair => {
          const [k, v] = pair.split('=');
          if (k) {
            // decodeURIComponent rồi thay + thành khoảng trắng
            result[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
          }
        });
      }
      resolve(result);
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // CORS headers cho form submit
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await parseBody(req);
    const { name, email, phone, note } = body;

    if (!name || !email || !phone) {
      res.status(400).send(`
        <h2>❌ Thiếu thông tin bắt buộc</h2>
        <p>Vui lòng điền đầy đủ Tên, Email và SĐT.</p>
        <a href="/">← Quay lại</a>
      `);
      return;
    }

    // 3. Ghi vào Google Sheet
    if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      const sheets = google.sheets('v4');
      const auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      await sheets.spreadsheets.values.append({
        auth,
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'TTKH',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            new Date().toLocaleString('vi-VN'),
            name,
            email,
            phone,
            note || ''
          ]]
        }
      });
    }

    // 4. Chuyển hướng luôn sang sanpham.html (không popup, không gửi email cảm ơn, không gửi Discord)
    res.writeHead(302, { Location: '/sanpham.html' });
    res.end();
  } catch (error) {
    console.error('Error details:', error);
    res.status(500).send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Lỗi</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { background: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 5px; }
            .btn { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>❌ Có lỗi xảy ra</h2>
            <p>Vui lòng thử lại hoặc liên hệ hỗ trợ.</p>
            <p><strong>Chi tiết lỗi:</strong> ${error.message}</p>
            <br>
            <a href="/" class="btn">← Quay về trang chủ</a>
          </div>
        </body>
      </html>
    `);
  }
};
