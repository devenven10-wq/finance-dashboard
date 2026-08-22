// ============================================================
// DVpoint — Anggaran / Financial Planning (anggaran.js)
// Modul MANDIRI: seluruh data (nama, kategori, nominal, periode,
// tanggal mulai/selesai, status, catatan) diinput manual oleh pengguna.
// TIDAK ada pengambilan/perhitungan dari transaksi Pemasukan, Pengeluaran,
// Transfer, maupun Dashboard.
// ============================================================

const BG_KATEGORI = [
  'Travel', 'Pendidikan', 'Kesehatan', 'Rumah Tangga', 'Kendaraan',
  'Pernikahan', 'Darurat', 'Investasi', 'Gadget & Elektronik', 'Lainnya'
];

const BG_KATEGORI_ICON = {
  'Travel': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-1 0-1.3.4l-.7.7 6 4-3 3-3-1-1 1 3 3 3 3 1-1-1-3 3-3 4 6 .7-.7c.4-.3.5-.8.4-1.3z"/></svg>',
  'Pendidikan': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/></svg>',
  'Kesehatan': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 10-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>',
  'Rumah Tangga': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/></svg>',
  'Kendaraan': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17a2 2 0 100 4 2 2 0 000-4zM19 17a2 2 0 100 4 2 2 0 000-4zM3 17V9a2 2 0 012-2h10l4 5v5"/><path d="M3 9h13"/></svg>',
  'Pernikahan': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 10-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>',
  'Darurat': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  'Investasi': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 3 3 7-7M13 8h5v5"/></svg>',
  'Gadget & Elektronik': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  'Lainnya': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
};

const BG_KATEGORI_COLOR = {
  'Travel': '#4f7dff', 'Pendidikan': '#9f4dff', 'Kesehatan': '#ef4d8f',
  'Rumah Tangga': '#f5b342', 'Kendaraan': '#2dd9a8', 'Pernikahan': '#ef4d8f',
  'Darurat': '#f5b342', 'Investasi': '#2dd9a8', 'Gadget & Elektronik': '#4f7dff', 'Lainnya': '#8a86a8'
};

let bgState = {
  editingId: null,
  selectedKategori: BG_KATEGORI[0],
  selectedPeriode: 'bulanan',
  filter: 'semua',
  openMenuId: null
};

// ---------- Toast ----------
let bgToastTimer = null;
function bgToast(msg) {
  const el = document.getElementById('bgToast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(bgToastTimer);
  bgToastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function bgEsc(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

function bgStatusClass(status) {
  return 'status-' + String(status || '').toLowerCase();
}

function bgFormatTanggalRange(mulai, selesai) {
  const a = mulai ? dvFormatTanggal(mulai) : '—';
  const b = selesai ? dvFormatTanggal(selesai) : '—';
  return `${a} – ${b}`;
}

// ---------- Ringkasan (murni dari data Anggaran, bukan transaksi) ----------
function bgRenderSummary() {
  const s = dvGetAnggaranSummary();
  document.getElementById('sumTotalNominal').textContent = dvFormatRupiah(s.totalNominal);
  document.getElementById('sumTotalNominalSub').textContent = s.jumlahAnggaran
    ? dvT('bg.n_rencana', {n: s.jumlahAnggaran}) : dvT('bg.belum_ada_rencana');

  document.getElementById('sumAktif').textContent = s.totalAktif;
  document.getElementById('sumAktifSub').textContent = s.totalAktif ? dvT('bg.sedang_berjalan') : dvT('bg.belum_ada_aktif');

  document.getElementById('sumSelesai').textContent = s.totalSelesai;
  document.getElementById('sumSelesaiSub').textContent = s.totalSelesai ? dvT('bg.rencana_tercapai') : dvT('bg.belum_ada_selesai');

  document.getElementById('sumJumlah').textContent = s.jumlahAnggaran;
  document.getElementById('sumJumlahSub').textContent = s.jumlahAnggaran ? dvT('bg.total_seluruh') : dvT('bg.belum_ada_anggaran');
}

// ---------- Grid anggaran ----------
function bgRenderGrid() {
  const grid = document.getElementById('bgGrid');
  const all = dvGetAnggaranAll();

  let list;
  if (bgState.filter === 'semua') list = all.filter(a => !a.arsip);
  else if (bgState.filter === 'arsip') list = all.filter(a => a.arsip);
  else list = all.filter(a => !a.arsip && a.status === bgState.filter);

  if (!all.length) {
    grid.innerHTML = `
      <div class="bg-empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>
        <h4>${dvT('bg.empty_title')}</h4>
        <p>${dvT('bg.empty_desc')}</p>
        <button class="btn-primary" onclick="bgOpenAddModal()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>
          ${dvT('bg.tambah_anggaran')}
        </button>
      </div>`;
    return;
  }

  if (!list.length) {
    grid.innerHTML = `<div class="bg-empty"><h4>${dvT('bg.empty_filter_title')}</h4><p>${dvT('bg.empty_filter_desc')}</p></div>`;
    return;
  }

  grid.innerHTML = list.map(a => {
    const color = BG_KATEGORI_COLOR[a.kategori] || '#8a86a8';
    const icon = BG_KATEGORI_ICON[a.kategori] || BG_KATEGORI_ICON['Lainnya'];
    return `
    <div class="bg-card ${a.arsip ? 'is-arsip' : ''}" style="--bg-card-color:${color}" data-id="${a.id}" onclick="bgCardClick(event,'${a.id}')">
      <div class="bg-card-top">
        <div class="bg-card-left">
          <div class="bg-card-icon">${icon}</div>
          <div style="min-width:0;">
            <div class="bg-card-name">${bgEsc(a.nama)}</div>
            <div class="bg-card-kategori">${bgEsc(a.kategori)}</div>
          </div>
        </div>
        <button class="bg-card-menu-btn" onclick="bgToggleMenu(event,'${a.id}')">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>
        </button>
        <div class="bg-card-menu" id="bgmenu-${a.id}">
          <button onclick="bgOpenDrawer(event,'${a.id}')">Lihat Detail</button>
          <button onclick="bgOpenEditModal(event,'${a.id}')">Edit</button>
          <button onclick="bgToggleArsip(event,'${a.id}')">${a.arsip ? 'Batalkan Arsip' : 'Arsipkan'}</button>
          <div class="bg-menu-sep"></div>
          <button class="danger" onclick="bgDeleteAnggaran(event,'${a.id}')">Hapus</button>
        </div>
      </div>

      <div class="bg-card-rows">
        <div class="bg-card-row"><span class="lbl">Nominal</span><span class="val mono">${dvFormatRupiah(a.nominal)}</span></div>
        <div class="bg-card-row"><span class="lbl">Periode</span><span class="val">${a.periode === 'tahunan' ? 'Tahunan' : 'Bulanan'}</span></div>
      </div>

      <div class="bg-card-divider"></div>

      <div class="bg-card-dates">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v3M16 3v3"/></svg>
        <span>${bgFormatTanggalRange(a.tanggalMulai, a.tanggalSelesai)}</span>
      </div>

      <div class="bg-card-footer">
        <span class="bg-status-badge ${bgStatusClass(a.status)}"><span class="dot2"></span>${bgEsc(a.status)}</span>
        ${a.arsip ? '<span class="bg-status-badge status-arsip">Diarsipkan</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

function bgCardClick(e, id) {
  if (e.target.closest('.bg-card-menu') || e.target.closest('.bg-card-menu-btn')) return;
  bgOpenDrawer(e, id);
}

function bgCloseAllMenus() {
  document.querySelectorAll('.bg-card-menu.open').forEach(m => m.classList.remove('open'));
  bgState.openMenuId = null;
}

function bgToggleMenu(e, id) {
  e.stopPropagation();
  const menu = document.getElementById('bgmenu-' + id);
  const wasOpen = menu.classList.contains('open');
  bgCloseAllMenus();
  if (!wasOpen) { menu.classList.add('open'); bgState.openMenuId = id; }
}

document.addEventListener('click', () => bgCloseAllMenus());

// ---------- Filter chips ----------
document.getElementById('bgFilters').addEventListener('click', (e) => {
  const chip = e.target.closest('.bg-filter-chip');
  if (!chip) return;
  document.querySelectorAll('.bg-filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  bgState.filter = chip.dataset.filter;
  bgRenderGrid();
});

// ---------- Modal Tambah / Edit ----------
function bgBuildKategoriGrid() {
  const wrap = document.getElementById('bgKategoriGrid');
  wrap.innerHTML = BG_KATEGORI.map(k => `
    <div class="bg-kategori-opt ${k === bgState.selectedKategori ? 'selected' : ''}" data-kategori="${k}">
      ${BG_KATEGORI_ICON[k] || BG_KATEGORI_ICON['Lainnya']}<span>${k}</span>
    </div>`).join('');
  wrap.querySelectorAll('.bg-kategori-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      bgState.selectedKategori = opt.dataset.kategori;
      wrap.querySelectorAll('.bg-kategori-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}

document.getElementById('bgPeriodeToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('.bg-periode-btn');
  if (!btn) return;
  bgState.selectedPeriode = btn.dataset.periode;
  document.querySelectorAll('.bg-periode-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
});

function bgOpenAddModal() {
  bgState.editingId = null;
  bgState.selectedKategori = BG_KATEGORI[0];
  bgState.selectedPeriode = 'bulanan';
  document.getElementById('bgModalTitle').textContent = dvT('bg.modal_title_tambah');
  document.getElementById('bgModalSubmit').textContent = dvT('bg.modal_submit_tambah');
  document.getElementById('formAnggaran').reset();
  document.getElementById('bgModalError').textContent = '';
  document.getElementById('bgInpStatus').value = 'Aktif';
  document.querySelectorAll('.bg-periode-btn').forEach(b => b.classList.toggle('selected', b.dataset.periode === 'bulanan'));
  dvAttachRibuanInput(document.getElementById('bgInpNominal'));
  bgBuildKategoriGrid();
  document.getElementById('bgModalOverlay').classList.add('open');
}

function bgOpenEditModal(e, id) {
  if (e) e.stopPropagation();
  bgCloseAllMenus();
  const a = dvGetAnggaranAll().find(x => x.id === id);
  if (!a) return;
  bgState.editingId = id;
  bgState.selectedKategori = a.kategori;
  bgState.selectedPeriode = a.periode;
  document.getElementById('bgModalTitle').textContent = dvT('bg.modal_title_edit');
  document.getElementById('bgModalSubmit').textContent = dvT('bg.modal_submit_edit');
  document.getElementById('bgModalError').textContent = '';
  document.getElementById('bgInpNama').value = a.nama;
  document.getElementById('bgInpNominal').value = dvFormatRibuan(a.nominal);
  document.getElementById('bgInpTanggalMulai').value = a.tanggalMulai || '';
  document.getElementById('bgInpTanggalSelesai').value = a.tanggalSelesai || '';
  document.getElementById('bgInpStatus').value = a.status;
  document.getElementById('bgInpCatatan').value = a.catatan || '';
  document.querySelectorAll('.bg-periode-btn').forEach(b => b.classList.toggle('selected', b.dataset.periode === a.periode));
  dvAttachRibuanInput(document.getElementById('bgInpNominal'));
  bgBuildKategoriGrid();
  document.getElementById('bgModalOverlay').classList.add('open');
  bgCloseDrawer();
}

function bgCloseModal() {
  document.getElementById('bgModalOverlay').classList.remove('open');
}

document.getElementById('btnTambahAnggaran').addEventListener('click', bgOpenAddModal);
document.getElementById('bgModalClose').addEventListener('click', bgCloseModal);
document.getElementById('bgModalCancel').addEventListener('click', bgCloseModal);
document.getElementById('bgModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'bgModalOverlay') bgCloseModal(); });

document.getElementById('formAnggaran').addEventListener('submit', (e) => {
  e.preventDefault();
  const nama = document.getElementById('bgInpNama').value.trim();
  const nominalRaw = document.getElementById('bgInpNominal').value;
  const nominal = dvParseRibuan(nominalRaw);
  const tanggalMulai = document.getElementById('bgInpTanggalMulai').value;
  const tanggalSelesai = document.getElementById('bgInpTanggalSelesai').value;
  const status = document.getElementById('bgInpStatus').value;
  const catatan = document.getElementById('bgInpCatatan').value.trim();
  const errEl = document.getElementById('bgModalError');

  if (!nama) { errEl.textContent = dvT('bg.err_nama_wajib'); return; }
  if (!nominal || nominal <= 0) { errEl.textContent = dvT('bg.err_nominal_wajib'); return; }
  if (!tanggalMulai || !tanggalSelesai) { errEl.textContent = dvT('bg.err_tanggal_wajib'); return; }
  if (tanggalSelesai < tanggalMulai) { errEl.textContent = dvT('bg.err_tanggal_invalid'); return; }

  dvShowConfirm(dvT(bgState.editingId ? 'bg.confirm_simpan_edit' : 'bg.confirm_simpan_tambah'), () => {
    const payload = { nama, kategori: bgState.selectedKategori, nominal, periode: bgState.selectedPeriode, tanggalMulai, tanggalSelesai, status, catatan };

    if (bgState.editingId) {
      dvUpdateAnggaran(bgState.editingId, payload);
      bgToast(dvT('bg.toast_diperbarui'));
    } else {
      dvAddAnggaran(payload);
      bgToast(dvT('bg.toast_ditambahkan'));
    }
    bgCloseModal();
  });
});

// ---------- Arsipkan / Hapus ----------
function bgToggleArsip(e, id) {
  e.stopPropagation();
  bgCloseAllMenus();
  const a = dvGetAnggaranAll().find(x => x.id === id);
  if (!a) return;
  dvSetAnggaranArsip(id, !a.arsip);
  bgToast(!a.arsip ? `${a.nama} diarsipkan.` : `${a.nama} dikembalikan dari arsip.`);
  bgCloseDrawer();
}

function bgDeleteAnggaran(e, id) {
  e.stopPropagation();
  bgCloseAllMenus();
  const a = dvGetAnggaranAll().find(x => x.id === id);
  if (!a) return;
  dvShowConfirm(dvT('bg.confirm_hapus', {nama: a.nama}), () => {
    dvDeleteAnggaran(id);
    bgCloseDrawer();
    bgToast(dvT('bg.toast_dihapus'));
  }, { danger: true });
}

// ---------- Drawer Detail ----------
function bgOpenDrawer(e, id) {
  if (e) e.stopPropagation();
  bgCloseAllMenus();
  const a = dvGetAnggaranAll().find(x => x.id === id);
  if (!a) return;
  const color = BG_KATEGORI_COLOR[a.kategori] || '#8a86a8';
  const icon = BG_KATEGORI_ICON[a.kategori] || BG_KATEGORI_ICON['Lainnya'];

  const body = document.getElementById('bgDrawerBody');
  body.innerHTML = `
    <div class="bg-drawer-hero">
      <div class="bg-drawer-hero-left">
        <div class="bg-card-icon" style="--bg-card-color:${color}">${icon}</div>
        <div>
          <div class="bg-card-name">${bgEsc(a.nama)}</div>
          <div class="bg-card-kategori">${bgEsc(a.kategori)}</div>
        </div>
      </div>
      <span class="bg-status-badge ${bgStatusClass(a.status)}"><span class="dot2"></span>${bgEsc(a.status)}</span>
    </div>

    <div class="bg-drawer-stats">
      <div class="bg-drawer-stat"><div class="lbl">Nominal</div><div class="val">${dvFormatRupiah(a.nominal)}</div></div>
      <div class="bg-drawer-stat"><div class="lbl">Periode</div><div class="val">${a.periode === 'tahunan' ? 'Tahunan' : 'Bulanan'}</div></div>
      <div class="bg-drawer-stat"><div class="lbl">Tanggal Mulai</div><div class="val">${a.tanggalMulai ? dvFormatTanggal(a.tanggalMulai) : '—'}</div></div>
      <div class="bg-drawer-stat"><div class="lbl">Tanggal Berakhir</div><div class="val">${a.tanggalSelesai ? dvFormatTanggal(a.tanggalSelesai) : '—'}</div></div>
    </div>

    <div class="bg-drawer-section-title">Catatan</div>
    <div class="bg-drawer-catatan">${a.catatan ? bgEsc(a.catatan) : 'Tidak ada catatan.'}</div>

    <div class="bg-drawer-actions">
      <button class="btn-ghost" onclick="bgOpenEditModal(event,'${a.id}')">Edit</button>
      <button class="btn-ghost" onclick="bgToggleArsip(event,'${a.id}')">${a.arsip ? 'Batalkan Arsip' : 'Arsipkan'}</button>
      <button class="btn-primary red" onclick="bgDeleteAnggaran(event,'${a.id}')">Hapus</button>
    </div>
  `;

  document.getElementById('bgDrawerOverlay').classList.add('open');
  document.getElementById('bgDrawer').classList.add('open');
}

function bgCloseDrawer() {
  document.getElementById('bgDrawerOverlay').classList.remove('open');
  document.getElementById('bgDrawer').classList.remove('open');
}
document.getElementById('bgDrawerClose').addEventListener('click', bgCloseDrawer);
document.getElementById('bgDrawerOverlay').addEventListener('click', bgCloseDrawer);

// ---------- Render utama ----------
// Modul ini sepenuhnya mandiri secara DATA: bgRenderAll() hanya pernah
// membaca data Anggaran itu sendiri, tidak pernah membaca transaksi.
// dvOnChange di sini murni dipakai sebagai sinyal "ada perubahan, refresh
// tampilan" (termasuk saat kita sendiri menambah/mengedit/menghapus anggaran),
// BUKAN untuk mengambil/menghitung ulang dari data transaksi.
function bgRenderAll() {
  bgRenderSummary();
  bgRenderGrid();
}

bgRenderAll();
dvOnChange(bgRenderAll);