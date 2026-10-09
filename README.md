# Pesan Antar Ayam

Aplikasi pesan antar fried chicken: situs pelanggan (HP & desktop, bisa "Tambahkan ke layar utama") dan panel dapur untuk admin.
**Tanpa dependensi, tanpa build step.** Cukup Node.js 18+ (diuji di Node 22).

## Menjalankan (1 menit)

```bash
cp .env.example .env      # lalu ganti ADMIN_PASSWORD, STORE_*, dll.
npm start
```

- Pelanggan: http://localhost:3000
- Admin/dapur: http://localhost:3000/admin
- Tes otomatis: `npm test` (17 pemeriksaan end-to-end)

Untuk melihat alur pelacakan berjalan sendiri tanpa admin, set `AUTOPILOT=1` di `.env` (hanya demo).

## Agar bisa diakses umum

Butuh server yang selalu menyala (VPS) dan domain. Pilih salah satu:

**A. Docker** (paling mudah)
```bash
cp .env.example .env && nano .env
docker compose up -d --build
```

**B. VPS biasa (Ubuntu)**
```bash
sudo mkdir -p /opt/pesan-ayam && sudo cp -r . /opt/pesan-ayam && cd /opt/pesan-ayam
cp .env.example .env && nano .env
sudo chown -R www-data:www-data /opt/pesan-ayam
sudo cp deploy/pesan-ayam.service /etc/systemd/system/ && sudo systemctl enable --now pesan-ayam
sudo cp deploy/nginx.conf /etc/nginx/sites-available/pesan-ayam   # ganti nama domain
sudo ln -s /etc/nginx/sites-available/pesan-ayam /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ayam.contoh.com
```
Set `TRUST_PROXY=1` di `.env` bila memakai Nginx/Cloudflare. **HTTPS wajib**: browser HP hanya mengizinkan GPS lewat HTTPS.

Data tersimpan di `data/db.json` (volume `/data` di Docker). Backup file itu secara berkala.

## Fitur dan letaknya

| Kebutuhan | Yang sudah ada |
|---|---|
| Pilih bagian ayam + kuota otomatis | Dada / paha atas / paha bawah / sayap per potong. Kuota harian dikurangi saat pesanan dibuat, dikembalikan bila batal atau tidak dibayar 15 menit. Dada +Rp2.000/potong. Admin mengisi kuota di tab "Kuota & menu". |
| Kustomisasi & add-on | Upgrade nasi jumbo, saus keju/mentai/geprek, kulit kriuk, kentang, sup, catatan dapur (`lib/pricing.js` → `OPTIONS`). |
| Tingkat pedas | 6 level pada menu geprek (flag `spicy` di `data/seed.js`). |
| Estimasi waktu | Waktu masak (dari antrean dapur + jumlah potong) + waktu antar (jarak ÷ 25 km/jam). |
| Kurir instan | `lib/courier.js`: mode `demo` dan `manual` (driver internal) sudah jalan. Adapter Lalamove/GrabExpress/GoSend berupa kerangka, lihat catatan di bawah. |
| Kemasan anti-lepek | Opsi di checkout (+Rp1.500, atur `PACKAGING_FEE`), tampil sebagai label di kartu pesanan dapur. |
| Pembayaran | QRIS, GoPay, OVO, DANA, ShopeePay, COD. Lihat catatan di bawah. |
| Pelacakan live | Diterima → Digoreng → Driver menuju lokasi → Selesai, diperbarui tiap 4 detik, lengkap dengan data driver. |
| Pin peta | Peta OpenStreetMap (Leaflet) dengan pin di tengah, cari alamat, tombol GPS, tautan cek di Google Maps. Jangkauan maks. `MAX_KM`. |
| Saran kombo | Keranjang berisi ayam satuan memunculkan saran Paket Hemat 1 / Berdua / Keluarga lengkap dengan nominal hemat. |
| Voucher | `GRATISONGKIR`, `HEMAT10K`, `AYAMBARU`; diklik langsung di checkout. Ubah di `lib/pricing.js` → `VOUCHERS`. |
| Pesan ulang | Halaman "Pesanan saya" (berdasarkan perangkat) dengan tombol satu klik. |

## Yang masih perlu Anda lengkapi sebelum menerima uang sungguhan

1. **Pembayaran masih simulasi.** Dengan `PAYMENT_MODE=demo`, halaman bayar menampilkan QR contoh dan tombol "Simulasikan pembayaran berhasil". Integrasi QRIS/e-wallet nyata butuh akun merchant (Midtrans, Xendit, Duitku, dll.). Isi `createPayment()` di `lib/payment.js`, arahkan webhook gateway ke `POST /api/payments/webhook` (header `x-callback-token` = `PAYMENT_WEBHOOK_SECRET`), lalu set `PAYMENT_MODE=live`. Mode live mematikan tombol simulasi.
2. **Kurir pihak ketiga** butuh akun bisnis dan API key penyedia. Isi adapter di `lib/courier.js` (kontrak fungsinya ada di komentar file). Sampai itu selesai, pakai `COURIER_PROVIDER=manual` / isi nama driver di panel admin.
3. **Peta memakai OpenStreetMap**, gratis tanpa API key. Pencarian alamat memakai layanan Nominatim publik (cocok untuk trafik kecil). Untuk Google Maps/Places, ganti `initMap()` dan `mapSearch()` di `public/app.js` dengan API key Anda.
4. **Ganti `ADMIN_PASSWORD`**. Server memberi peringatan saat masih bernilai default.

## Catatan teknis & keamanan

- Harga, ongkir, diskon, stok, dan ETA dihitung ulang di server; angka dari browser tidak dipercaya.
- Nomor pesanan acak (`AYM-XXXXXXXX`) berfungsi sebagai kunci akses halaman pelacakan. Siapa pun yang memegang nomornya bisa melihat pesanan itu.
- Ada pembatas laju untuk pembuatan pesanan, quote, dan login admin.
- Penyimpanan berupa file JSON atomik, cukup untuk satu toko. Jika pesanan mencapai ribuan per hari atau perlu beberapa server, pindahkan ke SQLite/PostgreSQL (akses data ada di `server.js` dan `lib/store.js`).
- Notifikasi WhatsApp/SMS ke pelanggan belum ada; pelanggan memantau lewat halaman pelacakan, dan admin mendapat bunyi bip saat pesanan baru masuk selama panel admin terbuka.
