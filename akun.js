// ============================================================
// DVpoint — Akun & Kartu (akun.js)
// Halaman pengelolaan seluruh sumber dana: rekening, e-wallet, kartu, cash.
// Semua data dibaca/ditulis lewat storage.js, sehingga otomatis sinkron
// dengan Dashboard, Semua Transaksi, Pemasukan, Pengeluaran & Transfer.
// ============================================================

const AK_ICONS = {
  bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M4 21V10l8-6 8 6v11"/><path d="M9 21v-7h6v7"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h13a1 1 0 011 1v3"/><path d="M3 7v11a2 2 0 002 2h14a1 1 0 001-1v-4"/><path d="M17 13h3a1 1 0 001-1v-2a1 1 0 00-1-1h-3a2 2 0 000 4z"/></svg>',
  card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v0M18 15v0"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  piggy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17a5 5 0 005-5V9a5 5 0 00-10 0"/><path d="M6 9H3l2-3"/><circle cx="16.5" cy="9.5" r=".7" fill="currentColor" stroke="none"/><path d="M8 21v-2M14 21v-2M4 12H2v3h2"/></svg>'
};

const AK_COLORS = ['#4f7dff', '#2dd9a8', '#9f4dff', '#ef4d8f', '#f5b342', '#38bdf8', '#f97066', '#8a86a8'];

const AK_JENIS_LABEL = { Bank: 'Bank', 'E-Wallet': 'E-Wallet', Kartu: 'Kartu Kredit', Cash: 'Cash' };

let akState = {
  filter: 'semua',
  editingId: null,
  selectedColor: AK_COLORS[0],
  selectedIcon: 'bank',
  openMenuId: null,
  sparkChart: null
};

function akIconFor(jenis) {
  if (jenis === 'E-Wallet') return 'phone';
  if (jenis === 'Kartu') return 'card';
  if (jenis === 'Cash') return 'cash';
  return 'bank';
}

// ---------- Toast ----------
let akToastTimer = null;
function akToast(msg) {
  const el = document.getElementById('akToast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(akToastTimer);
  akToastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------- Ringkasan ----------
function akRenderSummary() {
  const akunList = dvGetAkunAll();
  const summary = dvGetSummary();

  const totalAsset = summary.saldo;
  document.getElementById('sumTotalAsset').textContent = dvFormatRupiah(totalAsset);
  document.getElementById('sumTotalAssetSub').textContent = akunList.length
    ? `${akunList.filter(a => a.status !== 'nonaktif').length} akun aktif`
    : dvT('akun.belum_ada_data');

  function groupTotal(jenis) {
    return akunList.filter(a => a.jenis === jenis).reduce((s, a) => s + dvHitungSaldoAkun(a.id), 0);
  }
  function groupCount(jenis) {
    return akunList.filter(a => a.jenis === jenis).length;
  }

  const rek = groupTotal('Bank'), rekN = groupCount('Bank');
  document.getElementById('sumRekening').textContent = dvFormatRupiah(rek);
  document.getElementById('sumRekeningSub').textContent = rekN ? dvT('akun.n_akun_bank', {n: rekN}) : dvT('akun.belum_ada_rekening');

  const ew = groupTotal('E-Wallet'), ewN = groupCount('E-Wallet');
  document.getElementById('sumEwallet').textContent = dvFormatRupiah(ew);
  document.getElementById('sumEwalletSub').textContent = ewN ? dvT('akun.n_ewallet', {n: ewN}) : dvT('akun.belum_ada_ewallet');

  const kartu = groupTotal('Kartu'), kartuN = groupCount('Kartu');
  document.getElementById('sumKartu').textContent = dvFormatRupiah(kartu);
  document.getElementById('sumKartuSub').textContent = kartuN ? dvT('akun.n_kartu', {n: kartuN}) : dvT('akun.belum_ada_kartu');

  akRenderSparkline();
}

function akRenderSparkline() {
  const canvas = document.getElementById('sparkTotalAsset');
  if (!canvas || typeof Chart === 'undefined') return;
  const data = dvGetSparklines().saldo;
  if (akState.sparkChart) { akState.sparkChart.destroy(); akState.sparkChart = null; }
  akState.sparkChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: '#4f7dff', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      elements: { line: { borderJoinStyle: 'round' } }
    }
  });
}

// ---------- Grid akun ----------
function akRenderGrid() {
  const grid = document.getElementById('akGrid');
  const all = dvGetAkunAll();
  const list = akState.filter === 'semua' ? all : all.filter(a => a.jenis === akState.filter);

  if (!all.length) {
    grid.innerHTML = `
      <div class="ak-empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="3"/><path d="M2 10h20"/><path d="M7 15h4"/></svg>
        <h4>${dvT('akun.empty_title')}</h4>
        <p>${dvT('akun.empty_desc')}</p>
        <button class="btn-primary" onclick="akOpenAddModal()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"></path></svg>
          ${dvT('akun.modal_title_tambah')}
        </button>
      </div>`;
    return;
  }

  if (!list.length) {
    grid.innerHTML = `<div class="ak-empty"><h4>${dvT('akun.empty_filter_title')}</h4><p>${dvT('akun.empty_filter_desc')}</p></div>`;
    return;
  }

  grid.innerHTML = list.map(a => {
    const saldo = dvHitungSaldoAkun(a.id);
    const hasTx = dvAkunHasTransaksi(a.id);
    const norek = a.noRekening ? '•••• ' + String(a.noRekening).slice(-4) : '—';
    const nonaktif = a.status === 'nonaktif';
    return `
    <div class="ak-card ${nonaktif ? 'is-nonaktif' : ''}" style="--ak-card-color:${a.warna}" data-id="${a.id}" onclick="akCardClick(event,'${a.id}')">
      <div class="ak-card-top">
        <div class="ak-card-icon">${AK_ICONS[a.icon] || AK_ICONS.bank}</div>
        <button class="ak-card-menu-btn" onclick="akToggleMenu(event,'${a.id}')">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>
        </button>
        <div class="ak-card-menu" id="menu-${a.id}">
          <button onclick="akOpenDrawer(event,'${a.id}')">Lihat Detail</button>
          <button onclick="akOpenEditModal(event,'${a.id}')">Edit</button>
          <button onclick="akToggleStatus(event,'${a.id}')">${nonaktif ? dvT('akun.aktifkan') : dvT('akun.nonaktifkan')}</button>
          <div class="ak-menu-sep"></div>
          <button class="danger" ${hasTx ? `disabled title="${dvT('akun.hapus_disabled_title')}"` : ''} onclick="akDeleteAkun(event,'${a.id}')">${dvT('akun.hapus')}</button>
        </div>
      </div>
      <div class="ak-card-name">${akEsc(a.nama)}</div>
      <div class="ak-card-jenis">${AK_JENIS_LABEL[a.jenis] || a.jenis}</div>
      <div class="ak-card-norek">${norek}</div>
      <div class="ak-card-saldo-label">Saldo</div>
      <div class="ak-card-saldo-value">${dvFormatRupiah(saldo)}</div>
      <div class="ak-card-footer">
        <span class="ak-status-pill ${nonaktif ? 'nonaktif' : 'aktif'}"><span class="dot2"></span>${nonaktif ? dvT('akun.status_nonaktif') : dvT('akun.status_aktif')}</span>
      </div>
    </div>`;
  }).join('');
}

function akEsc(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : s;
  return div.innerHTML;
}

function akCardClick(e, id) {
  if (e.target.closest('.ak-card-menu') || e.target.closest('.ak-card-menu-btn')) return;
  akOpenDrawer(e, id);
}

function akCloseAllMenus() {
  document.querySelectorAll('.ak-card-menu.open').forEach(m => m.classList.remove('open'));
  akState.openMenuId = null;
}

function akToggleMenu(e, id) {
  e.stopPropagation();
  const menu = document.getElementById('menu-' + id);
  const wasOpen = menu.classList.contains('open');
  akCloseAllMenus();
  if (!wasOpen) { menu.classList.add('open'); akState.openMenuId = id; }
}

document.addEventListener('click', () => akCloseAllMenus());

// ---------- Filter chips ----------
document.getElementById('akFilters').addEventListener('click', (e) => {
  const chip = e.target.closest('.ak-filter-chip');
  if (!chip) return;
  document.querySelectorAll('.ak-filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  akState.filter = chip.dataset.filter;
  akRenderGrid();
});

// ---------- Modal Tambah / Edit ----------
function akBuildColorGrid() {
  const wrap = document.getElementById('akColorGrid');
  wrap.innerHTML = AK_COLORS.map(c => `<div class="ak-color-dot ${c === akState.selectedColor ? 'selected' : ''}" style="background:${c}" data-color="${c}"></div>`).join('');
  wrap.querySelectorAll('.ak-color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      akState.selectedColor = dot.dataset.color;
      wrap.querySelectorAll('.ak-color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
  });
}

function akBuildIconGrid() {
  const wrap = document.getElementById('akIconGrid');
  const keys = Object.keys(AK_ICONS);
  wrap.innerHTML = keys.map(k => `<div class="ak-icon-opt ${k === akState.selectedIcon ? 'selected' : ''}" data-icon="${k}">${AK_ICONS[k]}</div>`).join('');
  wrap.querySelectorAll('.ak-icon-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      akState.selectedIcon = opt.dataset.icon;
      wrap.querySelectorAll('.ak-icon-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });
}

function akOpenAddModal() {
  akState.editingId = null;
  akState.selectedColor = AK_COLORS[0];
  akState.selectedIcon = 'bank';
  document.getElementById('akModalTitle').textContent = dvT('akun.modal_title_tambah');
  document.getElementById('akModalSubmit').textContent = dvT('akun.modal_submit_tambah');
  document.getElementById('formAkun').reset();
  document.getElementById('akModalError').textContent = '';
  document.getElementById('akInpJenis').value = 'Bank';
  dvAttachRibuanInput(document.getElementById('akInpSaldo'));
  akBuildColorGrid();
  akBuildIconGrid();
  document.getElementById('akModalOverlay').classList.add('open');
}

function akOpenEditModal(e, id) {
  if (e) e.stopPropagation();
  akCloseAllMenus();
  const akun = dvGetAkunAll().find(a => a.id === id);
  if (!akun) return;
  akState.editingId = id;
  akState.selectedColor = akun.warna;
  akState.selectedIcon = akun.icon;
  document.getElementById('akModalTitle').textContent = dvT('akun.modal_title_edit');
  document.getElementById('akModalSubmit').textContent = dvT('akun.modal_submit_edit');
  document.getElementById('akModalError').textContent = '';
  document.getElementById('akInpNama').value = akun.nama;
  document.getElementById('akInpJenis').value = akun.jenis;
  document.getElementById('akInpBank').value = akun.bank || '';
  document.getElementById('akInpNorek').value = akun.noRekening || '';
  document.getElementById('akInpSaldo').value = dvFormatRibuan(akun.saldoAwal || 0);
  document.getElementById('akInpCatatan').value = akun.catatan || '';
  dvAttachRibuanInput(document.getElementById('akInpSaldo'));
  akBuildColorGrid();
  akBuildIconGrid();
  document.getElementById('akModalOverlay').classList.add('open');
}

function akCloseModal() {
  document.getElementById('akModalOverlay').classList.remove('open');
}

document.getElementById('btnTambahAkun').addEventListener('click', akOpenAddModal);
document.getElementById('akModalClose').addEventListener('click', akCloseModal);
document.getElementById('akModalCancel').addEventListener('click', akCloseModal);
document.getElementById('akModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'akModalOverlay') akCloseModal(); });

document.getElementById('akInpJenis').addEventListener('change', (e) => {
  if (akState.editingId) return; // jangan timpa pilihan icon manual saat edit
  akState.selectedIcon = akIconFor(e.target.value);
  akBuildIconGrid();
});

document.getElementById('formAkun').addEventListener('submit', (e) => {
  e.preventDefault();
  const nama = document.getElementById('akInpNama').value.trim();
  const jenis = document.getElementById('akInpJenis').value;
  const bank = document.getElementById('akInpBank').value.trim();
  const noRekening = document.getElementById('akInpNorek').value.trim();
  const saldoAwal = dvParseRibuan(document.getElementById('akInpSaldo').value);
  const catatan = document.getElementById('akInpCatatan').value.trim();
  const errEl = document.getElementById('akModalError');

  if (!nama) { errEl.textContent = dvT('akun.err_nama_wajib'); return; }

  dvShowConfirm(dvT(akState.editingId ? 'akun.confirm_simpan_edit' : 'akun.confirm_simpan_tambah'), () => {
    const payload = { nama, jenis, bank: bank || nama, noRekening, warna: akState.selectedColor, icon: akState.selectedIcon, saldoAwal, catatan };

    if (akState.editingId) {
      dvUpdateAkunAccount(akState.editingId, payload);
      akToast(dvT('akun.toast_diperbarui'));
    } else {
      dvAddAkunAccount(payload);
      akToast(dvT('akun.toast_ditambahkan'));
    }
    akCloseModal();
  });
});

// ---------- Nonaktifkan / Hapus ----------
function akToggleStatus(e, id) {
  e.stopPropagation();
  akCloseAllMenus();
  const akun = dvGetAkunAll().find(a => a.id === id);
  if (!akun) return;
  const next = akun.status === 'nonaktif' ? 'aktif' : 'nonaktif';
  dvSetAkunStatus(id, next);
  akToast(next === 'nonaktif' ? dvT('akun.toast_dinonaktifkan', {nama: akun.nama}) : dvT('akun.toast_diaktifkan', {nama: akun.nama}));
}

function akDeleteAkun(e, id) {
  e.stopPropagation();
  akCloseAllMenus();
  const akun = dvGetAkunAll().find(a => a.id === id);
  if (!akun) return;
  if (dvAkunHasTransaksi(id)) {
    akToast(dvT('akun.toast_hanya_nonaktif'));
    return;
  }
  dvShowConfirm(dvT('akun.confirm_hapus', {nama: akun.nama}), () => {
    const res = dvDeleteAkunAccount(id);
    if (res.success) akToast(dvT('akun.toast_dihapus'));
  }, { danger: true });
}

// ---------- Drawer Detail ----------
function akOpenDrawer(e, id) {
  if (e) e.stopPropagation();
  akCloseAllMenus();
  const detail = dvGetAkunDetail(id);
  if (!detail) return;
  const { akun, saldo, totalMasuk, totalKeluar, totalTransferMasuk, totalTransferKeluar, jumlahTransaksi, riwayat } = detail;

  const body = document.getElementById('akDrawerBody');
  body.innerHTML = `
    <div class="ak-drawer-hero">
      <div class="ak-card-icon" style="--ak-card-color:${akun.warna}">${AK_ICONS[akun.icon] || AK_ICONS.bank}</div>
      <div>
        <div class="ak-card-name">${akEsc(akun.nama)}</div>
        <div class="ak-card-jenis">${AK_JENIS_LABEL[akun.jenis] || akun.jenis}${akun.noRekening ? ' · •••• ' + String(akun.noRekening).slice(-4) : ''}</div>
      </div>
    </div>
    <div class="ak-card-saldo-label">Saldo Saat Ini</div>
    <div class="ak-drawer-saldo" style="margin-bottom:20px;">${dvFormatRupiah(saldo)}</div>

    <div class="ak-drawer-stats">
      <div class="ak-drawer-stat"><div class="lbl">Total Pemasukan</div><div class="val pos">${dvFormatRupiah(totalMasuk)}</div></div>
      <div class="ak-drawer-stat"><div class="lbl">Total Pengeluaran</div><div class="val neg">${dvFormatRupiah(totalKeluar)}</div></div>
      <div class="ak-drawer-stat"><div class="lbl">Transfer Masuk</div><div class="val pos">${dvFormatRupiah(totalTransferMasuk)}</div></div>
      <div class="ak-drawer-stat"><div class="lbl">Transfer Keluar</div><div class="val neg">${dvFormatRupiah(totalTransferKeluar)}</div></div>
    </div>
    <div class="ak-drawer-stat" style="margin-bottom:4px;"><div class="lbl">Jumlah Transaksi</div><div class="val">${jumlahTransaksi}</div></div>

    <div class="ak-drawer-section-title">Riwayat Transaksi</div>
    <div>
      ${riwayat.length ? riwayat.slice(0, 30).map(t => akTxRow(t, id)).join('') : '<div class="ak-drawer-empty">' + dvT('akun.drawer_empty') + '</div>'}
    </div>
  `;

  document.getElementById('akDrawerOverlay').classList.add('open');
  document.getElementById('akDrawer').classList.add('open');
}

function akTxRow(t, akunId) {
  let tipeClass = t.tipe, sign = '', label = t.deskripsi || t.kategori;
  if (t.tipe === 'masuk') sign = '+';
  else if (t.tipe === 'keluar') sign = '-';
  else {
    tipeClass = 'transfer';
    if (t.akunAsal === akunId) { sign = '-'; }
    else { sign = '+'; }
  }
  return `
    <div class="ak-tx-row">
      <div class="ak-tx-left">
        <div class="ak-tx-desc">${akEsc(label)}</div>
        <div class="ak-tx-date">${dvFormatTanggal(t.tanggal)}</div>
      </div>
      <div class="ak-tx-amount ${tipeClass}">${sign}${dvFormatRupiah(t.jumlah)}</div>
    </div>`;
}

function akCloseDrawer() {
  document.getElementById('akDrawerOverlay').classList.remove('open');
  document.getElementById('akDrawer').classList.remove('open');
}
document.getElementById('akDrawerClose').addEventListener('click', akCloseDrawer);
document.getElementById('akDrawerOverlay').addEventListener('click', akCloseDrawer);

// ---------- Render utama + sinkronisasi real-time ----------
function akRenderAll() {
  akRenderSummary();
  akRenderGrid();
}

akRenderAll();
dvOnChange(akRenderAll);