'use strict';
// Tes asap end-to-end: menjalankan server sungguhan di port acak dengan data sementara.
const { spawn } = require('child_process');
const os = require('os'), path = require('path'), fs = require('fs');
const assert = require('assert');

const PORT = 3900 + Math.floor(Math.random() * 90);
const dataFile = path.join(os.tmpdir(), 'ayam-test-' + Date.now() + '.json');
const env = { ...process.env, PORT: String(PORT), DATA_FILE: dataFile, ADMIN_PASSWORD: 'rahasia-test', PAYMENT_MODE: 'demo', COURIER_PROVIDER: 'demo', AUTOPILOT: '0' };
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://127.0.0.1:${PORT}`;
const call = async (p, method = 'GET', body, tok) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0; const ok = (m) => console.log(`  ✓ ${++n}. ${m}`);

(async () => {
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/healthz'); break; } catch { await sleep(100); } }
  const near = { lat: -5.4400, lng: 105.2700 };
  const cust = { name: 'Budi', phone: '081234567890', address: 'Jl. Contoh No. 5, Bandar Lampung' };

  let r = await call('/api/menu'); assert.equal(r.status, 200); const stock0 = r.body.stock.dada; ok('menu & stok dimuat');

  // Harga dihitung server: dada +2000, Paket Keluarga 62000, kemasan 1500
  const lines = [{ itemId: 'p-keluarga', qty: 1, parts: { dada: 1, paha_atas: 1, paha_bawah: 1, sayap: 1 }, options: ['kentang'] }];
  r = await call('/api/quote', 'POST', { lines, ...near, voucher: '' });
  assert.equal(r.status, 200); assert.equal(r.body.subtotal, 62000 + 10000 + 2000); assert.equal(r.body.packagingFee, 1500);
  assert.ok(r.body.deliveryFee >= 5000 && r.body.eta.total > 0); ok(`quote benar (subtotal ${r.body.subtotal}, ongkir ${r.body.deliveryFee}, ETA ${r.body.eta.total} mnt)`);

  r = await call('/api/quote', 'POST', { lines: [{ itemId: 'p-keluarga', qty: 1, parts: { dada: 1 } }], ...near });
  assert.equal(r.status, 400); ok('jumlah potong tidak cocok ditolak');
  r = await call('/api/quote', 'POST', { lines: [{ itemId: 'a-krispi', qty: 1, parts: { dada: 1 }, price: 1 }], ...near });
  assert.equal(r.body.subtotal, 13000 + 2000); ok('harga kiriman klien diabaikan');
  r = await call('/api/quote', 'POST', { lines: [{ itemId: 'a-krispi', qty: 1, parts: { sayap: 1 } }], lat: -5.9, lng: 105.9 });
  assert.equal(r.body.outOfRange, true); ok('di luar jangkauan terdeteksi');

  r = await call('/api/quote', 'POST', { lines: [{ itemId: 'p-keluarga', qty: 2, parts: { sayap: 8 } }], ...near, voucher: 'GRATISONGKIR' });
  assert.equal(r.body.shipDiscount, r.body.deliveryFee); ok('voucher gratis ongkir');

  // Buat pesanan QRIS
  const body = { customer: cust, lines, ...near, voucher: 'AYAMBARU', antiLepek: true, paymentMethod: 'qris' };
  r = await call('/api/orders', 'POST', body); assert.equal(r.status, 201, JSON.stringify(r.body));
  const order = r.body; assert.equal(order.status, 'pending_payment');
  assert.equal(order.pricing.discount, 11100); assert.equal(order.pricing.total, 74000 + 1500 + 5000 - 11100);
  r = await call('/api/menu'); assert.equal(r.body.stock.dada, stock0 - 1); ok('pesanan dibuat, stok dada terkunci');

  r = await call(`/api/orders/${order.id}/pay-demo`, 'POST'); assert.equal(r.body.status, 'received'); ok('bayar demo -> Pesanan Diterima');

  // Admin
  r = await call('/api/admin/orders'); assert.equal(r.status, 401); ok('admin tanpa token ditolak');
  r = await call('/api/admin/login', 'POST', { password: 'salah' }); assert.equal(r.status, 401);
  r = await call('/api/admin/login', 'POST', { password: 'rahasia-test' }); const tok = r.body.token; assert.ok(tok); ok('login admin');
  r = await call(`/api/admin/orders/${order.id}/status`, 'POST', { status: 'done' }, tok); assert.equal(r.status, 409); ok('lompat status ditolak');
  r = await call(`/api/admin/orders/${order.id}/status`, 'POST', { status: 'cooking' }, tok); assert.equal(r.body.status, 'cooking');
  r = await call(`/api/admin/orders/${order.id}/status`, 'POST', { status: 'delivering' }, tok); assert.equal(r.body.status, 'delivering'); assert.ok(r.body.courier.driverName);
  r = await call(`/api/admin/orders/${order.id}/status`, 'POST', { status: 'done' }, tok); assert.equal(r.body.status, 'done'); ok('alur diterima > masak > diantar (kurir) > selesai');
  r = await call(`/api/orders/${order.id}`); assert.equal(r.body.timeline.length, 5); ok('timeline lengkap');

  // Batal mengembalikan stok
  const before = (await call('/api/menu')).body.stock.sayap;
  r = await call('/api/orders', 'POST', { customer: cust, lines: [{ itemId: 'a-krispi', qty: 2, parts: { sayap: 2 } }], ...near, paymentMethod: 'cod' });
  assert.equal(r.body.status, 'received'); assert.equal((await call('/api/menu')).body.stock.sayap, before - 2);
  await call(`/api/admin/orders/${r.body.id}/status`, 'POST', { status: 'cancelled', reason: 'tes' }, tok);
  assert.equal((await call('/api/menu')).body.stock.sayap, before); ok('COD + batal mengembalikan stok');

  // Stok tidak bisa oversell
  await call('/api/admin/stock', 'PUT', { sayap: 1 }, tok);
  r = await call('/api/orders', 'POST', { customer: cust, lines: [{ itemId: 'a-krispi', qty: 2, parts: { sayap: 2 } }], ...near, paymentMethod: 'cod' });
  assert.equal(r.status, 400); assert.match(r.body.error, /Stok Sayap/); ok('kuota bagian ayam mencegah oversell');

  // Validasi input
  r = await call('/api/orders', 'POST', { ...body, customer: { ...cust, phone: '123' } }); assert.equal(r.status, 400); ok('nomor HP tidak valid ditolak');

  // File statis & path traversal
  let s = await fetch(base + '/'); assert.equal(s.status, 200); assert.match(await s.text(), /Pesan Antar Ayam`?/);
  s = await fetch(base + '/admin'); assert.equal(s.status, 200);
  s = await fetch(base + '/..%2f..%2fserver.js'); assert.notEqual(s.status, 200); ok('halaman utama, admin, dan proteksi path traversal');

  console.log(`\nSemua ${n} pemeriksaan lulus.`);
})().catch((e) => { console.error('\nGAGAL:', e.message); process.exitCode = 1; })
  .finally(() => { srv.kill(); try { fs.unlinkSync(dataFile); } catch {} });
