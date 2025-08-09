import { google } from 'googleapis';
import nodemailer from 'nodemailer';

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });

export default async function handler(req, res) {
  // Nếu là POST: gửi email báo giá
  if (req.method === 'POST') {
    try {
      await auth.authorize();

      // Lấy email khách hàng mới nhất từ Sheet "TTKH" (cột C)
      const sheetId = process.env.GOOGLE_SHEET_ID;
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'TTKH!C:C'
      });
      const emails = resp.data.values.filter(r => r[0]);
      const email = emails.length ? emails[emails.length - 1][0] : null;
      if (!email) throw new Error('Không tìm thấy email khách hàng');

      // Nhận dữ liệu gửi từ frontend
      const { tenDa, hangmucRows, giaCongRows } = req.body;

      // Thiết kế HTML email báo giá: kẻ khung rõ ràng cho cả tiêu đề & nội dung bảng
      const emailContent = `
        <div style="background:#f7fafc;padding:32px 12px;border-radius:12px;">
          <h2 style="text-align:center;color:#168c3c;font-size:25px;font-weight:bold;letter-spacing:1px;margin-bottom:18px;">
            BẢNG BÁO GIÁ STONECARE
          </h2>
          <div style="max-width:450px;margin:0 auto;background:#fff;border-radius:10px;padding:24px 18px;box-shadow:0 2px 12px #e0e0e0;border:1.5px solid #168c3c;">
            <div style="font-size:20px;color:#197b30;font-weight:bold;text-align:center;margin-bottom:13px;">
              ${tenDa}
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
              <thead>
              <tr style="background:#d0f5d8;color:#168c3c;">
              <th style="border:1.5px solid #168c3c;padding:8px;text-align:center;font-size:15px;">Stt</th>
              <th style="border:1.5px solid #168c3c;padding:8px;text-align:center;font-size:15px;">Hạng mục</th>
              <th style="border:1.5px solid #168c3c;padding:8px;text-align:center;font-size:15px;">Dvt</th>
              <th style="border:1.5px solid #168c3c;padding:8px;text-align:center;width:100px;min-width:75px;font-size:15px;">Đơn giá cung cấp</th>
              <th style="border:1.5px solid #168c3c;padding:8px;text-align:center;width:110px;min-width:75px;font-size:15px;">Đơn giá lắp đặt</th>
              </tr> 
              </thead>
              <tbody>
                ${addTableBorderToRows(hangmucRows)}
              </tbody>
            </table>
            <div style="font-weight:bold;color:#198b3a;margin:12px 0 6px 0;font-size:15px;">Đơn giá gia công sản phẩm</div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
            <tbody style="font-size:15px;">
            ${addTableBorderToGiaCongRows(giaCongRows)}
            </tbody>
            </table>
            <div style="font-size:15px;color:#c7212e;margin-top:18px;margin-bottom:5px;">
              <b>Ghi chú:</b> <span style="color:#222;font-style:italic;">
                1. Đơn giá trên là tạm tính, đơn giá chính xác phụ thuộc vào khối lượng, tính chất công trình/dự án.<br>
                2. Đơn giá gốc (Đơn giá gồm cung cấp và thi công) cộng thêm 10% vào đơn giá cung cấp và thi công ở trên.
              </span>
            </div>
            <div style="margin-top:18px;font-size:17px;color:#444;text-align:center;">
              Mọi thắc mắc xin liên hệ: <b style="color:#ed1c24;font-size:18px;">Hotline 0908 221 117</b>
            </div>
          </div>
          <div style="margin-top:22px;text-align:center;color:#888;font-size:14px;">Công ty Stonecare Việt Nam xin cảm ơn quý khách!</div>
        </div>
      `;

      // Hàm thêm border cho từng cell của hàng bảng hạng mục
      function addTableBorderToRows(rowsHtml) {
        return rowsHtml.replace(/<td([^>]*)>/g, '<td$1 style="border:1.5px solid #168c3c;padding:7px 0;text-align:center;font-size:15px;">');
      }
      // Hàm thêm border cho bảng gia công sản phẩm (2 cột, căn trái/phải)
      function addTableBorderToGiaCongRows(rowsHtml) {
        // Cột trái căn trái, cột phải căn phải
        return rowsHtml
          .replace(/<td([^>]*)>/g, (m, attr, offset, str) => {
            // Nếu là cột đầu thì căn trái, còn lại căn phải
            if ((str.slice(0, offset).match(/<tr>/g) || []).length === (str.slice(0, offset).match(/<\/tr>/g) || []).length) {
              // Đầu hàng mới, cột đầu
              return `<td${attr} style="border:1.5px solid #168c3c;padding:7px 0;text-align:left;">`;
            } else {
               return `<td${attr} style="border:1.5px solid #168c3c;padding:7px 0;text-align:center;font-size:15px;">`;
            }
          });
      }

      // Gửi email
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
        subject: `Bảng báo giá đá ${tenDa} - Công ty Stonecare Việt Nam`,
        html: emailContent
      });

      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // Nếu là GET: trả về dữ liệu sản phẩm và giá như cũ
  try {
    await auth.authorize();

    // Lấy danh sách sản phẩm (A2:J)
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'DM SP!A2:J',
    });
    const rows = data.values || [];
    const products = rows.map(r => ({
      loaiDa: r[1] || '',
      tenDa: r[2] || '',
      hinhAnh: r[3] || '',
      latNen: r[4] || '',
      cauThang: r[5] || '',
      matTien: r[6] || '',
      bep: r[7] || '',
      cot: r[8] || '',
      tamCap: r[9] || ''
    }));

    // Lấy ĐƠN GIÁ GIA CÔNG (N4:O)
    const { data: dgGiaCong } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'DM SP!N4:O',
    });
    const giaCongArr = (dgGiaCong.values || []).map(row => ({
      name: row[0] || '',
      value: row[1] || ''
    }));

    // Lấy ĐƠN GIÁ LẮP ĐẶT (Q4:R)
    const { data: dgLapDat } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'DM SP!Q4:R',
    });
    const lapDatArr = (dgLapDat.values || []).map(row => ({
      name: row[0] || '',
      value: row[1] || ''
    }));

    res.status(200).json({
      products,
      giaCongArr,
      lapDatArr
    });
  } catch (err) {
    console.error("Lỗi hangmuc.js:", err);
    res.status(500).json({ error: 'Không lấy được dữ liệu: ' + err.message });
  }
}