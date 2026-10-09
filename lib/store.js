'use strict';
// Penyimpanan JSON atomik. Cukup untuk 1 toko / ratusan pesanan per hari.
// Untuk skala besar, ganti dengan SQLite/PostgreSQL (semua akses data lewat modul ini + server.js).
const fs = require('fs');
const path = require('path');
const C = require('./config');

let db = null;

function load(seed) {
  fs.mkdirSync(path.dirname(C.dataFile), { recursive: true });
  if (fs.existsSync(C.dataFile)) {
    try { db = JSON.parse(fs.readFileSync(C.dataFile, 'utf8')); }
    catch (e) {
      fs.copyFileSync(C.dataFile, C.dataFile + '.rusak-' + Date.now());
      console.error('db.json rusak, dibackup dan dibuat ulang');
    }
  }
  if (!db) { db = seed(); save(); }
  return db;
}

function save() {
  const tmp = C.dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, C.dataFile);
}

module.exports = { load, save, get: () => db };
