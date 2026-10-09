'use strict';
// Seluruh perhitungan harga, stok, ongkir, ETA, dan voucher ada di server.
// Klien tidak pernah dipercaya untuk harga.
const C = require('./config');

const OPTIONS = [
  { id: 'nasi_jumbo', group: 'Nasi', name: 'Upgrade Nasi Jumbo', price: 3000 },
  { id: 'saus_keju', group: 'Saus ekstra', name: 'Saus Keju', price: 4000 },
  { id: 'saus_mentai', group: 'Saus ekstra', name: 'Saus Mentai', price: 5000 },
  { id: 'saus_geprek', group: 'Saus ekstra', name: 'Sambal Geprek', price: 3000 },
  { id: 'kulit', group: 'Pelengkap', name: 'Kulit Ayam Kriuk', price: 8000 },
  { id: 'kentang', group: 'Pelengkap', name: 'Kentang Goreng', price: 10000 },
  { id: 'sup', group: 'Pelengkap', name: 'Sup Ayam Hangat', price: 6000 },
];

const VOUCHERS = [
  { code: 'GRATISONGKIR', title: 'Gratis ongkir', desc: 'Min. belanja Rp40.000', type: 'ship', min: 40000 },
  { code: 'HEMAT10K', title: 'Potongan Rp10.000', desc: 'Min. belanja Rp75.000', type: 'amount', value: 10000, min: 75000 },
  { code: 'AYAMBARU', title: 'Diskon 15%', desc: 'Maks. Rp15.000, min. Rp30.000', type: 'percent', value: 15, max: 15000, min: 30000 },
];

class UserError extends Error {
  constructor(msg, status = 400) { super(msg); this.status = status; }
}

const rp = (n) => 'Rp' + Number(n).toLocaleString('id-ID');

function normalizeLines(db, lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new UserError('Keranjang masih kosong');
  if (lines.length > 30) throw new UserError('Terlalu banyak item dalam satu pesanan');
  const out = [];
  const demand = {};
  let subtotal = 0, pieces = 0;

  for (const raw of lines) {
    const item = db.menu.find((m) => m.id === (raw && raw.itemId));
    if (!item) throw new UserError('Ada menu yang sudah tidak tersedia, mohon periksa keranjang');
    if (!item.available) throw new UserError(`${item.name} sedang tidak tersedia`);
    const qty = Math.floor(Number(raw.qty));
    if (!(qty >= 1 && qty <= 20)) throw new UserError('Jumlah item tidak valid');

    const line = { itemId: item.id, name: item.name, qty, parts: {}, spice: 0, options: [], optionNames: [], note: '' };
    let surcharge = 0;
    const need = item.pieces * qty;
    if (need > 0) {
      let sum = 0;
      const given = raw.parts && typeof raw.parts === 'object' ? raw.parts : {};
      for (const k of Object.keys(C.parts)) {
        const v = Math.floor(Number(given[k]) || 0);
        if (v < 0) throw new UserError('Pilihan bagian ayam tidak valid');
        if (v > 0) {
          line.parts[k] = v; sum += v;
          demand[k] = (demand[k] || 0) + v;
          surcharge += v * C.parts[k].surcharge;
        }
      }
      if (sum !== need) throw new UserError(`${item.name}: pilih ${need} potong ayam (baru terpilih ${sum})`);
      pieces += need;
    }
    if (item.spicy) line.spice = Math.max(0, Math.min(5, Math.floor(Number(raw.spice)) || 0));
    let optSum = 0;
    if (item.custom && Array.isArray(raw.options)) {
      for (const id of [...new Set(raw.options)]) {
        const o = OPTIONS.find((x) => x.id === id);
        if (o) { line.options.push(o.id); line.optionNames.push(o.name); optSum += o.price; }
      }
    }
    line.note = String(raw.note || '').slice(0, 100);
    line.unitPrice = item.price + optSum;
    line.surcharge = surcharge;
    line.total = line.unitPrice * qty + surcharge;
    subtotal += line.total;
    out.push(line);
  }
  for (const k of Object.keys(demand)) {
    const have = db.stock[k] || 0;
    if (demand[k] > have) {
      throw new UserError(have > 0 ? `Stok ${C.parts[k].label} tinggal ${have} potong, mohon ubah pilihan` : `${C.parts[k].label} sudah habis hari ini, mohon pilih bagian lain`);
    }
  }
  return { lines: out, demand, subtotal, pieces };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function etaMinutes(db, pieces, km) {
  const queue = db.orders.filter((o) => o.status === 'received' || o.status === 'cooking');
  const queuePieces = queue.reduce((s, o) => s + (o.pieces || 0), 0);
  const cook = Math.min(45, 10 + Math.ceil(queuePieces / 4) + Math.ceil(pieces / 5));
  const travel = km == null ? null : Math.ceil((km / 25) * 60) + 4; // 25 km/jam + tunggu kurir
  return { cook, travel, total: travel == null ? null : cook + travel, queue: queue.length };
}

function applyVoucher(code, subtotal, deliveryFee) {
  if (!code) return { discount: 0, shipDiscount: 0, applied: null };
  const v = VOUCHERS.find((x) => x.code === String(code).trim().toUpperCase());
  if (!v) return { discount: 0, shipDiscount: 0, applied: null, error: 'Kode voucher tidak ditemukan' };
  if (subtotal < v.min) return { discount: 0, shipDiscount: 0, applied: null, error: `Voucher ${v.code} berlaku untuk belanja min. ${rp(v.min)}` };
  if (v.type === 'ship') return { discount: 0, shipDiscount: deliveryFee || 0, applied: v.code };
  if (v.type === 'amount') return { discount: Math.min(v.value, subtotal), shipDiscount: 0, applied: v.code };
  return { discount: Math.min(v.max, Math.floor((subtotal * v.value) / 100)), shipDiscount: 0, applied: v.code };
}

function quote(db, input) {
  const n = normalizeLines(db, input.lines);
  const antiLepek = input.antiLepek !== false;
  const packagingFee = antiLepek ? C.packagingFee : 0;

  let km = null, deliveryFee = null, outOfRange = false;
  const lat = Number(input.lat), lng = Number(input.lng);
  if (input.lat != null && input.lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Number.isFinite(lat) && Number.isFinite(lng)) {
    km = Math.round(haversineKm(C.store.lat, C.store.lng, lat, lng) * 1.3 * 10) / 10; // faktor 1.3 ~ jarak jalan
    if (km > C.maxKm) outOfRange = true;
    else deliveryFee = Math.round((C.baseFee + Math.max(0, km - C.baseKm) * C.perKm) / 500) * 500;
  }
  const v = applyVoucher(input.voucher, n.subtotal, deliveryFee);
  const total = n.subtotal + packagingFee + (deliveryFee || 0) - v.discount - v.shipDiscount;
  return {
    lines: n.lines, demand: n.demand, pieces: n.pieces, subtotal: n.subtotal,
    antiLepek, packagingFee, km, deliveryFee, outOfRange, maxKm: C.maxKm,
    discount: v.discount, shipDiscount: v.shipDiscount, voucher: v.applied, voucherError: v.error || null,
    total, feeKnown: deliveryFee != null,
    eta: etaMinutes(db, n.pieces, outOfRange ? null : km),
    vouchers: VOUCHERS.map((x) => ({ code: x.code, title: x.title, desc: x.desc, eligible: n.subtotal >= x.min })),
  };
}

module.exports = { OPTIONS, VOUCHERS, UserError, quote, normalizeLines, etaMinutes, rp };
