'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./lib/config');
const store = require('./lib/store');
const P = require('./lib/pricing');
const courier = require('./lib/courier');
const payment = require('./lib/payment');

const db = store.load(require('./data/seed'));
const SECRET = C.secret || db.secret;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const FINAL = ['done', 'cancelled'];

// ---------- util ----------
const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > 100 * 1024) { reject(new P.UserError('Permintaan terlalu besar', 413)); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new P.UserError('Format data tidak valid')); } });
  req.on('error', reject);
});
const clientIp = (req) => (C.trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';

const hits = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const h = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (h.length >= max) { hits.set(key, h); return false; }
  h.push(now); hits.set(key, h); return true;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 120000)) hits.delete(k); }, 60000).unref();

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
function signToken(payload) {
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
}
function verifyToken(tok) {
  if (!tok || typeof tok !== 'string' || !tok.includes('.')) return false;
  const [b, sig] = tok.split('.');
  const exp = crypto.createHmac('sha256', SECRET).update(b).digest('base64url');
  if (sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return false;
  try { return JSON.parse(Buffer.from(b, 'base64url').toString()).exp > Date.now(); } catch { return false; }
}
const isAdmin = (req) => verifyToken((req.headers.authorization || '').replace(/^Bearer /, ''));

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newOrderId() {
  for (;;) {
    const b = crypto.randomBytes(8);
    const id = 'AYM-' + [...b].map((x) => ALPHABET[x % ALPHABET.length]).join('');
    if (!db.orders.some((o) => o.id === id)) return id;
  }
}

function pushStatus(order, status) {
  order.status = status;
  order.updatedAt = Date.now();
  order.timeline.push({ status, at: order.updatedAt });
}
function releaseStock(order) {
  if (order.stockReleased) return;
  for (const k of Object.keys(order.demand || {})) db.stock[k] = (db.stock[k] || 0) + order.demand[k];
  order.stockReleased = true;
}
function markPaid(order) {
  if (order.status !== 'pending_payment') return false;
  order.payment.status = 'paid';
  order.payment.paidAt = Date.now();
  order.etaAt = Date.now() + (order.eta.total || 30) * 60000;
  pushStatus(order, 'received');
  return true;
}
function cancelOrder(order, reason) {
  releaseStock(order);
  order.cancelReason = reason;
  if (order.payment.status === 'paid') order.payment.refundNeeded = true;
  pushStatus(order, 'cancelled');
}

const NEXT = { pending_payment: ['received', 'cancelled'], received: ['cooking', 'cancelled'], cooking: ['delivering', 'cancelled'], delivering: ['done', 'cancelled'] };
async function changeStatus(order, next, extra) {
  if (!(NEXT[order.status] || []).includes(next)) throw new P.UserError(`Status tidak bisa diubah dari ${order.status} ke ${next}`, 409);
  if (next === 'received') { if (!markPaid(order)) throw new P.UserError('Pesanan sudah dibayar'); }
  else if (next === 'cancelled') cancelOrder(order, (extra && extra.reason) || 'Dibatalkan oleh toko');
  else if (next === 'delivering') {
    try { order.courier = await courier.dispatch(order, extra); }
    catch (e) { throw new P.UserError('Gagal memanggil kurir: ' + e.message, 502); }
    pushStatus(order, 'delivering');
  } else {
    if (next === 'done' && order.payment.method === 'cod') { order.payment.status = 'paid'; order.payment.paidAt = Date.now(); }
    pushStatus(order, next);
  }
  store.save();
}

// ---------- jadwal otomatis ----------
setInterval(() => {
  let changed = false;
  const now = Date.now();
  for (const o of db.orders) {
    if (o.status === 'pending_payment' && now > o.payment.expiresAt) { cancelOrder(o, 'Waktu pembayaran habis'); changed = true; }
    if (C.autopilot) {
      const age = now - o.updatedAt;
      if (o.status === 'received' && age > 15000) { changeStatus(o, 'cooking').catch(() => {}); }
      else if (o.status === 'cooking' && age > 25000) { changeStatus(o, 'delivering').catch(() => {}); }
      else if (o.status === 'delivering' && age > 30000) { changeStatus(o, 'done').catch(() => {}); }
    }
  }
  if (changed) store.save();
}, 5000).unref();

// ---------- API publik ----------
const PHONE = /^(\+62|62|0)8\d{7,12}$/;

function publicMenu() {
  return { items: db.menu.map((m) => ({ ...m })), stock: { ...db.stock } };
}

async function createOrder(body, req) {
  if (!rateLimit('order:' + clientIp(req), 8, 10 * 60000)) throw new P.UserError('Terlalu banyak pesanan, coba lagi beberapa menit lagi', 429);
  const c = body.customer || {};
  const name = String(c.name || '').trim(), phone = String(c.phone || '').replace(/[\s-]/g, ''), address = String(c.address || '').trim();
  if (name.length < 2 || name.length > 60) throw new P.UserError('Isi nama penerima (2-60 huruf)');
  if (!PHONE.test(phone)) throw new P.UserError('Nomor HP tidak valid, contoh: 081234567890');
  if (address.length < 5 || address.length > 250) throw new P.UserError('Isi alamat lengkap (patokan, nomor rumah, RT/RW)');
  const method = C.payments.find((p) => p.id === body.paymentMethod && (p.id !== 'cod' || C.enableCod));
  if (!method) throw new P.UserError('Pilih metode pembayaran');
  if (body.lat == null || body.lng == null) throw new P.UserError('Tentukan titik antar di peta');

  const q = P.quote(db, body);
  if (q.outOfRange) throw new P.UserError(`Lokasi di luar jangkauan antar (maks. ${C.maxKm} km dari toko)`);
  if (!q.feeKnown) throw new P.UserError('Tentukan titik antar di peta');
  if (body.voucher && q.voucherError) throw new P.UserError(q.voucherError);

  // Kunci stok sekarang (dikembalikan bila batal / kedaluwarsa)
  for (const k of Object.keys(q.demand)) db.stock[k] -= q.demand[k];
  const now = Date.now();
  const cod = method.id === 'cod';
  const order = {
    id: newOrderId(), seq: ++db.seq, createdAt: now, updatedAt: now,
    status: 'pending_payment',
    customer: { name, phone, address, note: String(c.note || '').slice(0, 150) },
    loc: { lat: Number(body.lat), lng: Number(body.lng) },
    lines: q.lines, demand: q.demand, pieces: q.pieces,
    antiLepek: q.antiLepek, km: q.km,
    pricing: { subtotal: q.subtotal, packagingFee: q.packagingFee, deliveryFee: q.deliveryFee, discount: q.discount, shipDiscount: q.shipDiscount, voucher: q.voucher, total: q.total },
    eta: q.eta, etaAt: now + (q.eta.total || 30) * 60000,
    payment: { method: method.id, label: method.label, status: 'unpaid', expiresAt: now + C.payExpireMin * 60000 },
    courier: null, timeline: [{ status: 'pending_payment', at: now }],
  };
  db.orders.push(order);
  if (cod) { order.payment.status = 'cod'; order.payment.expiresAt = null; pushStatus(order, 'received'); }
  else order.payment.gateway = await payment.createPayment(order).catch((e) => { releaseStock(order); db.orders.pop(); db.seq--; throw new P.UserError(e.message, 503); });
  store.save();
  return order;
}

async function handleApi(req, res, url) {
  const m = req.method, p = url.pathname;

  if (m === 'GET' && p === '/api/config') {
    return send(res, 200, {
      store: C.store, categories: C.categories, parts: C.parts, spice: C.spice, options: P.OPTIONS,
      payments: C.payments.filter((x) => x.id !== 'cod' || C.enableCod), paymentMode: C.paymentMode,
      maxKm: C.maxKm, packagingFee: C.packagingFee,
    });
  }
  if (m === 'GET' && p === '/api/menu') return send(res, 200, publicMenu());

  if (m === 'POST' && p === '/api/quote') {
    if (!rateLimit('quote:' + clientIp(req), 120, 60000)) throw new P.UserError('Terlalu banyak permintaan', 429);
    return send(res, 200, P.quote(db, await readBody(req)));
  }
  if (m === 'POST' && p === '/api/orders') {
    const o = await createOrder(await readBody(req), req);
    return send(res, 201, o);
  }
  if (m === 'GET' && p === '/api/orders') {
    const ids = String(url.searchParams.get('ids') || '').split(',').filter(Boolean).slice(0, 20);
    return send(res, 200, ids.map((id) => db.orders.find((o) => o.id === id)).filter(Boolean).map(stripInternal));
  }
  let mm;
  if ((mm = p.match(/^\/api\/orders\/([A-Z0-9-]+)$/)) && m === 'GET') {
    const o = db.orders.find((x) => x.id === mm[1]);
    if (!o) return send(res, 404, { error: 'Pesanan tidak ditemukan' });
    return send(res, 200, stripInternal(o));
  }
  if ((mm = p.match(/^\/api\/orders\/([A-Z0-9-]+)\/pay-demo$/)) && m === 'POST') {
    if (C.paymentMode !== 'demo') return send(res, 403, { error: 'Mode demo dimatikan' });
    const o = db.orders.find((x) => x.id === mm[1]);
    if (!o) return send(res, 404, { error: 'Pesanan tidak ditemukan' });
    if (o.status !== 'pending_payment') return send(res, 409, { error: 'Pesanan tidak menunggu pembayaran' });
    markPaid(o); store.save();
    return send(res, 200, stripInternal(o));
  }
  if (m === 'POST' && p === '/api/payments/webhook') {
    if (!C.webhookSecret || !safeEq(req.headers['x-callback-token'] || '', C.webhookSecret)) return send(res, 401, { error: 'Unauthorized' });
    const b = await readBody(req);
    const o = db.orders.find((x) => x.id === b.order_id);
    if (!o) return send(res, 404, { error: 'Pesanan tidak ditemukan' });
    if (b.status === 'paid') markPaid(o);
    else if (b.status === 'expired' || b.status === 'failed') { if (o.status === 'pending_payment') cancelOrder(o, 'Pembayaran gagal/kedaluwarsa'); }
    store.save();
    return send(res, 200, { ok: true });
  }

  // ---------- admin ----------
  if (m === 'POST' && p === '/api/admin/login') {
    if (!rateLimit('login:' + clientIp(req), 10, 10 * 60000)) throw new P.UserError('Terlalu banyak percobaan login', 429);
    const b = await readBody(req);
    if (!safeEq(b.password || '', C.adminPassword)) return send(res, 401, { error: 'Password salah' });
    return send(res, 200, { token: signToken({ exp: Date.now() + 12 * 3600 * 1000 }) });
  }
  if (p.startsWith('/api/admin/')) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Sesi berakhir, silakan login lagi' });

    if (m === 'GET' && p === '/api/admin/orders') {
      const list = [...db.orders].sort((a, b) => b.createdAt - a.createdAt);
      const active = list.filter((o) => !FINAL.includes(o.status));
      const recent = list.filter((o) => FINAL.includes(o.status)).slice(0, 30);
      return send(res, 200, { active, recent, stock: db.stock, summary: summary() });
    }
    if ((mm = p.match(/^\/api\/admin\/orders\/([A-Z0-9-]+)\/status$/)) && m === 'POST') {
      const o = db.orders.find((x) => x.id === mm[1]);
      if (!o) return send(res, 404, { error: 'Pesanan tidak ditemukan' });
      const b = await readBody(req);
      await changeStatus(o, String(b.status), { driverName: String(b.driverName || '').slice(0, 40), plate: String(b.plate || '').slice(0, 15), phone: String(b.phone || '').slice(0, 20), reason: String(b.reason || '').slice(0, 100) });
      return send(res, 200, o);
    }
    if (m === 'PUT' && p === '/api/admin/stock') {
      const b = await readBody(req);
      for (const k of Object.keys(C.parts)) if (b[k] != null) {
        const v = Math.floor(Number(b[k]));
        if (!(v >= 0 && v <= 9999)) throw new P.UserError('Kuota tidak valid');
        db.stock[k] = v;
      }
      store.save();
      return send(res, 200, db.stock);
    }
    if (m === 'GET' && p === '/api/admin/menu') return send(res, 200, db.menu);
    if ((mm = p.match(/^\/api\/admin\/menu\/([\w-]+)$/)) && m === 'PUT') {
      const it = db.menu.find((x) => x.id === mm[1]);
      if (!it) return send(res, 404, { error: 'Menu tidak ditemukan' });
      const b = await readBody(req);
      if (typeof b.available === 'boolean') it.available = b.available;
      if (b.price != null) { const v = Math.floor(Number(b.price)); if (!(v >= 0 && v <= 1000000)) throw new P.UserError('Harga tidak valid'); it.price = v; }
      store.save();
      return send(res, 200, it);
    }
  }
  return send(res, 404, { error: 'Endpoint tidak ditemukan' });
}

function stripInternal(o) { const { demand, stockReleased, ...rest } = o; return rest; }
function summary() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const today = db.orders.filter((o) => o.createdAt >= start.getTime() && o.status !== 'cancelled');
  const paid = today.filter((o) => o.payment.status === 'paid');
  return { ordersToday: today.length, revenueToday: paid.reduce((s, o) => s + o.pricing.total, 0), cancelledToday: db.orders.filter((o) => o.createdAt >= start.getTime() && o.status === 'cancelled').length };
}

// ---------- file statis ----------
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  if (rel === '/admin') rel = '/admin.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) && file !== PUBLIC) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Halaman tidak ditemukan'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self)');
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') return send(res, 200, { ok: true, orders: db.orders.length });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    serveStatic(req, res, url);
  } catch (e) {
    if (e instanceof P.UserError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: 'Terjadi kesalahan di server' });
  }
});

server.listen(C.port, C.host, () => {
  console.log(`\n🍗  ${C.store.name} berjalan di http://localhost:${C.port}`);
  console.log(`    Admin     : http://localhost:${C.port}/admin`);
  console.log(`    Pembayaran: ${C.paymentMode.toUpperCase()}  |  Kurir: ${C.courierProvider}  |  Autopilot: ${C.autopilot ? 'ON' : 'off'}`);
  if (C.adminPassword === 'admin123') console.warn('    ⚠  ADMIN_PASSWORD masih default "admin123" -- ganti di .env sebelum dipublikasikan!');
  if (C.paymentMode === 'demo') console.warn('    ⚠  PAYMENT_MODE=demo: pembayaran hanya simulasi (lihat README untuk gateway sungguhan).');
});
const shutdown = () => { try { store.save(); } catch {} process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
