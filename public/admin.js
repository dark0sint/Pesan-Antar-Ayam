(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const A = $('#app');
let token = sessionStorage.getItem('ayam:admin') || '';
let tab = 'orders', data = null, menu = [], lastNew = -1, poll;
const PARTS = { dada: 'Dada', paha_atas: 'Paha Atas', paha_bawah: 'Paha Bawah', sayap: 'Sayap' };
const SPICE = ['Tidak pedas', 'Pedas ringan', 'Pedas sedang', 'Pedas', 'Pedas banget', 'Level setan'];
const OPT = { nasi_jumbo: 'Nasi Jumbo', saus_keju: 'Saus Keju', saus_mentai: 'Saus Mentai', saus_geprek: 'Sambal Geprek', kulit: 'Kulit Kriuk', kentang: 'Kentang', sup: 'Sup' };

let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
async function api(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && token) { logout(); throw new Error(j.error || 'Sesi berakhir'); }
  if (!r.ok) throw new Error(j.error || 'Gagal');
  return j;
}
function beep() {
  try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain(); o.connect(g); g.connect(c.destination); o.frequency.value = 880; g.gain.value = 0.15; o.start(); o.stop(c.currentTime + 0.25); } catch {}
}
function logout() { token = ''; sessionStorage.removeItem('ayam:admin'); clearInterval(poll); renderLogin(); }

function renderLogin() {
  A.innerHTML = `<form class="login card" id="lf"><h1 style="font-size:1.6rem;margin-bottom:4px">Dapur</h1><p class="muted">Masuk untuk mengelola pesanan.</p>
    <label class="field"><span>Password admin</span><input type="password" id="pw" autocomplete="current-password" autofocus></label>
    <button class="btn block" style="margin-top:14px">Masuk</button></form>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); token = j.token; sessionStorage.setItem('ayam:admin', token); start(); }
    catch (err) { toast(err.message || 'Gagal masuk'); }
  };
}

function orderCard(o) {
  const isNew = o.status === 'received';
  const lines = o.lines.map((l) => {
    const parts = Object.entries(l.parts).map(([k, v]) => `${v} ${PARTS[k]}`).join(', ');
    const ex = [parts, l.spice ? SPICE[l.spice] : '', ...(l.optionNames || []), l.note ? 'Catatan: ' + l.note : ''].filter(Boolean).join(', ');
    return `<li><b>${l.qty}× ${esc(l.name)}</b>${ex ? `<br><span class="muted small">${esc(ex)}</span>` : ''}</li>`;
  }).join('');
  const pay = o.payment.status === 'paid' ? '<span class="tag">Lunas</span>' : o.payment.status === 'cod' ? '<span class="tag warn">COD ' + rp(o.pricing.total) + '</span>' : '<span class="tag red">Belum bayar</span>';
  const acts = {
    pending_payment: `<button class="btn sm" data-st="received">Tandai lunas</button><button class="btn light sm" data-st="cancelled">Batalkan</button>`,
    received: `<button class="btn sm" data-st="cooking">Mulai goreng</button><button class="btn light sm" data-st="cancelled">Batalkan</button>`,
    cooking: `<button class="btn sm" data-st="delivering">Ayam matang, panggil kurir</button><button class="btn light sm" data-st="cancelled">Batalkan</button>`,
    delivering: `<button class="btn sm" data-st="done">Selesai diantar</button><button class="btn light sm" data-st="cancelled">Batalkan</button>`,
  }[o.status] || '';
  const courier = o.courier ? `<p class="small" style="margin:6px 0 0">🛵 ${esc(o.courier.driverName)} ${esc(o.courier.plate || '')} ${esc(o.courier.phone || '')}</p>` : '';
  return `<article class="ord ${isNew ? 'new' : ''}" data-id="${esc(o.id)}">
    <h3><span>${esc(o.id)}</span><span class="muted small">${clock(o.createdAt)}</span></h3>
    <div style="margin:4px 0">${pay} ${o.antiLepek ? '<span class="tag warn">Kemasan anti-lepek</span>' : ''} <span class="tag warn">${o.pieces} potong</span></div>
    <ul>${lines}</ul>
    <p class="small" style="margin:6px 0 0"><b>${esc(o.customer.name)}</b> · <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a><br>${esc(o.customer.address)}${o.customer.note ? '<br><i>' + esc(o.customer.note) + '</i>' : ''}<br>
    <a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${o.loc.lat},${o.loc.lng}">Buka di Google Maps (${o.km} km)</a></p>
    ${courier}
    <p style="margin:8px 0 0"><b>${rp(o.pricing.total)}</b> <span class="muted small">${esc(o.payment.label)}</span></p>
    ${o.status === 'cancelled' && o.cancelReason ? `<p class="small muted">Batal: ${esc(o.cancelReason)}${o.payment.refundNeeded ? ' (perlu refund)' : ''}</p>` : ''}
    <div class="acts">${acts}</div></article>`;
}

function renderOrders() {
  const by = (s) => data.active.filter((o) => s.includes(o.status));
  const cols = [['Menunggu bayar', ['pending_payment']], ['Baru masuk', ['received']], ['Digoreng', ['cooking']], ['Diantar', ['delivering']]];
  const s = data.summary;
  $('#pane').innerHTML = `<div class="stats"><div class="stat"><span class="muted small">Pesanan hari ini</span><b>${s.ordersToday}</b></div><div class="stat"><span class="muted small">Omzet lunas hari ini</span><b>${rp(s.revenueToday)}</b></div><div class="stat"><span class="muted small">Batal hari ini</span><b>${s.cancelledToday}</b></div></div>
  <div class="board">${cols.map(([t, st]) => `<section><h2 class="colh">${t}<span>${by(st).length}</span></h2>${by(st).map(orderCard).join('') || '<p class="muted small">Kosong</p>'}</section>`).join('')}</div>
  <h2 class="colh" style="margin-top:24px">Riwayat terbaru</h2><div class="board">${data.recent.map(orderCard).join('') || '<p class="muted small">Belum ada.</p>'}</div>`;
}

function renderStock() {
  $('#pane').innerHTML = `<h2 class="colh">Kuota ayam hari ini</h2>
  <p class="muted small">Kuota berkurang otomatis saat ada pesanan dan dikembalikan jika pesanan batal. Isi ulang setiap pagi sesuai stok dapur.</p>
  <div class="card"><div class="grid4">${Object.keys(PARTS).map((k) => `<label class="field" style="margin:0"><span>${PARTS[k]}</span><input type="number" min="0" max="9999" id="st-${k}" value="${data.stock[k]}"></label>`).join('')}</div>
  <button class="btn" id="saveStock" style="margin-top:14px">Simpan kuota</button></div>
  <h2 class="colh" style="margin-top:24px">Menu</h2>
  <table><thead><tr><th>Menu</th><th>Harga</th><th>Tersedia</th><th></th></tr></thead><tbody>${menu.map((m) => `<tr data-m="${m.id}"><td>${m.emoji} ${esc(m.name)}</td><td><input type="number" min="0" step="500" value="${m.price}" data-price></td><td><input type="checkbox" data-avail ${m.available ? 'checked' : ''}></td><td><button class="btn light sm" data-savem>Simpan</button></td></tr>`).join('')}</tbody></table>`;
}

async function load() {
  try {
    data = await api('/api/admin/orders');
    const newCount = data.active.filter((o) => o.status === 'received').length;
    if (lastNew >= 0 && newCount > lastNew) { beep(); toast('Pesanan baru masuk!'); }
    lastNew = newCount;
    if (tab === 'orders' && !document.activeElement.closest?.('.ord')) renderOrders();
    document.title = (newCount ? `(${newCount}) ` : '') + 'Dapur | Admin';
  } catch (e) { if (token) toast(e.message); }
}

async function start() {
  A.innerHTML = `<header style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h1 style="font-size:1.6rem">🍗 Dapur</h1><div style="display:flex;gap:8px"><a class="btn-ghost" href="/" target="_blank">Lihat toko</a><button class="btn-ghost" id="out">Keluar</button></div></header>
  <div class="tabs"><button class="cat" data-tab="orders" aria-current="true">Pesanan</button><button class="cat" data-tab="stock" aria-current="false">Kuota & menu</button></div><div id="pane"></div>`;
  $('#out').onclick = logout;
  try { menu = await api('/api/admin/menu'); } catch { return; }
  await load();
  clearInterval(poll); poll = setInterval(load, 5000);
}

document.addEventListener('click', async (e) => {
  const t = e.target; let b;
  if ((b = t.closest('[data-tab]'))) {
    tab = b.dataset.tab; document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-current', x === b));
    if (tab === 'orders') renderOrders(); else { menu = await api('/api/admin/menu'); renderStock(); }
    return;
  }
  if ((b = t.closest('[data-st]'))) {
    const id = b.closest('.ord').dataset.id; const st = b.dataset.st; const body = { status: st };
    if (st === 'cancelled') { const r = prompt('Alasan pembatalan (ditampilkan ke pelanggan):', 'Stok habis'); if (r === null) return; body.reason = r; }
    if (st === 'delivering') {
      const n = prompt('Nama driver internal (kosongkan untuk pakai kurir otomatis sesuai COURIER_PROVIDER):', '');
      if (n === null) return; if (n.trim()) { body.driverName = n.trim(); body.phone = prompt('Nomor HP driver (opsional):', '') || ''; body.plate = prompt('Plat motor (opsional):', '') || ''; }
    }
    b.disabled = true;
    try { await api(`/api/admin/orders/${id}/status`, 'POST', body); toast('Status diperbarui'); } catch (err) { toast(err.message); }
    load(); return;
  }
  if (t.id === 'saveStock') {
    const body = {}; Object.keys(PARTS).forEach((k) => { body[k] = Number($('#st-' + k).value); });
    try { await api('/api/admin/stock', 'PUT', body); toast('Kuota disimpan'); load(); } catch (err) { toast(err.message); }
    return;
  }
  if ((b = t.closest('[data-savem]'))) {
    const tr = b.closest('tr');
    try { await api('/api/admin/menu/' + tr.dataset.m, 'PUT', { price: Number(tr.querySelector('[data-price]').value), available: tr.querySelector('[data-avail]').checked }); toast('Menu disimpan'); } catch (err) { toast(err.message); }
  }
});

if (token) start(); else renderLogin();
})();
