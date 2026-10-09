'use strict';
const crypto = require('crypto');

module.exports = function seed() {
  return {
    secret: crypto.randomBytes(32).toString('hex'),
    // Kuota harian per bagian ayam (dikurangi saat pesanan dibuat, dikembalikan bila batal)
    stock: { dada: 40, paha_atas: 40, paha_bawah: 50, sayap: 50 },
    menu: [
      { id: 'p-hemat1', cat: 'paket', name: 'Paket Hemat 1', emoji: '🍱', desc: '1 ayam krispi + nasi + es teh manis', price: 20000, normalPrice: 23000, pieces: 1, custom: true, spicy: false, available: true },
      { id: 'p-berdua', cat: 'paket', name: 'Paket Berdua', emoji: '🍱', desc: '2 ayam krispi + 2 nasi + 2 es teh manis', price: 40000, normalPrice: 46000, pieces: 2, custom: true, spicy: false, available: true },
      { id: 'p-keluarga', cat: 'paket', name: 'Paket Keluarga', emoji: '🪣', desc: '4 ayam krispi + 2 nasi + 2 es teh manis', price: 62000, normalPrice: 72000, pieces: 4, custom: true, spicy: false, available: true, badge: 'Paling hemat' },
      { id: 'a-krispi', cat: 'ayam', name: 'Ayam Goreng Krispi', emoji: '🍗', desc: 'Tepung bumbu rahasia, digoreng saat dipesan. Per potong.', price: 13000, pieces: 1, custom: true, spicy: false, available: true },
      { id: 'g-geprek', cat: 'geprek', name: 'Ayam Geprek Sambal Bawang', emoji: '🌶️', desc: '1 ayam krispi digeprek dengan sambal bawang + nasi', price: 19000, pieces: 1, custom: true, spicy: true, available: true },
      { id: 'g-keju', cat: 'geprek', name: 'Geprek Keju Leleh', emoji: '🧀', desc: '1 ayam geprek + saus keju + nasi', price: 24000, pieces: 1, custom: true, spicy: true, available: true },
      { id: 'g-mentai', cat: 'geprek', name: 'Geprek Mentai', emoji: '🔥', desc: '1 ayam geprek + saus mentai torch + nasi', price: 26000, pieces: 1, custom: true, spicy: true, available: true, badge: 'Baru' },
      { id: 't-nasi', cat: 'tambahan', name: 'Nasi Putih', emoji: '🍚', desc: 'Nasi hangat', price: 5000, pieces: 0, custom: false, spicy: false, available: true },
      { id: 't-kulit', cat: 'tambahan', name: 'Kulit Ayam Kriuk', emoji: '🥠', desc: 'Kulit ayam goreng kering, porsi cemilan', price: 8000, pieces: 0, custom: false, spicy: false, available: true },
      { id: 't-kentang', cat: 'tambahan', name: 'Kentang Goreng', emoji: '🍟', desc: 'Potongan tebal, taburan bumbu', price: 10000, pieces: 0, custom: false, spicy: false, available: true },
      { id: 't-sup', cat: 'tambahan', name: 'Sup Ayam Hangat', emoji: '🍲', desc: 'Kuah bening dengan wortel dan kentang', price: 6000, pieces: 0, custom: false, spicy: false, available: true },
      { id: 'm-esteh', cat: 'minuman', name: 'Es Teh Manis', emoji: '🧋', desc: 'Teh seduh, gula cair', price: 5000, pieces: 0, custom: false, spicy: false, available: true },
      { id: 'm-jeruk', cat: 'minuman', name: 'Es Jeruk', emoji: '🍊', desc: 'Jeruk peras segar', price: 7000, pieces: 0, custom: false, spicy: false, available: true },
      { id: 'm-air', cat: 'minuman', name: 'Air Mineral', emoji: '💧', desc: '600 ml', price: 4000, pieces: 0, custom: false, spicy: false, available: true },
    ],
    orders: [],
    seq: 0,
  };
};
