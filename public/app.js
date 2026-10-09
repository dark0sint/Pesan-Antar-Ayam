(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem('ayam:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('ayam:' + k, JSON.stringify(v)); } catch {} },
};
async function api(path, opt = {}) {
  const r = await fetch(path, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan, coba lagi');
  return j;
}
const clock = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const dateTime = (t) => new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const S = {
  cfg: null, menu: [], stock: {}, cat: 'paket',
  cart: ls.get('cart', []), loc: ls.get('loc', null), cust: ls.get('cust', {}),
  voucher: '', antiLepek: true, pay: ls.get('pay', 'qris'), quote: null, quoteErr: null, addrAuto: false,
};
const V = $('#view');
const item = (id) => S.menu.find((m) => m.id === id);
const saveCart = () => ls.set('cart', S.cart);
let timers = [];
const clearTimers = () => { timers.forEach(clearInterval); timers = []; };
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- harga lokal (hanya tampilan; server menghitung ulang) ---------- */
function lineTotal(l) {
  const it = item(l.itemId); if (!it) return 0;
  const opt = (l.options || []).reduce((s, id) => s + ((S.cfg.options.find((o) => o.id === id) || {}).price || 0), 0);
  const sur = Object.entries(l.parts || {}).reduce((s, [k, v]) => s + v * S.cfg.parts[k].surcharge, 0);
  return (it.price + opt) * l.qty + sur;
}
function lineDetail(l) {
  const it = item(l.itemId); const bits = [];
  const parts = Object.entries(l.parts || {}).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${S.cfg.parts[k].label}`);
  if (parts.length) bits.push(parts.join(', '));
  if (it && it.spicy) bits.push(S.cfg.spice[l.spice] || '');
  (l.options || []).forEach((id) => { const o = S.cfg.options.find((x) => x.id === id); if (o) bits.push(o.name); });
  if (l.note) bits.push('Catatan: ' + l.note);
  return bits.filter(Boolean).join(', ');
}
const cartCount = () => S.cart.reduce((s, l) => s + l.qty, 0);
const cartSubtotal = () => S.cart.reduce((s, l) => s + lineTotal(l), 0);
const soldOut = (it) => it.pieces > 0 && Object.keys(S.cfg.parts).every((k) => (S.stock[k] || 0) <= 0);

/* ---------- menu ---------- */
function renderCats() {
  $('#cats').innerHTML = S.cfg.categories.map((c) => `<button class="cat" data-cat="${c.id}" aria-current="${c.id === S.cat}">${esc(c.name)}</button>`).join('');
}
function renderMenu() {
  const items = S.menu.filter((m) => m.cat === S.cat);
  $('#menu').innerHTML = items.map((m) => {
    const off = !m.available || soldOut(m);
    const save = m.normalPrice && m.normalPrice > m.price ? `<span class="was">${rp(m.normalPrice)}</span><span class="save">Hemat ${rp(m.normalPrice - m.price)}</span>` : '';
    const simple = m.pieces === 0 && !m.custom;
    return `<article class="item ${off ? 'off' : ''}">
      ${m.badge ? `<span class="badge">${esc(m.badge)}</span>` : ''}
      <div class="item-pic" aria-hidden="true">${m.emoji}</div>
      <div><h3>${esc(m.name)}</h3><p>${esc(m.desc)}</p></div>
      <div class="item-foot"><span class="price">${rp(m.price)}${save}</span>
      ${off ? `<span class="muted small">${m.available ? 'Habis hari ini' : 'Tidak tersedia'}</span>`
        : `<button class="btn sm" data-add="${m.id}" data-simple="${simple ? 1 : 0}">${simple ? 'Tambah' : 'Pilih'}</button>`}</div>
    </article>`;
  }).join('') || '<p class="muted">Belum ada menu di kategori ini.</p>';
}

/* ---------- keranjang ---------- */
function addSimple(it) {
  const ex = S.cart.find((l) => l.itemId === it.id && !(l.options || []).length && !l.note);
  if (ex) ex.qty = Math.min(20, ex.qty + 1); else S.cart.push({ itemId: it.id, qty: 1, parts: {}, spice: 0, options: [], note: '' });
  saveCart(); renderCart(); refreshQuote(); toast(`${it.name} masuk keranjang`);
}
function comboTip() {
  const singles = S.cart.filter((l) => (item(l.itemId) || {}).cat === 'ayam').reduce((s, l) => s + l.qty, 0);
  if (!singles) return '';
  const has = (id) => S.cart.some((l) => l.itemId === id);
  const target = singles >= 3 ? 'p-keluarga' : singles === 2 ? 'p-berdua' : 'p-hemat1';
  const it = item(target);
  if (!it || !it.available || has(target) || !it.normalPrice) return '';
  return `<div class="notice tip">Beli ayam satuan? <b>${esc(it.name)}</b> (${esc(it.desc)}) cuma ${rp(it.price)}, hemat ${rp(it.normalPrice - it.price)} dibanding beli terpisah.<br><button class="btn light sm" data-add="${it.id}" data-simple="0">Lihat paket</button></div>`;
}
function renderCart() {
  const body = $('#cartBody');
  const n = cartCount();
  const bar = $('#cartBar');
  const onHome = !$('#home').hidden;
  bar.hidden = !(n && onHome);
  bar.innerHTML = `<span>${n} item di keranjang</span><span>${rp(cartSubtotal())}</span>`;
  if (!S.cart.length) {
    body.innerHTML = '<div class="empty"><div class="big">🪣</div><p>Keranjang masih kosong.<br>Pilih ayam favoritmu dulu.</p></div>';
    return;
  }
  const q = S.quote;
  body.innerHTML = S.cart.map((l, i) => {
    const it = item(l.itemId);
    if (!it) return '';
    const simple = it.pieces === 0 && !it.custom;
    return `<div class="line">
      <div class="nm">${esc(it.name)}${simple ? '' : ' × ' + l.qty}</div><div class="pr">${rp(lineTotal(l))}</div>
      ${lineDetail(l) ? `<div class="dt">${esc(lineDetail(l))}</div>` : ''}
      <div class="ac">
        ${simple ? `<span class="stepper"><button data-q="-1" data-i="${i}" aria-label="Kurangi">−</button><span>${l.qty}</span><button data-q="1" data-i="${i}" aria-label="Tambah" ${l.qty >= 20 ? 'disabled' : ''}>+</button></span>`
          : `<button class="link" data-edit="${i}">Ubah</button>`}
        <button class="link" data-del="${i}">Hapus</button>
      </div></div>`;
  }).join('') + comboTip()
    + (S.quoteErr ? `<div class="notice err">${esc(S.quoteErr)}${S.quoteErr.includes('Stok') || S.quoteErr.includes('habis') || S.quoteErr.includes('pilih') ? '<br>Tekan "Ubah" pada menu terkait untuk memperbaiki pilihan.' : ''}</div>` : '')
    + `<div class="sum-row"><span>Subtotal</span><span>${rp(q ? q.subtotal : cartSubtotal())}</span></div>
       <p class="muted small" style="margin:4px 0 12px">Ongkir dan estimasi tiba dihitung setelah kamu menentukan titik antar.</p>
       <button class="btn block" id="toCheckout" ${S.quoteErr ? 'disabled' : ''}>Lanjut ke pembayaran</button>`;
}
let qt;
function refreshQuote() {
  clearTimeout(qt);
  qt = setTimeout(async () => {
    if (!S.cart.length) { S.quote = null; S.quoteErr = null; renderCart(); renderDyn(); return; }
    try {
      S.quote = await api('/api/quote', { method: 'POST', body: { lines: S.cart, lat: S.loc && S.loc.lat, lng: S.loc && S.loc.lng, voucher: S.voucher, antiLepek: S.antiLepek } });
      S.quoteErr = null;
    } catch (e) { S.quote = null; S.quoteErr = e.message; }
    renderCart(); renderDyn();
  }, 200);
}
const openCart = () => $('#cart').classList.add('open');
const closeCart = () => $('#cart').classList.remove('open');

/* ---------- sheet pilih menu ---------- */
function closeSheet() { $('#sheetRoot').innerHTML = ''; }
function openSheet(itemId, idx = null) {
  const it = item(itemId); if (!it || !it.available) return;
  const ex = idx != null ? S.cart[idx] : null;
  const d = ex ? JSON.parse(JSON.stringify(ex)) : { itemId, qty: 1, parts: {}, spice: it.spicy ? 2 : 0, options: [], note: '' };
  const root = $('#sheetRoot');
  const need = () => it.pieces * d.qty;
  const sum = () => Object.values(d.parts).reduce((a, b) => a + b, 0);
  const avail = () => {
    const used = {};
    S.cart.forEach((l, i) => { if (i !== idx) for (const k in l.parts) used[k] = (used[k] || 0) + l.parts[k]; });
    const a = {};
    for (const k in S.cfg.parts) a[k] = Math.max(0, (S.stock[k] || 0) - (used[k] || 0));
    return a;
  };
  function trim() {
    let over = sum() - need();
    for (const k of Object.keys(d.parts).reverse()) {
      if (over <= 0) break;
      const c = Math.min(d.parts[k], over); d.parts[k] -= c; over -= c;
      if (!d.parts[k]) delete d.parts[k];
    }
  }
  function autofill() {
    const a = avail(); d.parts = {}; let left = need();
    const keys = Object.keys(a).sort((x, y) => a[y] - a[x]);
    let guard = 0;
    while (left > 0 && guard++ < 500) {
      let moved = false;
      for (const k of keys) { if (left <= 0) break; if ((d.parts[k] || 0) < a[k]) { d.parts[k] = (d.parts[k] || 0) + 1; left--; moved = true; } }
      if (!moved) break;
    }
  }
  if (it.pieces > 0 && !ex) autofill();

  function html() {
    const a = avail(); const n = need(); const s = sum();
    let h = `<div class="scrim" data-scrim><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(it.name)}">
      <div class="sheet-head"><div><h2>${esc(it.name)}</h2><p class="muted small" style="margin:4px 0 0">${esc(it.desc)}</p></div><button class="icon-btn" data-act="close" aria-label="Tutup">✕</button></div>
      <div class="sec"><h3>Jumlah</h3><span class="stepper"><button data-act="q-" ${d.qty <= 1 ? 'disabled' : ''} aria-label="Kurangi">−</button><span>${d.qty}</span><button data-act="q+" ${d.qty >= 10 ? 'disabled' : ''} aria-label="Tambah">+</button></span></div>`;
    if (it.pieces > 0) {
      h += `<div class="sec"><h3>Pilih bagian ayam <small class="${s === n ? 'good' : ''}">${s} dari ${n} potong</small></h3>`;
      for (const k of Object.keys(S.cfg.parts)) {
        const p = S.cfg.parts[k]; const have = a[k]; const cur = d.parts[k] || 0;
        const st = have <= 0 ? '<span class="stock out">Habis</span>' : have <= 5 ? `<span class="stock low">Tinggal ${have}</span>` : '<span class="stock">Tersedia</span>';
        h += `<div class="part"><div><b>${esc(p.label)}</b>${p.surcharge ? ` <span class="small muted">+${rp(p.surcharge)}/potong</span>` : ''}<br>${st}</div>
          <span class="stepper"><button data-act="p-" data-k="${k}" ${cur <= 0 ? 'disabled' : ''} aria-label="Kurangi ${esc(p.label)}">−</button><span>${cur}</span><button data-act="p+" data-k="${k}" ${s >= n || cur >= have ? 'disabled' : ''} aria-label="Tambah ${esc(p.label)}">+</button></span></div>`;
      }
      h += `<p style="margin:10px 0 0"><button class="link" data-act="auto">Pilihkan otomatis dari yang tersedia</button></p></div>`;
    }
    if (it.spicy) {
      h += `<div class="sec"><h3>Tingkat kepedasan</h3><div class="spice">` + S.cfg.spice.map((t, i) =>
        `<button data-act="spice" data-v="${i}" aria-pressed="${d.spice === i}"><span class="fl">${i ? '🌶️'.repeat(Math.min(i, 3)) : '🙂'}</span>${esc(t)}</button>`).join('') + '</div></div>';
    }
    if (it.custom) {
      h += '<div class="sec"><h3>Tambahan</h3>';
      let g = '';
      for (const o of S.cfg.options) {
        if (o.group !== g) { g = o.group; h += `<p class="opt-g">${esc(g)}</p>`; }
        h += `<label class="opt"><span>${esc(o.name)} <span class="muted small">+${rp(o.price)}</span></span><input type="checkbox" data-opt="${o.id}" ${d.options.includes(o.id) ? 'checked' : ''}></label>`;
      }
      h += '</div>';
    }
    const ready = it.pieces === 0 || s === n;
    h += `<label class="field"><span>Catatan untuk dapur (opsional)</span><input id="shNote" maxlength="100" value="${esc(d.note)}" placeholder="Contoh: tepung dikurangi"></label>
      <div class="sheet-foot"><button class="btn block" data-act="save" ${ready ? '' : 'disabled'}>${ex ? 'Simpan perubahan' : 'Tambah ke keranjang'} · ${rp(lineTotal(d))}</button>
      ${ready ? '' : `<p class="muted small" style="text-align:center;margin:6px 0 0">Lengkapi pilihan ${n} potong ayam dulu.</p>`}</div></div></div>`;
    return h;
  }
  function draw() {
    const prev = root.querySelector('.sheet'); const top = prev ? prev.scrollTop : 0;
    root.innerHTML = html();
    const sh = root.querySelector('.sheet'); sh.scrollTop = top;
    const note = $('#shNote'); if (note) note.oninput = () => { d.note = note.value; };
    root.querySelectorAll('[data-opt]').forEach((c) => c.onchange = () => {
      const id = c.dataset.opt; d.options = c.checked ? [...new Set([...d.options, id])] : d.options.filter((x) => x !== id); draw();
    });
  }
  root.onclick = (e) => {
    if (e.target.matches('[data-scrim]')) return closeSheet();
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, k = b.dataset.k;
    if (act === 'close') return closeSheet();
    if (act === 'q-') { d.qty--; trim(); }
    else if (act === 'q+') { d.qty++; if (it.pieces > 0) { const a = avail(); if (need() > Object.values(a).reduce((x, y) => x + y, 0)) { d.qty--; toast('Stok ayam tidak cukup untuk jumlah ini'); } } }
    else if (act === 'p+') d.parts[k] = (d.parts[k] || 0) + 1;
    else if (act === 'p-') { d.parts[k]--; if (!d.parts[k]) delete d.parts[k]; }
    else if (act === 'auto') autofill();
    else if (act === 'spice') d.spice = Number(b.dataset.v);
    else if (act === 'save') {
      const note = ($('#shNote') || {}).value || ''; d.note = note.slice(0, 100);
      if (idx != null) S.cart[idx] = d; else S.cart.push(d);
      saveCart(); closeSheet(); renderCart(); refreshQuote(); toast(idx != null ? 'Pesanan diperbarui' : `${it.name} masuk keranjang`);
      return;
    }
    draw();
  };
  draw();
}

/* ---------- peta & checkout ---------- */
let map = null;
function destroyMap() { if (map) { map.remove(); map = null; } }
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=id&lat=${lat}&lon=${lng}`);
    const j = await r.json(); return j.display_name || '';
  } catch { return ''; }
}
function setLoc(lat, lng) {
  S.loc = { lat: +lat.toFixed(6), lng: +lng.toFixed(6) }; ls.set('loc', S.loc);
  refreshQuote();
  const link = $('#mapsLink'); if (link) { link.hidden = false; link.href = `https://www.google.com/maps?q=${S.loc.lat},${S.loc.lng}`; }
  clearTimeout(setLoc.t);
  setLoc.t = setTimeout(async () => {
    const a = $('#addr'); if (!a) return;
    if (a.value.trim() && !S.addrAuto) return;
    const name = await reverseGeocode(S.loc.lat, S.loc.lng);
    if (name && $('#addr') && (!$('#addr').value.trim() || S.addrAuto)) { $('#addr').value = name; S.addrAuto = true; }
  }, 900);
}
function initMap() {
  const el = $('#map'); if (!el) return;
  if (!window.L) { el.innerHTML = '<p class="muted small" style="padding:16px">Peta belum bisa dimuat. Periksa koneksi, atau tekan "Gunakan lokasi saya".</p>'; return; }
  const st = S.cfg.store; const c = S.loc || { lat: st.lat, lng: st.lng };
  const t0 = Date.now();
  map = L.map(el, { zoomControl: true, attributionControl: true }).setView([c.lat, c.lng], S.loc ? 17 : 14);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  L.marker([st.lat, st.lng], { icon: L.divIcon({ html: '🍗', className: '', iconSize: [30, 30] }), interactive: false }).addTo(map);
  map.on('moveend', () => { if (Date.now() - t0 < 600) return; const m = map.getCenter(); setLoc(m.lat, m.lng); });
  if (S.loc) { const link = $('#mapsLink'); link.hidden = false; link.href = `https://www.google.com/maps?q=${S.loc.lat},${S.loc.lng}`; }
}
function viewCheckout() {
  if (!S.cart.length) { location.hash = '#/'; return; }
  closeCart();
  const cu = S.cust;
  V.innerHTML = `<button class="back" data-go="#/">← Kembali ke menu</button><h1>Checkout</h1>
  <div class="cols"><div>
    <section class="card"><h2>Titik antar</h2>
      <div class="row" style="margin-top:0"><label class="field" style="margin:0"><span>Cari alamat atau tempat</span><input id="mapQ" placeholder="Contoh: Mal Boemi Kedaton"></label><button class="btn light sm" id="mapGo" style="align-self:flex-end">Cari</button></div>
      <ul class="results" id="mapRes" hidden></ul>
      <div class="map-wrap" style="margin-top:10px"><div id="map"></div><div class="pin" aria-hidden="true">📍</div></div>
      <div class="row"><button class="btn light sm" id="geoBtn">Gunakan lokasi saya</button><a id="mapsLink" class="small" target="_blank" rel="noopener" hidden>Cek titik di Google Maps</a></div>
      <p class="muted small" style="margin:0">Geser peta sampai pin tepat di depan rumahmu. Pin yang akurat membuat kurir tidak berputar-putar dan ayam tetap hangat.</p>
      <label class="field"><span>Alamat lengkap</span><textarea id="addr" rows="2" maxlength="250" placeholder="Nama jalan, nomor rumah, RT/RW, patokan">${esc(cu.address || '')}</textarea></label>
    </section>
    <section class="card"><h2>Penerima</h2>
      <div class="row" style="margin-top:0"><label class="field"><span>Nama</span><input id="cName" autocomplete="name" maxlength="60" value="${esc(cu.name || '')}"></label>
      <label class="field"><span>Nomor HP</span><input id="cPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="08123456789" value="${esc(cu.phone || '')}"></label></div>
      <label class="field"><span>Catatan untuk kurir (opsional)</span><input id="cNote" maxlength="150" placeholder="Contoh: pagar hitam, titip di satpam" value="${esc(cu.note || '')}"></label>
    </section>
    <section class="card"><h2>Kemasan</h2>
      <label class="switch"><input type="checkbox" id="anti" ${S.antiLepek ? 'checked' : ''}><span><b>Kemasan anti-lepek</b> (+${rp(S.cfg.packagingFee)})<br><span class="muted small">Kotak berlubang udara agar uap keluar dan kulit ayam tetap renyah selama perjalanan.</span></span></label>
    </section>
    <section class="card"><h2>Voucher</h2><div id="vch" class="vouchers"></div></section>
    <section class="card"><h2>Metode pembayaran</h2>
      ${S.cfg.payments.map((p) => `<label class="pay"><input type="radio" name="pay" value="${p.id}" ${S.pay === p.id ? 'checked' : ''}><span><b>${esc(p.label)}</b><small>${esc(p.desc)}</small></span></label>`).join('')}
    </section>
  </div>
  <aside class="stick"><section class="card"><h2>Ringkasan</h2><div id="sum"></div><button class="btn block" id="placeBtn" style="margin-top:12px">Bayar dan pesan</button><p class="muted small" id="placeHint" style="text-align:center;margin:8px 0 0"></p></section></aside></div>`;
  initMap(); renderDyn(); refreshQuote();
}
function renderDyn() {
  const sum = $('#sum'); if (!sum) return;
  const q = S.quote;
  const vch = $('#vch');
  if (vch) {
    vch.innerHTML = q ? q.vouchers.map((v) => `<button class="voucher" data-v="${v.code}" aria-pressed="${S.voucher === v.code}" ${v.eligible ? '' : 'disabled'}><span><b>${esc(v.title)}</b><span class="muted small">${esc(v.desc)}</span></span><span class="small">${S.voucher === v.code ? 'Terpakai' : v.eligible ? 'Pakai' : 'Belum cukup'}</span></button>`).join('') : '<p class="muted small">Voucher muncul setelah keranjang terisi.</p>';
  }
  if (!q) { sum.innerHTML = `<div class="notice err">${esc(S.quoteErr || 'Menghitung...')}</div>`; setPlace(false, S.quoteErr || ''); return; }
  let eta = '';
  if (q.outOfRange) eta = `<div class="notice err">Titik antar terlalu jauh (${q.km} km). Jangkauan maksimal ${q.maxKm} km dari toko.</div>`;
  else if (q.feeKnown) eta = `<div class="eta"><span style="font-size:1.8rem">🛵</span><div>Estimasi tiba <big>±${q.eta.total} menit</big><span class="muted small">Masak ${q.eta.cook} menit + antar ${q.eta.travel} menit (${q.km} km)</span></div></div>`;
  else eta = '<div class="notice tip">Geser peta untuk menentukan titik antar, lalu ongkir dan estimasi tiba akan muncul.</div>';
  sum.innerHTML = eta
    + q.lines.map((l) => `<div class="sum-row"><span>${l.qty}× ${esc(l.name)}</span><span>${rp(l.total)}</span></div>`).join('')
    + `<div class="sum-row" style="border-top:1px dashed var(--line);margin-top:6px;padding-top:8px"><span>Subtotal</span><span>${rp(q.subtotal)}</span></div>`
    + (q.packagingFee ? `<div class="sum-row"><span>Kemasan anti-lepek</span><span>${rp(q.packagingFee)}</span></div>` : '')
    + `<div class="sum-row"><span>Ongkir</span><span>${q.feeKnown ? rp(q.deliveryFee) : '-'}</span></div>`
    + (q.shipDiscount ? `<div class="sum-row disc"><span>Gratis ongkir</span><span>−${rp(q.shipDiscount)}</span></div>` : '')
    + (q.discount ? `<div class="sum-row disc"><span>Voucher ${esc(q.voucher)}</span><span>−${rp(q.discount)}</span></div>` : '')
    + (q.voucherError ? `<div class="notice err">${esc(q.voucherError)}</div>` : '')
    + `<div class="sum-row total"><span>Total</span><span>${rp(q.total)}</span></div>`;
  setPlace(q.feeKnown && !q.outOfRange, q.feeKnown ? '' : 'Tentukan titik antar di peta dulu.');
}
function setPlace(ok, hint) {
  const b = $('#placeBtn'); if (!b) return;
  b.disabled = !ok; $('#placeHint').textContent = hint || '';
  const m = S.cfg.payments.find((p) => p.id === S.pay);
  b.textContent = S.pay === 'cod' ? 'Pesan, bayar di tempat' : `Bayar dengan ${m ? m.label : ''}`;
  if (S.quote && ok) b.textContent += ` · ${rp(S.quote.total)}`;
}
async function mapSearch() {
  const q = $('#mapQ').value.trim(); if (!q) return;
  const ul = $('#mapRes'); ul.hidden = false; ul.innerHTML = '<li style="padding:10px 12px" class="muted small">Mencari...</li>';
  try {
    const st = S.cfg.store;
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=id&accept-language=id&viewbox=${st.lng - 0.4},${st.lat + 0.4},${st.lng + 0.4},${st.lat - 0.4}&q=${encodeURIComponent(q)}`);
    const j = await r.json();
    ul.innerHTML = j.length ? j.map((x, i) => `<li><button data-res="${i}">${esc(x.display_name)}</button></li>`).join('') : '<li style="padding:10px 12px" class="muted small">Tidak ditemukan. Coba kata kunci lain atau geser peta manual.</li>';
    ul.onclick = (e) => { const b = e.target.closest('[data-res]'); if (!b) return; const x = j[+b.dataset.res]; ul.hidden = true; goTo(+x.lat, +x.lon); };
  } catch { ul.innerHTML = '<li style="padding:10px 12px" class="muted small">Pencarian gagal. Geser peta manual saja.</li>'; }
}
function goTo(lat, lng) {
  if (map) map.setView([lat, lng], 17); else setLoc(lat, lng);
  if (map) setTimeout(() => { if (!S.loc || Math.abs(S.loc.lat - lat) > 0.0005) setLoc(lat, lng); }, 700);
}
function geolocate() {
  if (!navigator.geolocation) return toast('Perangkat tidak mendukung lokasi');
  toast('Mencari lokasimu...');
  navigator.geolocation.getCurrentPosition((p) => goTo(p.coords.latitude, p.coords.longitude),
    () => toast('Lokasi tidak bisa diakses. Izinkan lokasi di browser (butuh HTTPS), atau geser peta manual.'),
    { enableHighAccuracy: true, timeout: 12000 });
}
function saveCust() {
  S.cust = { name: ($('#cName') || {}).value || '', phone: ($('#cPhone') || {}).value || '', address: ($('#addr') || {}).value || '', note: ($('#cNote') || {}).value || '' };
  ls.set('cust', S.cust);
}
async function placeOrder() {
  saveCust();
  const c = S.cust;
  if (c.name.trim().length < 2) { toast('Isi nama penerima'); return $('#cName').focus(); }
  if (!/^(\+62|62|0)8\d{7,12}$/.test(c.phone.replace(/[\s-]/g, ''))) { toast('Nomor HP belum benar, contoh 081234567890'); return $('#cPhone').focus(); }
  if (c.address.trim().length < 5) { toast('Lengkapi alamat antar'); return $('#addr').focus(); }
  if (!S.loc) return toast('Tentukan titik antar di peta');
  const b = $('#placeBtn'); const label = b.textContent; b.disabled = true; b.textContent = 'Memproses...';
  try {
    const o = await api('/api/orders', { method: 'POST', body: { customer: c, lines: S.cart, lat: S.loc.lat, lng: S.loc.lng, voucher: S.voucher, antiLepek: S.antiLepek, paymentMethod: S.pay } });
    const ids = ls.get('orders', []); ids.unshift(o.id); ls.set('orders', ids.slice(0, 30));
    S.cart = []; saveCart(); S.voucher = ''; S.quote = null;
    location.hash = o.payment.status === 'unpaid' ? '#/bayar/' + o.id : '#/pesanan/' + o.id;
  } catch (e) { toast(e.message); b.disabled = false; b.textContent = label; refreshQuote(); }
}

/* ---------- pembayaran ---------- */
function drawQR(canvas, seed) {
  const N = 29, px = 8; canvas.width = canvas.height = N * px;
  const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  let h = 1779033703; for (const ch of seed) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  const rnd = () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const finder = (x, y) => { g.fillStyle = '#000'; g.fillRect(x * px, y * px, 7 * px, 7 * px); g.fillStyle = '#fff'; g.fillRect((x + 1) * px, (y + 1) * px, 5 * px, 5 * px); g.fillStyle = '#000'; g.fillRect((x + 2) * px, (y + 2) * px, 3 * px, 3 * px); };
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
  g.fillStyle = '#000';
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFinder(x, y) && rnd() > 0.52) g.fillRect(x * px, y * px, px, px);
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
}
async function viewPay(id) {
  let o;
  try { o = await api('/api/orders/' + id); } catch (e) { V.innerHTML = `<div class="notice err">${esc(e.message)}</div><button class="back" data-go="#/">← Ke menu</button>`; return; }
  if (o.status !== 'pending_payment') { location.hash = '#/pesanan/' + id; return; }
  const isQ = o.payment.method === 'qris';
  const demo = S.cfg.paymentMode === 'demo';
  V.innerHTML = `<div class="pay-box"><div class="card">
    <h1 style="margin-top:0">Selesaikan pembayaran</h1>
    <p class="muted" style="margin:0">Pesanan ${esc(o.id)} · ${esc(o.payment.label)}</p>
    <p style="font:800 2rem var(--display);margin:10px 0">${rp(o.pricing.total)}</p>
    <div class="countdown" id="cd">--:--</div><p class="muted small" style="margin:0">Sisa waktu bayar. Setelah habis, pesanan dibatalkan dan stok ayam dilepas.</p>
    ${isQ ? '<canvas id="qr" class="qr" aria-label="Kode QR contoh"></canvas>' : `<p style="margin:16px 0">Buka aplikasi <b>${esc(o.payment.label)}</b> dan setujui tagihan atas nama <b>${esc(S.cfg.store.name)}</b>.</p>`}
    ${demo ? `<div class="notice tip">Mode demo: ini bukan pembayaran sungguhan${isQ ? ' dan QR di atas hanya contoh' : ''}.</div><button class="btn block" id="demoPay">Simulasikan pembayaran berhasil</button>` : '<p class="muted small">Halaman ini otomatis berpindah setelah pembayaran terkonfirmasi.</p>'}
    <p style="margin-top:14px"><button class="link" data-go="#/pesanan/${esc(o.id)}">Lihat status pesanan</button></p>
  </div></div>`;
  if (isQ) drawQR($('#qr'), o.id);
  const tick = () => { const left = Math.max(0, Math.floor((o.payment.expiresAt - Date.now()) / 1000)); const el = $('#cd'); if (el) el.textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'); };
  tick(); timers.push(setInterval(tick, 1000));
  timers.push(setInterval(async () => { try { const n = await api('/api/orders/' + id); if (n.status !== 'pending_payment') location.hash = '#/pesanan/' + id; } catch {} }, 3000));
  const db = $('#demoPay');
  if (db) db.onclick = async () => { db.disabled = true; try { await api(`/api/orders/${id}/pay-demo`, { method: 'POST' }); location.hash = '#/pesanan/' + id; } catch (e) { toast(e.message); db.disabled = false; } };
}

/* ---------- pelacakan ---------- */
const STEPS = [['received', 'Pesanan diterima', '🧾'], ['cooking', 'Sedang digoreng', '🍳'], ['delivering', 'Driver menuju lokasi', '🛵'], ['done', 'Pesanan selesai', '✅']];
const STATUS_LABEL = { pending_payment: 'Menunggu pembayaran', received: 'Diterima', cooking: 'Digoreng', delivering: 'Diantar', done: 'Selesai', cancelled: 'Dibatalkan' };
function trackHtml(o) {
  const idx = ['received', 'cooking', 'delivering', 'done'].indexOf(o.status);
  const at = (s) => { const t = o.timeline.find((x) => x.status === s); return t ? clock(t.at) : ''; };
  let head = '';
  if (o.status === 'cancelled') head = `<div class="notice err"><b>Pesanan dibatalkan.</b> ${esc(o.cancelReason || '')}${o.payment.refundNeeded ? '<br>Pembayaranmu akan dikembalikan oleh toko.' : ''}</div>`;
  else if (o.status === 'pending_payment') head = `<div class="notice tip">Pesanan menunggu pembayaran. <button class="link" data-go="#/bayar/${esc(o.id)}">Bayar sekarang</button></div>`;
  else if (o.status === 'done') head = '<div class="notice ok"><b>Ayam sudah sampai.</b> Selamat menikmati!</div>';
  else {
    const mins = Math.round((o.etaAt - Date.now()) / 60000);
    head = `<div class="eta"><span style="font-size:1.8rem">⏱️</span><div>Estimasi tiba pukul <big>${clock(o.etaAt)}</big><span class="muted small">${mins > 1 ? `sekitar ${mins} menit lagi` : 'sebentar lagi tiba'}</span></div></div>`;
  }
  const hint = { received: 'Dapur sudah menerima pesananmu.', cooking: o.antiLepek ? 'Ayam digoreng saat ini, lalu dikemas di kotak anti-lepek.' : 'Ayam sedang digoreng.', delivering: 'Kurir sudah membawa ayammu.', done: 'Terima kasih sudah memesan.' };
  const steps = o.status === 'cancelled' || o.status === 'pending_payment' ? '' : `<ol class="steps">${STEPS.map(([k, t, ic], i) => {
    const cls = o.status === 'done' || idx > i ? 'done' : idx === i ? 'now' : '';
    return `<li class="${cls}"><span class="dot">${cls === 'done' ? '✓' : ic}</span><div><b>${t}</b><span class="muted small">${cls === 'now' || cls === 'done' ? hint[k] : ''}</span></div><span class="tm">${at(k)}</span></li>`;
  }).join('')}</ol>`;
  const c = o.courier ? `<div class="notice ok">🛵 <b>${esc(o.courier.driverName)}</b>${o.courier.plate ? ' (' + esc(o.courier.plate) + ')' : ''}${o.courier.phone ? `<br><a href="tel:${esc(o.courier.phone)}">Hubungi driver ${esc(o.courier.phone)}</a>` : ''}</div>` : '';
  return head + c + steps;
}
async function viewTrack(id) {
  let o;
  try { o = await api('/api/orders/' + id); } catch (e) { V.innerHTML = `<button class="back" data-go="#/">← Ke menu</button><div class="notice err">${esc(e.message)}</div>`; return; }
  const ids = ls.get('orders', []); if (!ids.includes(id)) { ids.unshift(id); ls.set('orders', ids.slice(0, 30)); }
  const wa = S.cfg.store.wa ? `<a class="btn light block" style="text-align:center;text-decoration:none;margin-top:10px" target="_blank" rel="noopener" href="https://wa.me/${S.cfg.store.wa}?text=${encodeURIComponent('Halo, saya mau tanya pesanan ' + id)}">Tanya toko lewat WhatsApp</a>` : '';
  V.innerHTML = `<button class="back" data-go="#/">← Kembali ke menu</button>
  <h1>Pesanan ${esc(o.id)}</h1>
  <div class="cols"><div><section class="card" id="trk"></section></div>
  <aside><section class="card"><h2>Rincian</h2>
    ${o.lines.map((l) => `<div class="sum-row"><span>${l.qty}× ${esc(l.name)}${lineDetail(l) ? `<br><span class="muted small">${esc(lineDetail(l))}</span>` : ''}</span><span>${rp(l.total)}</span></div>`).join('')}
    <div class="sum-row" style="border-top:1px dashed var(--line);margin-top:6px"><span>Kemasan + ongkir</span><span>${rp(o.pricing.packagingFee + o.pricing.deliveryFee)}</span></div>
    ${o.pricing.discount + o.pricing.shipDiscount ? `<div class="sum-row disc"><span>Potongan</span><span>−${rp(o.pricing.discount + o.pricing.shipDiscount)}</span></div>` : ''}
    <div class="sum-row total"><span>Total</span><span>${rp(o.pricing.total)}</span></div>
    <p class="muted small">Bayar: ${esc(o.payment.label)}${o.payment.method === 'cod' ? ' (siapkan uang pas)' : ''}<br>Antar ke: ${esc(o.customer.address)}</p>
    <button class="btn block" data-reorder="${esc(o.id)}">Pesan ulang</button>${wa}
  </section></aside></div>`;
  $('#trk').innerHTML = trackHtml(o);
  if (!['done', 'cancelled'].includes(o.status)) {
    timers.push(setInterval(async () => {
      try { const n = await api('/api/orders/' + id); const t = $('#trk'); if (t) t.innerHTML = trackHtml(n); if (['done', 'cancelled'].includes(n.status)) clearTimers(); } catch {}
    }, 4000));
  }
}

/* ---------- riwayat & pesan ulang ---------- */
async function viewHistory() {
  V.innerHTML = '<button class="back" data-go="#/">← Kembali ke menu</button><h1>Pesanan saya</h1><div id="hist" class="hist"><p class="muted">Memuat...</p></div>';
  const ids = ls.get('orders', []);
  const h = $('#hist');
  if (!ids.length) { h.innerHTML = '<div class="empty card"><div class="big">🍗</div><p>Belum ada pesanan di perangkat ini.<br>Pesananmu akan muncul di sini supaya bisa dipesan ulang dengan satu tombol.</p></div>'; return; }
  try {
    const list = await api('/api/orders?ids=' + encodeURIComponent(ids.join(',')));
    list.sort((a, b) => b.createdAt - a.createdAt);
    h.innerHTML = list.map((o) => `<article class="card" style="margin:0">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><b>${esc(o.id)}</b><span class="status-pill s-${o.status}">${STATUS_LABEL[o.status]}</span></div>
      <p class="mini" style="margin:4px 0">${dateTime(o.createdAt)}</p>
      <p style="margin:6px 0">${o.lines.map((l) => `${l.qty}× ${esc(l.name)}`).join(', ')}</p>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><b>${rp(o.pricing.total)}</b>
        <span style="display:flex;gap:8px"><button class="btn light sm" data-go="#/pesanan/${esc(o.id)}">Lihat</button><button class="btn sm" data-reorder="${esc(o.id)}">Pesan ulang</button></span></div></article>`).join('') || '<p class="muted">Pesanan tidak ditemukan.</p>';
  } catch (e) { h.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
}
async function reorder(id) {
  try {
    const o = await api('/api/orders/' + id);
    let skipped = 0;
    for (const l of o.lines) {
      const it = item(l.itemId);
      if (!it || !it.available) { skipped++; continue; }
      S.cart.push({ itemId: l.itemId, qty: l.qty, parts: { ...l.parts }, spice: l.spice, options: [...l.options], note: l.note || '' });
    }
    saveCart(); location.hash = '#/';
    setTimeout(() => { renderCart(); refreshQuote(); openCart(); toast(skipped ? `${skipped} menu sudah tidak tersedia dan dilewati` : 'Pesanan lama masuk keranjang'); }, 60);
  } catch (e) { toast(e.message); }
}

/* ---------- router ---------- */
function showHome() {
  $('#home').hidden = false; V.hidden = true; destroyMap(); renderCart();
}
function route() {
  clearTimers(); closeSheet(); destroyMap();
  const h = location.hash || '#/'; let m;
  if (h === '#/' || h === '' || h === '#') { showHome(); return; }
  $('#home').hidden = true; V.hidden = false; $('#cartBar').hidden = true; window.scrollTo(0, 0);
  if (h === '#/checkout') viewCheckout();
  else if ((m = h.match(/^#\/bayar\/([A-Z0-9-]+)$/))) viewPay(m[1]);
  else if ((m = h.match(/^#\/pesanan\/([A-Z0-9-]+)$/))) viewTrack(m[1]);
  else if (h === '#/riwayat') viewHistory();
  else { location.hash = '#/'; }
}

/* ---------- event ---------- */
document.addEventListener('click', (e) => {
  const t = e.target;
  let b;
  if ((b = t.closest('[data-cat]'))) { S.cat = b.dataset.cat; renderCats(); renderMenu(); return; }
  if ((b = t.closest('[data-add]'))) { const it = item(b.dataset.add); if (!it) return; if (b.dataset.simple === '1') addSimple(it); else { closeCart(); openSheet(it.id); } return; }
  if ((b = t.closest('[data-edit]'))) { openSheet(S.cart[+b.dataset.edit].itemId, +b.dataset.edit); return; }
  if ((b = t.closest('[data-del]'))) { S.cart.splice(+b.dataset.del, 1); saveCart(); renderCart(); refreshQuote(); return; }
  if ((b = t.closest('[data-q]'))) { const l = S.cart[+b.dataset.i]; l.qty += +b.dataset.q; if (l.qty < 1) S.cart.splice(+b.dataset.i, 1); saveCart(); renderCart(); refreshQuote(); return; }
  if ((b = t.closest('[data-go]'))) { location.hash = b.dataset.go; return; }
  if ((b = t.closest('[data-reorder]'))) { reorder(b.dataset.reorder); return; }
  if ((b = t.closest('[data-v]')) && b.classList.contains('voucher')) { S.voucher = S.voucher === b.dataset.v ? '' : b.dataset.v; refreshQuote(); return; }
  if (t.closest('#toCheckout')) { location.hash = '#/checkout'; return; }
  if (t.closest('#cartBar')) { openCart(); return; }
  if (t.closest('#cartClose')) { closeCart(); return; }
  if (t.closest('#mapGo')) { mapSearch(); return; }
  if (t.closest('#geoBtn')) { geolocate(); return; }
  if (t.closest('#placeBtn')) { placeOrder(); return; }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'addr') S.addrAuto = false;
  if (['cName', 'cPhone', 'addr', 'cNote'].includes(e.target.id)) saveCust();
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'anti') { S.antiLepek = e.target.checked; refreshQuote(); }
  if (e.target.name === 'pay') { S.pay = e.target.value; ls.set('pay', S.pay); renderDyn(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeSheet(); closeCart(); }
  if (e.key === 'Enter' && e.target.id === 'mapQ') { e.preventDefault(); mapSearch(); }
});
window.addEventListener('hashchange', route);

async function refreshMenu() {
  try { const m = await api('/api/menu'); S.menu = m.items; S.stock = m.stock; if (!$('#home').hidden && !$('#sheetRoot').innerHTML) renderMenu(); } catch {}
}
async function init() {
  try {
    const [cfg, menu] = await Promise.all([api('/api/config'), api('/api/menu')]);
    S.cfg = cfg; S.menu = menu.items; S.stock = menu.stock;
  } catch (e) { $('#menu').innerHTML = `<div class="notice err">Gagal memuat menu: ${esc(e.message)}</div>`; return; }
  if (!S.cfg.payments.some((p) => p.id === S.pay)) S.pay = S.cfg.payments[0].id;
  $('#storeName').textContent = S.cfg.store.name; document.title = S.cfg.store.name + ' | Pesan Antar Ayam';
  S.cart = S.cart.filter((l) => item(l.itemId));
  renderCats(); renderMenu(); renderCart(); route();
  if (S.cart.length) refreshQuote();
  setInterval(refreshMenu, 30000);
}
init();
})();
