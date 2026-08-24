// ============================================================
// DVpoint — Tujuan Keuangan (tujuan.js)
// Modul MANDIRI: seluruh data & progress disimpan lewat storage.js
// (dvGetTujuan / dvAddTujuan / dvUpdateTujuan / dvAddTujuanProgress / dst).
// TIDAK membaca transaksi, saldo akun, atau ringkasan Dashboard sama sekali —
// progress hanya berubah lewat aksi manual "Tambah Progress" di halaman ini.
// ============================================================

const TJ_ICONS = {
  target: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4.2"></circle><circle cx="12" cy="12" r="0.6" fill="currentColor"></circle></svg>',
  laptop: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><rect height="11" rx="1.5" width="18" x="3" y="4"></rect><path d="M2 19h20l-1.5 2h-17z"></path></svg>',
  car: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 16V9l2-4h12l2 4v7"></path><path d="M4 16h16M7 16v2M17 16v2"></path><circle cx="7.5" cy="16" r="1.6"></circle><circle cx="16.5" cy="16" r="1.6"></circle></svg>',
  home: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 10.5L12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path><path d="M9.5 21v-6h5v6"></path></svg>',
  plane: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 13l7-2 4-8 2 1-2 7 6 1v2l-6 1-1 7-2-1 1-6-8-1z"></path></svg>',
  shield: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 7.7-8 9-4.5-1.3-8-4-8-9V6z"></path><path d="M9 12l2 2 4-4"></path></svg>',
  book: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5c-.8 0-1.5-.7-1.5-1.5z"></path><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H12v16h6.5c.8 0 1.5-.7 1.5-1.5z"></path></svg>',
  heart: '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.5-9.1C1.2 8 3 5 6.3 5c1.9 0 3.3 1 4.2 2.3C11.4 6 12.8 5 14.7 5 18 5 19.8 8 18.5 11.4 16.5 15.9 12 20.5 12 20.5z"></path></svg>'
};
const TJ_KATEGORI_ICON_DEFAULT = {
  'Elektronik': 'laptop', 'Kendaraan': 'car', 'Rumah': 'home', 'Liburan': 'plane',
  'Dana Darurat': 'shield', 'Pendidikan': 'book', 'Pernikahan': 'heart', 'Lainnya': 'target'
};
const TJ_COLORS = ['#4f7dff', '#2dd9a8', '#9f4dff', '#ef4d8f', '#f5b342'];

let tjCurrentFilter = 'semua';
let tjSelectedColor = TJ_COLORS[0];
let tjSelectedIcon = 'target';
let tjEditingId = null;      // null = mode tambah, terisi = mode edit
let tjActiveGoalId = null;   // goal yang sedang dibuka drawer / progress modal
let tjOpenDropdownId = null;
let tjConfirmAction = null;

document.addEventListener('DOMContentLoaded', () => {
  buildColorPicker();
  buildIconPicker();
  bindEvents();
  dvBootstrapPage(() => {
    renderAll();
    dvOnChange(renderAll);
  });
});

function renderAll() {
  renderSummary();
  renderGrid();
}

// ---------- Ringkasan ----------
function renderSummary() {
  const s = dvGetTujuanSummary();
  document.getElementById('sumTarget').textContent = dvFormatRupiah(s.totalTarget);
  document.getElementById('sumTargetSub').textContent = s.jumlahTujuan ? dvT('tj.n_tercatat', {n: s.jumlahTujuan}) : dvT('tj.belum_ada_tujuan');
  document.getElementById('sumTerkumpul').textContent = dvFormatRupiah(s.totalTerkumpul);
  const pct = s.totalTarget ? Math.round((s.totalTerkumpul / s.totalTarget) * 100) : 0;
  document.getElementById('sumTerkumpulSub').textContent = s.totalTarget ? dvT('tj.pct_dari_target', {pct}) : dvT('tj.belum_ada_progress');
  document.getElementById('sumAktif').textContent = s.targetAktif;
  document.getElementById('sumAktifSub').textContent = dvT('tj.sedang_berjalan');
  document.getElementById('sumSelesai').textContent = s.targetSelesai;
  document.getElementById('sumSelesaiSub').textContent = dvT('tj.sudah_tercapai');
}

// ---------- Grid ----------
function renderGrid() {
  const all = dvGetTujuan();
  let list;
  if (tjCurrentFilter === 'semua') list = all.filter(g => !g.arsip);
  else if (tjCurrentFilter === 'arsip') list = all.filter(g => g.arsip);
  else list = all.filter(g => !g.arsip && g.status === tjCurrentFilter);

  const grid = document.getElementById('tjGrid');
  const empty = document.getElementById('tjEmptyState');

  if (all.length === 0) {
    grid.innerHTML = '';
    grid.style.display = 'none';
    empty.style.display = 'flex';
    empty.style.flexDirection = 'column';
    empty.style.alignItems = 'center';
    return;
  }
  grid.style.display = 'grid';
  empty.style.display = 'none';

  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><h4>${dvT('tj.empty_filter_title')}</h4><p>${dvT('tj.empty_filter_desc')}</p></div>`;
    return;
  }

  grid.innerHTML = list.map(g => renderCard(g)).join('');
}

function statusClass(status) {
  if (status === 'Selesai') return 'status-selesai';
  if (status === 'Hampir Tercapai') return 'status-hampir';
  if (status === 'Dibatalkan') return 'status-batal';
  return 'status-aktif';
}

function renderCard(g) {
  const target = Number(g.target) || 0;
  const terkumpul = Number(g.terkumpul) || 0;
  const sisa = Math.max(target - terkumpul, 0);
  const pct = target ? Math.min(Math.round((terkumpul / target) * 100), 100) : 0;
  const icon = TJ_ICONS[g.icon] || TJ_ICONS.target;
  const tanggalChip = g.targetTanggal
    ? `<div class="tj-card-date"><svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><rect height="16" rx="2" width="18" x="3" y="5"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg>${dvFormatTanggal(g.targetTanggal)}</div>`
    : '<div></div>';

  return `
  <div class="tj-card ${g.arsip ? 'arsip' : ''}" style="--card-accent:${g.warna}" data-id="${g.id}" onclick="tjOpenDrawer('${g.id}')">
    <div class="tj-card-top">
      <div class="tj-card-id">
        <div class="tj-icon-badge">${icon}</div>
        <div style="min-width:0;">
          <div class="tj-card-name">${escapeHtml(g.nama)}</div>
          <div class="tj-card-kategori">${escapeHtml(g.kategori)}</div>
        </div>
      </div>
      <button class="tj-menu-btn" onclick="event.stopPropagation(); tjToggleDropdown('${g.id}')">
        <svg fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>
      </button>
      <div class="tj-dropdown" id="dd-${g.id}">
        <button onclick="event.stopPropagation(); tjOpenDrawer('${g.id}')">
          <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          Lihat Detail
        </button>
        <button onclick="event.stopPropagation(); tjOpenEditModal('${g.id}')">
          <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"></path></svg>
          Edit
        </button>
        <button onclick="event.stopPropagation(); tjToggleArsip('${g.id}')">
          <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><rect height="13" rx="2" width="20" x="2" y="6"></rect><path d="M2 10h20"></path></svg>
          ${g.arsip ? dvT('tj.aktifkan_kembali') : dvT('tj.arsipkan')}
        </button>
        <button class="danger" onclick="event.stopPropagation(); tjConfirmHapus('${g.id}')">
          <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6"></path></svg>
          ${dvT('tj.hapus')}
        </button>
      </div>
    </div>

    <div class="tj-numbers">
      <div class="tj-num-row"><span>Target</span><strong>${dvFormatRupiah(target)}</strong></div>
      <div class="tj-num-row"><span>Dana Terkumpul</span><strong>${dvFormatRupiah(terkumpul)}</strong></div>
      <div class="tj-num-row sisa"><span>Sisa</span><strong>${dvFormatRupiah(sisa)}</strong></div>
    </div>

    <div class="tj-progress-wrap">
      <div class="tj-progress-top"><span>Progress</span><strong>${pct}%</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${g.warna};"></div></div>
    </div>

    <div class="tj-card-foot">
      <span class="tj-status-pill ${statusClass(g.status)}"><span class="dotpill"></span>${g.status}</span>
      ${tanggalChip}
    </div>

    <button class="tj-btn-progress" onclick="event.stopPropagation(); tjOpenProgressModal('${g.id}')">
      <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>
      Tambah Progress
    </button>
  </div>`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

// ---------- Dropdown ----------
function tjToggleDropdown(id) {
  const wasOpen = tjOpenDropdownId === id;
  closeAllDropdowns();
  if (!wasOpen) {
    const el = document.getElementById('dd-' + id);
    if (el) { el.classList.add('open'); tjOpenDropdownId = id; }
  }
}
function closeAllDropdowns() {
  document.querySelectorAll('.tj-dropdown.open').forEach(el => el.classList.remove('open'));
  tjOpenDropdownId = null;
}
document.addEventListener('click', closeAllDropdowns);

// ---------- Color & Icon picker ----------
function buildColorPicker() {
  const wrap = document.getElementById('gColorPicker');
  wrap.innerHTML = TJ_COLORS.map(c =>
    `<div class="color-swatch" style="background:${c};" data-color="${c}" onclick="tjPickColor('${c}')"></div>`
  ).join('');
  tjPickColor(TJ_COLORS[0]);
}
function tjPickColor(c) {
  tjSelectedColor = c;
  document.querySelectorAll('#gColorPicker .color-swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === c);
  });
}

function buildIconPicker() {
  const wrap = document.getElementById('gIconPicker');
  wrap.innerHTML = Object.keys(TJ_ICONS).map(key =>
    `<div class="icon-opt" data-icon="${key}" onclick="tjPickIcon('${key}')">${TJ_ICONS[key]}</div>`
  ).join('');
  tjPickIcon('target');
}
function tjPickIcon(key) {
  tjSelectedIcon = key;
  document.querySelectorAll('#gIconPicker .icon-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.icon === key);
  });
}

// ---------- Modal Tambah/Edit Tujuan ----------
function bindEvents() {
  document.getElementById('btnTambahTujuan').addEventListener('click', () => tjOpenAddModal());
  document.getElementById('btnTambahTujuanEmpty').addEventListener('click', () => tjOpenAddModal());
  document.getElementById('tjModalClose').addEventListener('click', closeTjModal);
  document.getElementById('tjModalCancel').addEventListener('click', closeTjModal);
  document.getElementById('tjModal').addEventListener('click', (e) => { if (e.target.id === 'tjModal') closeTjModal(); });
  document.getElementById('formTujuan').addEventListener('submit', onSubmitTujuan);

  document.getElementById('progressModalClose').addEventListener('click', closeProgressModal);
  document.getElementById('progressModalCancel').addEventListener('click', closeProgressModal);
  document.getElementById('progressModal').addEventListener('click', (e) => { if (e.target.id === 'progressModal') closeProgressModal(); });
  document.getElementById('formProgress').addEventListener('submit', onSubmitProgress);

  document.getElementById('tjDrawerClose').addEventListener('click', closeDrawer);
  document.getElementById('tjDrawerOverlay').addEventListener('click', (e) => { if (e.target.id === 'tjDrawerOverlay') closeDrawer(); });
  document.getElementById('drawerBtnProgress').addEventListener('click', () => tjOpenProgressModal(tjActiveGoalId));
  document.getElementById('drawerBtnEdit').addEventListener('click', () => tjOpenEditModal(tjActiveGoalId));
  document.getElementById('drawerBtnArsip').addEventListener('click', () => tjToggleArsip(tjActiveGoalId));
  document.getElementById('drawerBtnHapus').addEventListener('click', () => tjConfirmHapus(tjActiveGoalId));

  document.getElementById('confirmCancel').addEventListener('click', closeConfirm);
  document.getElementById('confirmOverlay').addEventListener('click', (e) => { if (e.target.id === 'confirmOverlay') closeConfirm(); });
  document.getElementById('confirmOk').addEventListener('click', () => { if (tjConfirmAction) tjConfirmAction(); closeConfirm(); });

  document.querySelectorAll('.tj-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tj-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      tjCurrentFilter = tab.dataset.filter;
      renderGrid();
    });
  });
}

function tjOpenAddModal() {
  tjEditingId = null;
  document.getElementById('tjModalTitle').textContent = dvT('tj.modal_title_tambah');
  document.getElementById('tjModalSubmit').textContent = dvT('tj.modal_submit_tambah');
  document.getElementById('formTujuan').reset();
  document.getElementById('gPrioritas').value = 'Sedang';
  dvAttachRibuanInput(document.getElementById('gTarget'));
  dvAttachRibuanInput(document.getElementById('gDanaAwal'));
  tjPickColor(TJ_COLORS[0]);
  tjPickIcon('target');
  openModal('tjModal');
}

function tjOpenEditModal(id) {
  closeAllDropdowns();
  const g = dvGetTujuan().find(x => x.id === id);
  if (!g) return;
  tjEditingId = id;
  document.getElementById('tjModalTitle').textContent = dvT('tj.modal_title_edit');
  document.getElementById('tjModalSubmit').textContent = dvT('tj.modal_submit_edit');
  document.getElementById('gNama').value = g.nama;
  document.getElementById('gKategori').value = g.kategori;
  document.getElementById('gTarget').value = dvFormatRibuan(g.target);
  document.getElementById('gDanaAwal').value = '';
  document.getElementById('gDanaAwal').placeholder = 'Gunakan "Tambah Progress" untuk menambah dana';
  document.getElementById('gDanaAwal').disabled = true;
  document.getElementById('gTanggal').value = g.targetTanggal || '';
  document.getElementById('gPrioritas').value = g.prioritas || 'Sedang';
  document.getElementById('gCatatan').value = g.catatan || '';
  dvAttachRibuanInput(document.getElementById('gTarget'));
  tjPickColor(g.warna);
  tjPickIcon(g.icon || 'target');
  closeDrawer();
  openModal('tjModal');
}

function closeTjModal() {
  closeModal('tjModal');
  document.getElementById('gDanaAwal').disabled = false;
  document.getElementById('gDanaAwal').placeholder = '0';
}

function onSubmitTujuan(e) {
  e.preventDefault();
  const data = {
    nama: document.getElementById('gNama').value.trim(),
    kategori: document.getElementById('gKategori').value,
    target: dvParseRibuan(document.getElementById('gTarget').value),
    targetTanggal: document.getElementById('gTanggal').value,
    prioritas: document.getElementById('gPrioritas').value,
    warna: tjSelectedColor,
    icon: tjSelectedIcon,
    catatan: document.getElementById('gCatatan').value.trim()
  };
  if (!data.nama || data.target <= 0) return;

  dvShowConfirm(dvT(tjEditingId ? 'tj.confirm_simpan_edit' : 'tj.confirm_simpan_tambah'), async () => {
    try {
      if (tjEditingId) {
        await dvUpdateTujuan(tjEditingId, data);
        showToast(dvT('tj.toast_diperbarui'));
      } else {
        data.terkumpul = dvParseRibuan(document.getElementById('gDanaAwal').value);
        await dvAddTujuan(data);
        showToast(dvT('tj.toast_ditambahkan'));
      }
      closeTjModal();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan tujuan.');
    }
  });
}

// ---------- Modal Tambah Progress ----------
function tjOpenProgressModal(id) {
  closeAllDropdowns();
  const g = dvGetTujuan().find(x => x.id === id);
  if (!g) return;
  tjActiveGoalId = id;
  const sisa = Math.max((Number(g.target) || 0) - (Number(g.terkumpul) || 0), 0);
  document.getElementById('progressTargetHint').innerHTML =
    `<span>${escapeHtml(g.nama)}</span><strong>Sisa ${dvFormatRupiah(sisa)}</strong>`;
  document.getElementById('formProgress').reset();
  document.getElementById('pTanggal').value = dvTodayISO();
  dvAttachRibuanInput(document.getElementById('pNominal'));
  openModal('progressModal');
}
function closeProgressModal() { closeModal('progressModal'); }

function onSubmitProgress(e) {
  e.preventDefault();
  if (!tjActiveGoalId) return;
  const nominal = dvParseRibuan(document.getElementById('pNominal').value);
  if (nominal <= 0) return;
  dvShowConfirm(dvT('tj.confirm_tambah_progress'), async () => {
    await dvAddTujuanProgress(tjActiveGoalId, {
      nominal,
      tanggal: document.getElementById('pTanggal').value || dvTodayISO(),
      catatan: document.getElementById('pCatatan').value.trim()
    });
    showToast(dvT('tj.toast_progress_ditambahkan'));
    closeProgressModal();
    if (document.getElementById('tjDrawerOverlay').classList.contains('open')) {
      renderDrawer(tjActiveGoalId);
    }
  });
}

// ---------- Drawer ----------
function tjOpenDrawer(id) {
  closeAllDropdowns();
  tjActiveGoalId = id;
  renderDrawer(id);
  document.getElementById('tjDrawerOverlay').classList.add('open');
}
function closeDrawer() {
  document.getElementById('tjDrawerOverlay').classList.remove('open');
}

function renderDrawer(id) {
  const g = dvGetTujuan().find(x => x.id === id);
  if (!g) { closeDrawer(); return; }
  const target = Number(g.target) || 0;
  const terkumpul = Number(g.terkumpul) || 0;
  const sisa = Math.max(target - terkumpul, 0);
  const pct = target ? Math.min(Math.round((terkumpul / target) * 100), 100) : 0;

  document.getElementById('drawerIcon').innerHTML = TJ_ICONS[g.icon] || TJ_ICONS.target;
  document.getElementById('drawerIcon').style.setProperty('--card-accent', g.warna);
  document.getElementById('drawerIcon').style.background = `color-mix(in srgb, ${g.warna} 18%, transparent)`;
  document.getElementById('drawerIcon').style.color = g.warna;
  document.getElementById('drawerNama').textContent = g.nama;
  document.getElementById('drawerKategori').textContent = g.kategori + (g.arsip ? ' · Diarsipkan' : '');
  document.getElementById('drawerPct').textContent = pct + '%';
  document.getElementById('drawerBarFill').style.width = pct + '%';
  document.getElementById('drawerBarFill').style.background = g.warna;
  document.getElementById('drawerTarget').textContent = dvFormatRupiah(target);
  document.getElementById('drawerTerkumpul').textContent = dvFormatRupiah(terkumpul);
  document.getElementById('drawerSisa').textContent = dvFormatRupiah(sisa);
  document.getElementById('drawerTglTarget').textContent = g.targetTanggal ? dvFormatTanggal(g.targetTanggal) : '—';
  document.getElementById('drawerPrioritas').textContent = g.prioritas || '—';
  document.getElementById('drawerStatusTxt').textContent = g.status;

  const noteWrap = document.getElementById('drawerNoteWrap');
  if (g.catatan) {
    noteWrap.style.display = 'block';
    document.getElementById('drawerCatatan').textContent = g.catatan;
  } else {
    noteWrap.style.display = 'none';
  }

  document.getElementById('drawerBtnArsip').textContent = g.arsip ? 'Aktifkan Kembali' : 'Arsipkan';

  const riwayat = Array.isArray(g.riwayat) ? g.riwayat : [];
  const histEl = document.getElementById('drawerHistoryList');
  if (riwayat.length === 0) {
    histEl.innerHTML = '<div class="dh-empty">' + dvT('tj.drawer_progress_empty') + '</div>';
  } else {
    histEl.innerHTML = riwayat.map(r => `
      <div class="dh-item">
        <div class="dh-left">
          <div class="dh-cat">${escapeHtml(r.catatan || 'Tambah progress')}</div>
          <div class="dh-date">${dvFormatTanggal(r.tanggal)}</div>
        </div>
        <div class="dh-amount">+${dvFormatRupiah(r.nominal)}</div>
      </div>
    `).join('');
  }
}

// ---------- Aksi: Arsip / Hapus ----------
async function tjToggleArsip(id) {
  closeAllDropdowns();
  const g = dvGetTujuan().find(x => x.id === id);
  if (!g) return;
  await dvSetTujuanArsip(id, !g.arsip);
  showToast(g.arsip ? 'Tujuan diaktifkan kembali' : 'Tujuan diarsipkan');
  if (document.getElementById('tjDrawerOverlay').classList.contains('open')) renderDrawer(id);
}

function tjConfirmHapus(id) {
  closeAllDropdowns();
  const g = dvGetTujuan().find(x => x.id === id);
  if (!g) return;
  openConfirm(
    dvT('tj.confirm_hapus_title'),
    dvT('tj.confirm_hapus_desc', {nama: g.nama}),
    async () => {
      await dvDeleteTujuan(id);
      showToast(dvT('tj.toast_dihapus'));
      closeDrawer();
    }
  );
}

// ---------- Confirm dialog ----------
function openConfirm(title, text, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmText').textContent = text;
  tjConfirmAction = onConfirm;
  document.getElementById('confirmOverlay').classList.add('open');
}
function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  tjConfirmAction = null;
}

// ---------- Modal helpers ----------
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ---------- Toast ----------
let tjToastTimer = null;
function showToast(msg) {
  const el = document.getElementById('dvToast');
  el.innerHTML = `<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>${escapeHtml(msg)}`;
  el.classList.add('show');
  clearTimeout(tjToastTimer);
  tjToastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}