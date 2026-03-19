/**
 * Booking proxy — Supabase ONLY
 * ⚡ Đã xóa hoàn toàn GAS backup — mọi thứ chạy trên Supabase
 */
const sb     = require('./_supabase');
const resend = require('./_resend');

const CORS = {
  'Content-Type':                'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control':               'no-store',
};

let _cfgCache = null, _cfgTime = 0;
const CFG_TTL = 10 * 60 * 1000;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const params = event.queryStringParameters || {};

  // Parse body cho POST
  let body = {};
  if (event.body && event.httpMethod === 'POST') {
    try {
      const raw = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
      try { body = JSON.parse(raw); } catch(_) {
        try { body = Object.fromEntries(new URLSearchParams(raw)); } catch(_) {}
      }
    } catch(_) {}
  }
  const all = { ...body, ...params };

  // Booking app gửi params mà KHÔNG có action= → detect write
  const isWrite = !params.action && params.name && params.phone && params.date;
  const action  = params.action || body.action || (isWrite ? 'write' : 'read');

  try {

    // ── WRITE BOOKING ──
    if (action === 'write' || isWrite) {
      const clean = {
        name:        String(params.name        || '').trim().slice(0, 100),
        phone:       String(params.phone       || '').trim().slice(0, 15),
        date:        String(params.date        || '').trim(),
        court:       String(params.court       || '').trim(),
        startHour:   String(params.startHour   || '').trim(),
        duration:    String(Number(params.duration)    || 1),
        players:     String(Number(params.players)     || 4),
        rackets:     String(Number(params.rackets)     || 0),
        courtTotal:  String(Number(params.courtTotal)  || 0),
        racketTotal: String(Number(params.racketTotal) || 0),
        total:       String(Number(params.total)       || 0),
        status:      'pending',
        payment:     String(params.payment || 'cash'),
        note:        String(params.note   || '').slice(0, 500),
        memberId:    String(params.memberId || ''),
      };
      const result = await sb.sbWriteBooking(clean);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, ok: true, data: result, source: 'supabase' }) };
    }

    // ── READ BOOKINGS ──
    if (action === 'read' || action === 'readJson') {
      const rows = await sb.sbReadBookings(params.date || null);
      if (action === 'readJson') {
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ bookings: rows, ts: Date.now(), source: 'supabase' }) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify(rows) };
    }

    // ── CHECK SLOT ──
    if (action === 'checkSlot') {
      const date  = params.date  || '';
      const court = params.court || '';
      const hours = String(params.hours || '').split(',').map(h => h.trim()).filter(Boolean);
      if (!date || !court || !hours.length)
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ available: false, error: 'Missing params' }) };

      const slots     = await sb.sbGetSlotsForDate(date, court);
      const conflicts = [];
      (slots || []).forEach(b => {
        const start = parseInt(b.start_time) || 0;
        const dur   = Number(b.hours) || 1;
        for (let i = 0; i < dur; i++) {
          const h = String(start + i).padStart(2, '0') + ':00';
          if (hours.includes(h)) conflicts.push(h);
        }
      });
      if (conflicts.length > 0)
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ available: false, conflicts }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ available: true, source: 'supabase' }) };
    }

    // ── CONFIG ──
    if (action === 'readConfig') {
      const now = Date.now();
      if (_cfgCache && (now - _cfgTime) < CFG_TTL)
        return { statusCode: 200, headers: { ...CORS, 'X-Cache': 'HIT' }, body: JSON.stringify(_cfgCache) };
      const cfg = await sb.sbReadConfig();
      if (cfg && Object.keys(cfg).length > 0) {
        if (cfg.activeCourts && typeof cfg.activeCourts === 'string')
          cfg.activeCourts = cfg.activeCourts.split(',').map(s => s.trim()).filter(Boolean);
        ['priceDay','priceNight','priceRacket','hourOpen','hourClose','hourNight']
          .forEach(k => { if (cfg[k] !== undefined) cfg[k] = Number(cfg[k]); });
        _cfgCache = cfg; _cfgTime = now;
        return { statusCode: 200, headers: { ...CORS, 'X-Cache': 'SB' }, body: JSON.stringify(cfg) };
      }
      return { statusCode: 200, headers: CORS, body: JSON.stringify({}) };
    }

    // ════════════════════════════════════════
    // MEMBERSHIP — đã migrate hoàn toàn vào Supabase + Resend
    // ════════════════════════════════════════

    // ── Gửi OTP đăng nhập member ──
    if (action === 'memberOtp') {
      const email = (all.email || '').trim().toLowerCase();
      if (!email) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Thiếu email' }) };
      const member = await sb.sbGetMemberByEmail(email);
      if (!member) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Email chưa được đăng ký' }) };
      const otp = await sb.sbCreateMemberOtp(email, 'login');
      await resend.sendMemberOtp(email, otp, 'login');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // ── Xác minh OTP member ──
    if (action === 'verifyMemberOtp') {
      const email = (all.email || '').trim().toLowerCase();
      const otp   = (all.otp   || '').trim();
      if (!email || !otp) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Thiếu email hoặc OTP' }) };
      const ok = await sb.sbVerifyMemberOtp(email, otp, 'login');
      if (!ok) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'OTP sai hoặc hết hạn' }) };
      const member = await sb.sbGetMemberByEmail(email);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, member: sb.normalizeMember(member) }) };
    }

    // ── Đăng ký thành viên ──
    if (action === 'registerMember') {
      try {
        const member = await sb.sbRegisterMember(all);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, member }) };
      } catch(e) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: e.message }) };
      }
    }

    // ── Đăng nhập member ──
    if (action === 'loginMember') {
      const email    = (all.email    || '').trim().toLowerCase();
      const password = all.password  || '';
      if (!email || !password)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Thiếu email hoặc mật khẩu' }) };
      try {
        const member = await sb.sbLoginMember(email, password);
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, member }) };
      } catch(e) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: e.message }) };
      }
    }

    // ── Gửi OTP reset mật khẩu ──
    if (action === 'resetMemberPass') {
      const email = (all.email || '').trim().toLowerCase();
      if (!email) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Thiếu email' }) };
      const member = await sb.sbGetMemberByEmail(email);
      if (!member) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Email chưa được đăng ký' }) };
      const otp = await sb.sbCreateMemberOtp(email, 'reset');
      await resend.sendMemberOtp(email, otp, 'reset');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // ── Xác minh OTP reset + đổi mật khẩu ──
    if (action === 'confirmResetMemberPass') {
      const email    = (all.email    || '').trim().toLowerCase();
      const otp      = (all.otp      || '').trim();
      const password = all.password  || '';
      if (!email || !otp || !password)
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Thiếu thông tin' }) };
      const ok = await sb.sbVerifyMemberOtp(email, otp, 'reset');
      if (!ok) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'OTP sai hoặc hết hạn' }) };
      await sb.sbUpdateMemberPassword(email, password);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // ── Lấy thông tin member ──
    if (action === 'getMember') {
      const phone = (all.phone || '').trim();
      const email = (all.email || '').trim().toLowerCase();
      let member = null;
      if (phone) member = await sb.sbGetMember(phone);
      if (!member && email) member = await sb.sbGetMemberByEmail(email);
      if (!member) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Không tìm thấy thành viên' }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify(sb.normalizeMember(member)) };
    }

    // ── Default: unknown action ──
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action: ' + action }) };

  } catch(err) {
    console.error('[booking proxy]', action, err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
