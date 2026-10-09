'use strict';
// Lapisan kurir. Dipanggil saat admin menekan "Ayam matang -> panggil kurir".
// Kontrak: dispatch(order, manual) -> { provider, driverName, plate, phone, trackingUrl? }
//
// Untuk integrasi kurir instan sungguhan (GrabExpress / Lalamove / Gojek GoSend), tambahkan adapter
// di bawah. Semuanya butuh akun bisnis + API key dari penyedia, jadi tidak bisa dibuat "jalan"
// tanpa kredensial Anda. Pola umumnya:
//   1. POST ke endpoint "quotation" dengan titik jemput (toko) & antar (order.loc)
//   2. POST "place order" dengan quotation id
//   3. Simpan id order kurir + link pelacakan, dan terima webhook status (opsional)
const C = require('./config');

const DEMO_DRIVERS = [
  { driverName: 'Budi Santoso', plate: 'BE 4821 AB', phone: '0812-0000-1111' },
  { driverName: 'Rizky Pratama', plate: 'BE 2290 KT', phone: '0813-0000-2222' },
  { driverName: 'Dewi Lestari', plate: 'BE 7713 CD', phone: '0857-0000-3333' },
];

const adapters = {
  demo: async () => ({ provider: 'demo', ...DEMO_DRIVERS[Math.floor(Math.random() * DEMO_DRIVERS.length)] }),

  // Kurir internal: admin mengisi nama driver sendiri
  manual: async (order, manual) => {
    if (!manual || !manual.driverName) throw new Error('Isi nama driver terlebih dahulu');
    return { provider: 'internal', driverName: manual.driverName, plate: manual.plate || '', phone: manual.phone || '' };
  },

  // Contoh kerangka adapter pihak ketiga
  lalamove: async () => { throw new Error('Adapter Lalamove belum diisi kredensial/implementasi di lib/courier.js'); },
  grab: async () => { throw new Error('Adapter GrabExpress belum diisi kredensial/implementasi di lib/courier.js'); },
  gojek: async () => { throw new Error('Adapter GoSend belum diisi kredensial/implementasi di lib/courier.js'); },
};

async function dispatch(order, manual) {
  // Jika admin mengetik nama driver, selalu pakai itu (kurir internal)
  if (manual && manual.driverName) return adapters.manual(order, manual);
  const fn = adapters[C.courierProvider];
  if (!fn) throw new Error(`COURIER_PROVIDER "${C.courierProvider}" tidak dikenal`);
  return fn(order, manual);
}

module.exports = { dispatch };
