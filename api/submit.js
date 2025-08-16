const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const axios = require('axios');

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

    // 1. Gửi email xác nhận
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: email,
      subject: 'Cảm ơn bạn đã đăng ký dịch vụ của chúng tôi',
      html: `
        <h2>Cảm ơn bạn đã liên hệ!</h2>
        <p>Xin chào <strong>${name}</strong>,</p>
        <p>Chúng tôi đã nhận được thông tin của bạn:</p>
        <ul>
          <li><strong>Tên:</strong> ${name}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>SĐT:</strong> ${phone}</li>
          <li><strong>Ghi chú:</strong> ${note || 'Không có'}</li>
        </ul>
        <p>Chúng tôi sẽ liên hệ lại trong thời gian sớm nhất.</p>
        <p>Trân trọng!</p>
      `
    });

    // 2. Gửi Discord webhook
    if (process.env.DISCORD_WEBHOOK_URL) {
      await axios.post(process.env.DISCORD_WEBHOOK_URL, {
        content: `🆕 **KHÁCH HÀNG MỚI**\n📝 **Tên:** ${name}\n📧 **Email:** ${email}\n📱 **SĐT:** ${phone}\n💬 **Ghi chú:** ${note || 'Không có'}\n🕐 **Thời gian:** ${new Date().toLocaleString('vi-VN')}`
      });
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

    res.status(200).send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Thành công</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 5px; }
            .btn { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="success">
            <h2>✅ Gửi thông tin thành công!</h2>
            <p>Cảm ơn <strong>${name}</strong> đã liên hệ với chúng tôi!</p>
            <p>📧 Vui lòng kiểm tra email <strong>${email}</strong> để xem thông tin xác nhận.</p>
            <p>📱 Chúng tôi sẽ liên hệ lại qua số <strong>${phone}</strong> trong thời gian sớm nhất.</p>
            <br>
            <a href="/sanpham.html" class="btn">Hãy đến trang báo giá →</a>
          </div>
        </body>
      </html>
    `);
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
