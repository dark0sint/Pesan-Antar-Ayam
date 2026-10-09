'use strict';
// Lapisan pembayaran.
//
// MODE DEMO (default): tidak ada uang sungguhan. Halaman bayar menampilkan QR contoh dan
// tombol "Simulasikan pembayaran berhasil".
//
// MODE LIVE: set PAYMENT_MODE=live, lalu isi createPayment() dengan gateway pilihan Anda
// (Midtrans, Xendit, Duitku, dll. -- semuanya menyediakan QRIS, GoPay, OVO, DANA, ShopeePay).
// Alurnya:
//   1. createPayment(order) memanggil API gateway -> dapat QR string / deeplink / URL checkout
//   2. Gateway memanggil webhook kita: POST /api/payments/webhook
//        header  x-callback-token: <PAYMENT_WEBHOOK_SECRET>
//        body    { "order_id": "AYM-XXXX", "status": "paid" }
//      (sesuaikan parsing di server.js dengan format webhook gateway Anda)
const C = require('./config');

async function createPayment(order) {
  if (C.paymentMode === 'demo') {
    return { mode: 'demo', method: order.payment.method, payload: 'DEMO-' + order.id };
  }
  throw new Error('PAYMENT_MODE=live tetapi createPayment() belum diisi dengan gateway pembayaran (lib/payment.js)');
}

module.exports = { createPayment };
