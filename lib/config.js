'use strict';
const fs = require('fs');
const path = require('path');

// Pembaca .env sederhana (tanpa dependensi)
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

module.exports = {
  port: num(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  store: {
    name: env.STORE_NAME || 'Ayam Kriuk Jaya',
    address: env.STORE_ADDRESS || 'Jl. Raden Intan No. 10, Bandar Lampung',
    lat: num(env.STORE_LAT, -5.4295),
    lng: num(env.STORE_LNG, 105.261),
    wa: (env.STORE_WA || '').replace(/\D/g, ''),
  },
  adminPassword: env.ADMIN_PASSWORD || 'admin123',
  secret: env.SECRET || '',
  baseFee: num(env.DELIVERY_BASE_FEE, 5000),
  baseKm: num(env.DELIVERY_BASE_KM, 2),
  perKm: num(env.DELIVERY_PER_KM, 2500),
  maxKm: num(env.MAX_KM, 12),
  packagingFee: num(env.PACKAGING_FEE, 1500),
  paymentMode: env.PAYMENT_MODE === 'live' ? 'live' : 'demo',
  webhookSecret: env.PAYMENT_WEBHOOK_SECRET || '',
  enableCod: env.ENABLE_COD !== '0',
  courierProvider: env.COURIER_PROVIDER || 'demo',
  autopilot: env.AUTOPILOT === '1',
  trustProxy: env.TRUST_PROXY === '1',
  dataFile: path.resolve(path.join(__dirname, '..'), env.DATA_FILE || './data/db.json'),
  payExpireMin: 15,
  parts: {
    dada: { label: 'Dada', surcharge: 2000 },
    paha_atas: { label: 'Paha Atas', surcharge: 0 },
    paha_bawah: { label: 'Paha Bawah', surcharge: 0 },
    sayap: { label: 'Sayap', surcharge: 0 },
  },
  spice: ['Tidak pedas', 'Pedas ringan', 'Pedas sedang', 'Pedas', 'Pedas banget', 'Level setan'],
  categories: [
    { id: 'paket', name: 'Paket Hemat' },
    { id: 'ayam', name: 'Ayam Satuan' },
    { id: 'geprek', name: 'Geprek & Saus' },
    { id: 'tambahan', name: 'Pelengkap' },
    { id: 'minuman', name: 'Minuman' },
  ],
  payments: [
    { id: 'qris', label: 'QRIS', desc: 'Semua e-wallet & m-banking' },
    { id: 'gopay', label: 'GoPay', desc: 'Bayar lewat aplikasi Gojek' },
    { id: 'ovo', label: 'OVO', desc: 'Bayar lewat aplikasi OVO' },
    { id: 'dana', label: 'DANA', desc: 'Bayar lewat aplikasi DANA' },
    { id: 'shopeepay', label: 'ShopeePay', desc: 'Bayar lewat aplikasi Shopee' },
    { id: 'cod', label: 'Bayar di tempat (COD)', desc: 'Tunai ke kurir saat ayam tiba' },
  ],
};
