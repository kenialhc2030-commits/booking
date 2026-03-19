/**
 * Resend.com email helper — dùng https module thuần (không cần npm)
 * Env var: RESEND_API_KEY
 *
 * Resend REST API: POST https://api.resend.com/emails
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */
const https = require('https');

const RESEND_API_KEY  = process.env.RESEND_API_KEY || 're_BzY94huv_LVDtuDVy8bGe135smYG6iwBH';
const FROM_EMAIL      = process.env.RESEND_FROM    || 'onboarding@resend.dev';
const FROM_NAME       = 'Thủy Tiên Pickleball';

/** Gửi email qua Resend REST API */
function sendEmail({ to, subject, html }) {
  return new Promise((resolve, reject) => {
    if (!RESEND_API_KEY) {
      console.error('[Resend] RESEND_API_KEY chưa được set!');
      return reject(new Error('RESEND_API_KEY chưa được cấu hình'));
    }
    const bodyObj = {
      from:    `${FROM_NAME} <${FROM_EMAIL}>`,
      to:      Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    const bodyStr = JSON.stringify(bodyObj);
    const req = https.request({
      hostname: 'api.resend.com',
      path:     '/emails',
      method:   'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_API_KEY,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error('Resend ' + res.statusCode + ': ' + data.slice(0,200)));
        }
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve({ ok: true }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Templates ──

function buildAdminOtpHtml(otp, email) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0D1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1117;padding:32px 16px">
<tr><td align="center"><table width="100%" style="max-width:420px;background:#161B22;border-radius:14px;border:1px solid #30363D;overflow:hidden">
<tr><td style="padding:24px;text-align:center;border-bottom:1px solid #21262D">
  <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#2ECC71;text-transform:uppercase;margin-bottom:4px">THUY TIEN PICKLEBALL</div>
  <div style="font-size:11px;color:#8B949E">Ma OTP dang nhap trang quan ly</div>
</td></tr>
<tr><td style="padding:28px">
  <p style="margin:0 0 8px;font-size:13px;color:#8B949E">Ma OTP cho <strong style="color:#E6EDF3">${email}</strong>:</p>
  <div style="background:#0D1117;border:1px solid #2ECC7155;border-radius:10px;padding:22px;text-align:center;margin:12px 0">
    <span style="font-family:'Courier New',monospace;font-size:40px;font-weight:700;letter-spacing:12px;color:#2ECC71">${otp}</span>
  </div>
  <p style="margin:0;font-size:11px;color:#8B949E;text-align:center">Co hieu luc 5 phut. Khong chia se ma nay voi bat ky ai.</p>
</td></tr>
<tr><td style="background:#0D1117;padding:12px;text-align:center;border-top:1px solid #21262D">
  <p style="margin:0;font-size:10px;color:#484F58">Thuy Tien Pickleball &bull; Trang quan ly noi bo</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function buildMemberOtpHtml(otp, type) {
  const title   = type === 'reset' ? 'Đặt lại mật khẩu' : 'Đăng nhập tài khoản';
  const subtitle = type === 'reset'
    ? 'Nhập mã này để đặt lại mật khẩu của bạn'
    : 'Mã OTP đăng nhập thành viên';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa;padding:32px 16px">
<tr><td align="center"><table width="100%" style="max-width:420px;background:#ffffff;border-radius:14px;border:1px solid #e0e0e0;overflow:hidden">
<tr><td style="background:#1a1a2e;padding:24px;text-align:center">
  <div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#00d4aa;text-transform:uppercase">THỦY TIÊN PICKLEBALL</div>
  <div style="font-size:11px;color:#aaa;margin-top:4px">${subtitle}</div>
</td></tr>
<tr><td style="padding:28px;text-align:center">
  <p style="font-size:15px;font-weight:600;color:#1a1a2e;margin:0 0 16px">${title}</p>
  <div style="background:#f0fdf4;border:2px solid #00d4aa55;border-radius:12px;padding:20px;display:inline-block;margin:0 auto">
    <span style="font-family:'Courier New',monospace;font-size:38px;font-weight:700;letter-spacing:10px;color:#00a878">${otp}</span>
  </div>
  <p style="margin:16px 0 0;font-size:12px;color:#888">Mã có hiệu lực trong <strong>5 phút</strong>. Không chia sẻ với ai.</p>
</td></tr>
<tr><td style="background:#f8f9fa;padding:12px;text-align:center;border-top:1px solid #eee">
  <p style="margin:0;font-size:11px;color:#aaa">Thủy Tiên Pickleball · Nhơn Trạch, Đồng Nai</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

/** Gửi OTP cho admin login */
async function sendAdminOtp(to, otp) {
  return sendEmail({
    to,
    subject: 'Mã OTP đăng nhập - Thủy Tiên Pickleball',
    html:    buildAdminOtpHtml(otp, to),
  });
}

/** Gửi OTP cho member (login hoặc reset) */
async function sendMemberOtp(to, otp, type) {
  const subject = type === 'reset'
    ? 'Đặt lại mật khẩu - Thủy Tiên Pickleball'
    : 'Mã OTP đăng nhập thành viên - Thủy Tiên Pickleball';
  return sendEmail({ to, subject, html: buildMemberOtpHtml(otp, type) });
}

module.exports = { sendEmail, sendAdminOtp, sendMemberOtp };
