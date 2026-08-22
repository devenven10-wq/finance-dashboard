// ============================================================
// DVpoint — Semua Transaksi (pusat riwayat keuangan)
// Menggabungkan data Pemasukan, Pengeluaran & Transfer dari storage.js
// (single source of truth) dengan filter, pencarian, sort, detail
// drawer, edit, duplicate, dan hapus — semua realtime tanpa reload.
// ============================================================

(function () {
  const state = {
    search: '',
    jenis: '',
    kategori: '',
    akun: '',
    bulan: '',
    dariTanggal: '',
    sampaiTanggal: '',
    sort: 'terbaru',
    editingId: null,
    deleteId: null,
    modalTipe: 'masuk',
    loaded: false
  };

  const sparkCharts = {};

  const els = {
    fSearch: document.getElementById('fSearch'),
    fJenis: document.getElementById('fJenis'),
    fKategori: document.getElementById('fKategori'),
    fAkun: document.getElementById('fAkun'),
    fBulan: document.getElementById('fBulan'),
    fDariTanggal: document.getElementById('fDariTanggal'),
    fSampaiTanggal: document.getElementById('fSampaiTanggal'),
    fSort: document.getElementById('fSort'),
    btnReset: document.getElementById('btnReset'),
    btnTambahTx: document.getElementById('btnTambahTx'),
    btnEmptyAdd: document.getElementById('btnEmptyAdd'),
    resultCount: document.getElementById('resultCount'),
    tableEmptyState: document.getElementById('tableEmptyState'),
    noResultState: document.getElementById('noResultState'),
    txTable: document.getElementById('txTable'),
    txTableBody: document.getElementById('txTableBody'),

    txModal: document.getElementById('txModal'),
    txModalTitle: document.getElementById('txModalTitle'),
    txModalClose: document.getElementById('txModalClose'),
    txModalCancel: document.getElementById('txModalCancel'),
    txSegmented: document.getElementById('txSegmented'),
    txForm: document.getElementById('txForm'),
    txTanggal: document.getElementById('txTanggal'),
    txKategoriWrap: document.getElementById('txKategoriWrap'),
    txKategori: document.getElementById('txKategori'),
    txNominal: document.getElementById('txNominal'),
    txAkunWrap: document.getElementById('txAkunWrap'),
    txAkunLabel: document.getElementById('txAkunLabel'),
    txAkun: document.getElementById('txAkun'),
    txAkunTujuanWrap: document.getElementById('txAkunTujuanWrap'),
    txAkunTujuan: document.getElementById('txAkunTujuan'),
    txMetodeWrap: document.getElementById('txMetodeWrap'),
    txMetode: document.getElementById('txMetode'),
    txMetodeWrapAlone: document.getElementById('txMetodeWrapAlone'),
    txMetode2: document.getElementById('txMetode2'),
    txCatatan: document.getElementById('txCatatan'),
    txFormError: document.getElementById('txFormError'),
    txSubmitBtn: document.getElementById('txSubmitBtn'),

    txDrawer: document.getElementById('txDrawer'),
    drawerClose: document.getElementById('drawerClose'),
    drawerBanner: document.getElementById('drawerBanner'),
    drawerIcon: document.getElementById('drawerIcon'),
    drawerTypeLabel: document.getElementById('drawerTypeLabel'),
    drawerAmount: document.getElementById('drawerAmount'),
    drawerFields: document.getElementById('drawerFields'),
    drawerEditBtn: document.getElementById('drawerEditBtn'),
    drawerDeleteBtn: document.getElementById('drawerDeleteBtn'),

    confirmModal: document.getElementById('confirmModal'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmDelete: document.getElementById('confirmDelete')
  };

  // ---------- Helpers ----------
  function typeLabel(tipe) {
    return tipe === 'masuk' ? dvT('tx.tipe_masuk') : tipe === 'keluar' ? dvT('tx.tipe_keluar') : dvT('tx.tipe_transfer');
  }
  function typeIconPath(tipe) {
    if (tipe === 'masuk') return '<path d="M12 4v14M6 12l6 6 6-6"></path>';
    if (tipe === 'keluar') return '<path d="M12 20V6M6 12l6-6 6 6"></path>';
    return '<path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13"></path>';
  }
  function typeIconSvg(tipe) {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${typeIconPath(tipe)}</svg>`;
  }
  function statusMeta(status) {
    if (status === 'Pending') return { cls: 'pending', label: dvT('tx.status_pending') };
    if (status === 'Gagal') return { cls: 'dibatalkan', label: dvT('tx.status_gagal') };
    return { cls: 'selesai', label: dvT('tx.status_selesai') };
  }
  function akunNama(id) {
    const a = DV_AKUN.find(x => x.id === id);
    return a ? a.nama : (id || '-');
  }
  function fmtPct(pct) {
    const rounded = Math.round(Math.abs(pct) * 10) / 10;
    return rounded + '%';
  }
  function pctBlock(pct, hasData) {
    if (!hasData) return dvT('tx.belum_ada_data');
    const dir = pct >= 0 ? 'up' : 'down';
    const arrow = pct >= 0 ? '↗' : '↘';
    return `<span class="kpi-change ${dir}">${arrow} ${fmtPct(pct)}</span> dari bulan lalu`;
  }

  // ---------- Populate static selects ----------
  function fillAkunSelect(sel, includeAll) {
    if (!sel) return;
    let html = includeAll ? '<option value="">Semua Akun</option>' : '';
    html += DV_AKUN.map(a => `<option value="${a.id}">${a.nama}</option>`).join('');
    sel.innerHTML = html;
  }
  function fillKategoriFilter() {
    const jenis = els.fJenis.value;
    let cats = [];
    if (jenis === 'masuk') cats = DV_KATEGORI.masuk;
    else if (jenis === 'keluar') cats = DV_KATEGORI.keluar;
    else if (jenis === 'transfer') cats = ['Transfer'];
    else cats = [...new Set([...DV_KATEGORI.masuk, ...DV_KATEGORI.keluar, 'Transfer'])];
    els.fKategori.innerHTML = '<option value="">Semua Kategori</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
  }
  function fillMetode(sel) {
    if (!sel) return;
    sel.innerHTML = DV_METODE.map(m => `<option value="${m}">${m}</option>`).join('');
  }

  function initStaticUI() {
    fillAkunSelect(els.fAkun, true);
    fillKategoriFilter();
    fillAkunSelect(els.txAkun, false);
    fillAkunSelect(els.txAkunTujuan, false);
    fillMetode(els.txMetode);
    fillMetode(els.txMetode2);
  }

  // ---------- Filtering ----------
  function inMonthRange(dateISO, mode) {
    if (!mode) return true;
    const d = new Date(dateISO + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    if (mode === 'bulan-ini') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (mode === 'bulan-lalu') {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getFullYear() === lm.getFullYear() && d.getMonth() === lm.getMonth();
    }
    const monthsBack = mode === '3bulan' ? 3 : mode === '6bulan' ? 6 : 12;
    const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
    return d >= cutoff;
  }

  function getFilteredList() {
    let list = dvGetTransaksi();
    const q = state.search.trim().toLowerCase();

    list = list.filter(t => {
      if (state.jenis && t.tipe !== state.jenis) return false;
      if (state.kategori && t.kategori !== state.kategori) return false;
      if (state.akun && t.akun !== state.akun && t.akunAsal !== state.akun && t.akunTujuan !== state.akun) return false;
      if (state.dariTanggal || state.sampaiTanggal) {
        if (state.dariTanggal && t.tanggal < state.dariTanggal) return false;
        if (state.sampaiTanggal && t.tanggal > state.sampaiTanggal) return false;
      } else if (!inMonthRange(t.tanggal, state.bulan)) return false;
      if (q) {
        const hay = [t.deskripsi, t.kategori, t.catatan, akunNama(t.akun), akunNama(t.akunAsal), akunNama(t.akunTujuan)]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (state.sort === 'terbaru') return new Date(b.tanggal) - new Date(a.tanggal) || String(b.id).localeCompare(a.id);
      if (state.sort === 'terlama') return new Date(a.tanggal) - new Date(b.tanggal) || String(a.id).localeCompare(b.id);
      if (state.sort === 'tertinggi') return (Number(b.jumlah) || 0) - (Number(a.jumlah) || 0);
      if (state.sort === 'terendah') return (Number(a.jumlah) || 0) - (Number(b.jumlah) || 0);
      return 0;
    });

    return list;
  }

  // ---------- Stats & sparklines ----------
  function renderSpark(id, data, color) {
    const el = document.getElementById(id);
    if (!el || typeof Chart === 'undefined') return;
    if (sparkCharts[id]) sparkCharts[id].destroy();
    sparkCharts[id] = new Chart(el.getContext('2d'), {
      type: 'line',
      data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 2, tension: .4, fill: false, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } } }
    });
  }

  function renderStats(allList) {
    const monthly = dvGetMonthlyStats(allList);
    const thisMonth = monthly[monthly.length - 1];
    const lastMonth = monthly[monthly.length - 2] || { count: 0, masuk: 0, keluar: 0, transfer: 0 };
    const summary = dvGetSummary(allList);
    const hasData = summary.jumlahTransaksi > 0;

    function pctOf(now, prev) {
      if (!prev) return now > 0 ? 100 : 0;
      return ((now - prev) / Math.abs(prev)) * 100;
    }

    document.getElementById('kpiTotalVal').textContent = summary.jumlahTransaksi;
    document.getElementById('kpiTotalSub').innerHTML = pctBlock(pctOf(thisMonth.count, lastMonth.count), hasData);

    document.getElementById('kpiMasukVal').textContent = dvFormatRupiah(summary.totalMasuk);
    document.getElementById('kpiMasukSub').innerHTML = pctBlock(pctOf(thisMonth.masuk, lastMonth.masuk), summary.totalMasuk > 0);

    document.getElementById('kpiKeluarVal').textContent = dvFormatRupiah(summary.totalKeluar);
    document.getElementById('kpiKeluarSub').innerHTML = pctBlock(pctOf(thisMonth.keluar, lastMonth.keluar), summary.totalKeluar > 0);

    document.getElementById('kpiTransferVal').textContent = dvFormatRupiah(summary.totalTransfer);
    document.getElementById('kpiTransferSub').innerHTML = pctBlock(pctOf(thisMonth.transfer, lastMonth.transfer), summary.totalTransfer > 0);

    renderSpark('sparkTotal', monthly.map(b => b.count), '#9f4dff');
    renderSpark('sparkMasuk', monthly.map(b => b.masuk), '#2dd9a8');
    renderSpark('sparkKeluar', monthly.map(b => b.keluar), '#ef4d8f');
    renderSpark('sparkTransfer', monthly.map(b => b.transfer), '#4f7dff');
  }

  // ---------- Table rendering ----------
  function rowTemplate(t) {
    const tipe = t.tipe;
    const sMeta = statusMeta(t.status);
    const amountCls = tipe === 'masuk' ? 'pos' : tipe === 'keluar' ? 'neg' : 'transfer';
    const sign = tipe === 'masuk' ? '+' : tipe === 'keluar' ? '-' : '';
    const warnaKat = DV_KATEGORI_WARNA[t.kategori] || '#8a86a8';

    let akunCell;
    if (tipe === 'transfer') {
      akunCell = `<div class="acc-flow"><span class="acc-tag">${akunNama(t.akunAsal)}</span>
        <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
        <span class="acc-tag">${akunNama(t.akunTujuan)}</span></div>`;
    } else {
      akunCell = `<span class="acc-tag">${akunNama(t.akun)}</span>`;
    }

    return `
      <tr class="tx-row" data-id="${t.id}">
        <td><div class="tx-icon ${tipe}">${typeIconSvg(tipe)}</div></td>
        <td class="desc-cell">${dvFormatTanggal(t.tanggal)}</td>
        <td><span class="type-badge ${tipe}">${typeIconSvg(tipe)}${typeLabel(tipe)}</span></td>
        <td><span class="cat-badge" style="background:${warnaKat}22; color:${warnaKat};">${t.kategori}</span></td>
        <td class="desc-cell">${t.deskripsi || '-'}</td>
        <td>${akunCell}</td>
        <td class="amount ${amountCls}">${sign ? sign + ' ' : ''}${dvFormatRupiah(t.jumlah)}</td>
        <td><span class="status-badge ${sMeta.cls}">${sMeta.label}</span></td>
        <td class="action-cell">
          <button class="action-menu-btn" data-menu-btn="${t.id}" title="Menu aksi">
            <svg fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="12" cy="19" r="1.6"></circle></svg>
          </button>
          <div class="action-menu-list" data-menu="${t.id}">
            <button class="action-menu-item" data-action="detail" data-id="${t.id}">
              <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              Lihat Detail
            </button>
            <button class="action-menu-item" data-action="edit" data-id="${t.id}">
              <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              Edit
            </button>
            <button class="action-menu-item" data-action="duplicate" data-id="${t.id}">
              <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><rect height="13" rx="2" width="13" x="9" y="9"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
              Duplicate
            </button>
            <div class="action-menu-divider"></div>
            <button class="action-menu-item danger" data-action="delete" data-id="${t.id}">
              <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"></path></svg>
              Hapus
            </button>
          </div>
        </td>
      </tr>`;
  }

  function renderTable() {
    const allList = dvGetTransaksi();
    renderStats(allList);

    const filtered = getFilteredList();

    if (!allList.length) {
      els.tableEmptyState.style.display = 'block';
      els.noResultState.style.display = 'none';
      els.txTable.style.display = 'none';
      els.resultCount.textContent = '';
      return;
    }
    els.tableEmptyState.style.display = 'none';

    if (!filtered.length) {
      els.noResultState.style.display = 'block';
      els.txTable.style.display = 'none';
      els.resultCount.textContent = dvT('tx.n_ditemukan', {n: 0});
      return;
    }
    els.noResultState.style.display = 'none';
    els.txTable.style.display = 'table';
    els.resultCount.textContent = dvT('tx.n_dari_n', {filtered: filtered.length, total: allList.length});
    els.txTableBody.innerHTML = filtered.map(rowTemplate).join('');
  }

  function showSkeleton() {
    els.txTable.style.display = 'table';
    els.tableEmptyState.style.display = 'none';
    els.noResultState.style.display = 'none';
    els.txTableBody.innerHTML = Array.from({ length: 5 }).map(() => `
      <tr class="skeleton-row">
        <td><div class="skeleton" style="width:34px;height:34px;border-radius:10px;"></div></td>
        <td><div class="skeleton" style="width:70px;"></div></td>
        <td><div class="skeleton" style="width:90px;"></div></td>
        <td><div class="skeleton" style="width:80px;"></div></td>
        <td><div class="skeleton" style="width:120px;"></div></td>
        <td><div class="skeleton" style="width:60px;"></div></td>
        <td><div class="skeleton" style="width:80px;"></div></td>
        <td><div class="skeleton" style="width:60px;"></div></td>
        <td><div class="skeleton" style="width:28px;height:28px;border-radius:8px;"></div></td>
      </tr>`).join('');
  }

  // ---------- Action menu (open/close) ----------
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-menu-btn]');
    document.querySelectorAll('.action-menu-list.open').forEach(m => {
      if (!btn || m.getAttribute('data-menu') !== btn.getAttribute('data-menu-btn')) m.classList.remove('open');
    });
    if (btn) {
      const menu = document.querySelector(`.action-menu-list[data-menu="${btn.getAttribute('data-menu-btn')}"]`);
      menu?.classList.toggle('open');
      e.stopPropagation();
    }
  });

  els.txTableBody?.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const id = actionBtn.getAttribute('data-id');
      const action = actionBtn.getAttribute('data-action');
      document.querySelectorAll('.action-menu-list.open').forEach(m => m.classList.remove('open'));
      if (action === 'detail') openDrawer(id);
      else if (action === 'edit') openEditModal(id);
      else if (action === 'duplicate') { dvDuplicateTransaksi(id); }
      else if (action === 'delete') openConfirmDelete(id);
      return;
    }
    const row = e.target.closest('.tx-row');
    if (row) openDrawer(row.getAttribute('data-id'));
  });

  // ---------- Detail drawer ----------
  function openDrawer(id) {
    const t = dvGetTransaksi().find(x => x.id === id);
    if (!t) return;
    const tipe = t.tipe;
    const sMeta = statusMeta(t.status);

    els.drawerBanner.className = `drawer-type-banner ${tipe}`;
    els.drawerIcon.className = `tx-icon ${tipe}`;
    els.drawerIcon.innerHTML = typeIconSvg(tipe);
    els.drawerTypeLabel.textContent = typeLabel(tipe);
    els.drawerAmount.textContent = (tipe === 'masuk' ? '+ ' : tipe === 'keluar' ? '- ' : '') + dvFormatRupiah(t.jumlah);
    els.drawerAmount.style.color = tipe === 'masuk' ? 'var(--teal)' : tipe === 'keluar' ? 'var(--pink)' : 'var(--blue)';

    const akunField = tipe === 'transfer'
      ? `${akunNama(t.akunAsal)} → ${akunNama(t.akunTujuan)}`
      : akunNama(t.akun);

    const fields = [
      ['ID Transaksi', t.id],
      ['Tanggal', dvFormatTanggal(t.tanggal)],
      ['Jenis', typeLabel(tipe)],
      ['Kategori', t.kategori],
      ['Nominal', dvFormatRupiah(t.jumlah)],
      ['Akun', akunField],
      ['Metode Pembayaran', t.metode || '-'],
      ['Catatan', t.catatan || '-'],
      ['Status', sMeta.label]
    ];
    els.drawerFields.innerHTML = fields.map(([k, v]) => `<div class="drawer-field"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');

    els.drawerEditBtn.onclick = () => { closeDrawer(); openEditModal(id); };
    els.drawerDeleteBtn.onclick = () => { closeDrawer(); openConfirmDelete(id); };

    els.txDrawer.classList.add('open');
  }
  function closeDrawer() { els.txDrawer.classList.remove('open'); }
  els.drawerClose?.addEventListener('click', closeDrawer);
  els.txDrawer?.addEventListener('click', (e) => { if (e.target === els.txDrawer) closeDrawer(); });

  // ---------- Confirm delete ----------
  function openConfirmDelete(id) {
    state.deleteId = id;
    els.confirmModal.classList.add('open');
  }
  function closeConfirm() { els.confirmModal.classList.remove('open'); state.deleteId = null; }
  els.confirmCancel?.addEventListener('click', closeConfirm);
  els.confirmModal?.addEventListener('click', (e) => { if (e.target === els.confirmModal) closeConfirm(); });
  els.confirmDelete?.addEventListener('click', () => {
    if (state.deleteId) dvDeleteTransaksi(state.deleteId);
    closeConfirm();
    dvShowGenericToast(dvT('tx.toast_dihapus'));
  });

  // ---------- Add / Edit modal ----------
  function switchModalTipe(tipe) {
    state.modalTipe = tipe;
    els.txSegmented.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.getAttribute('data-tipe') === tipe));

    const isTransfer = tipe === 'transfer';
    els.txKategoriWrap.style.display = isTransfer ? 'none' : 'block';
    els.txAkunTujuanWrap.style.display = isTransfer ? 'block' : 'none';
    els.txMetodeWrapAlone.style.display = isTransfer ? 'none' : 'block';
    els.txAkunLabel.textContent = isTransfer ? 'Akun Asal' : 'Akun';

    if (!isTransfer) {
      const cats = DV_KATEGORI[tipe];
      els.txKategori.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    els.txSubmitBtn.className = 'btn-primary' + (tipe === 'keluar' ? ' red' : '');
    els.txSubmitBtn.textContent = state.editingId ? 'Simpan Perubahan' : `Simpan ${typeLabel(tipe)}`;
  }

  els.txSegmented?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tipe]');
    if (!btn || btn.disabled) return;
    switchModalTipe(btn.getAttribute('data-tipe'));
  });

  function resetForm() {
    els.txForm.reset();
    els.txTanggal.value = dvTodayISO();
    els.txFormError.textContent = '';
    dvAttachRibuanInput(els.txNominal);
  }

  function openAddModal(presetTipe) {
    state.editingId = null;
    els.txModalTitle.textContent = dvT('tx.modal_title_tambah');
    els.txSegmented.querySelectorAll('button').forEach(b => b.disabled = false);
    resetForm();
    switchModalTipe(presetTipe || 'masuk');
    els.txModal.classList.add('open');
  }

  function openEditModal(id) {
    const t = dvGetTransaksi().find(x => x.id === id);
    if (!t) return;
    state.editingId = id;
    els.txModalTitle.textContent = dvT('tx.modal_title_edit');
    resetForm();
    switchModalTipe(t.tipe);
    // Kunci jenis transaksi saat edit — hanya field yang bisa diubah
    els.txSegmented.querySelectorAll('button').forEach(b => b.disabled = b.getAttribute('data-tipe') !== t.tipe);

    els.txTanggal.value = t.tanggal;
    els.txNominal.value = dvFormatRibuan(t.jumlah);
    els.txCatatan.value = t.catatan || '';

    if (t.tipe === 'transfer') {
      els.txAkun.value = t.akunAsal;
      els.txAkunTujuan.value = t.akunTujuan;
    } else {
      els.txKategori.value = t.kategori;
      els.txAkun.value = t.akun;
      els.txMetode2.value = t.metode || 'Cash';
    }

    els.txModal.classList.add('open');
  }

  function closeTxModal() { els.txModal.classList.remove('open'); state.editingId = null; }
  els.btnTambahTx?.addEventListener('click', () => openAddModal('masuk'));
  els.btnEmptyAdd?.addEventListener('click', () => openAddModal('masuk'));
  els.txModalClose?.addEventListener('click', closeTxModal);
  els.txModalCancel?.addEventListener('click', closeTxModal);
  els.txModal?.addEventListener('click', (e) => { if (e.target === els.txModal) closeTxModal(); });

  els.txForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const tipe = state.modalTipe;
    const nominal = dvParseRibuan(els.txNominal.value);
    els.txFormError.textContent = '';

    if (!nominal || nominal <= 0) { els.txFormError.textContent = dvT('tx.err_nominal'); return; }

    let asal, tujuan;
    if (tipe === 'transfer') {
      asal = els.txAkun.value; tujuan = els.txAkunTujuan.value;
      if (asal === tujuan) { els.txFormError.textContent = dvT('tx.err_akun_sama'); return; }
    }

    dvShowConfirm(dvT(state.editingId ? 'tx.confirm_simpan_edit' : 'tx.confirm_simpan_tambah'), () => {
      if (tipe === 'transfer') {
        if (state.editingId) {
          dvUpdateTransaksi(state.editingId, {
            tanggal: els.txTanggal.value || dvTodayISO(),
            akunAsal: asal, akunTujuan: tujuan, akun: asal,
            jumlah: nominal,
            catatan: els.txCatatan.value,
            deskripsi: els.txCatatan.value || `Transfer ${akunNama(asal)} → ${akunNama(tujuan)}`
          });
        } else {
          dvAddTransfer({ tanggal: els.txTanggal.value || dvTodayISO(), akunAsal: asal, akunTujuan: tujuan, jumlah: nominal, catatan: els.txCatatan.value });
        }
      } else {
        const payload = {
          tanggal: els.txTanggal.value || dvTodayISO(),
          kategori: els.txKategori.value,
          deskripsi: els.txCatatan.value || els.txKategori.value,
          catatan: els.txCatatan.value,
          akun: els.txAkun.value,
          metode: els.txMetode2.value,
          jumlah: nominal,
          tipe
        };
        if (state.editingId) dvUpdateTransaksi(state.editingId, payload);
        else dvAddTransaksi(payload);
      }

      const wasEditing = !!state.editingId;
      closeTxModal();
      dvShowGenericToast(dvT(wasEditing ? 'tx.toast_diperbarui' : 'tx.toast_tersimpan'));
    });
  });

  // ---------- Toolbar events ----------
  els.fSearch?.addEventListener('input', () => { state.search = els.fSearch.value; renderTable(); });
  els.fJenis?.addEventListener('change', () => { state.jenis = els.fJenis.value; fillKategoriFilter(); state.kategori = ''; renderTable(); });
  els.fKategori?.addEventListener('change', () => { state.kategori = els.fKategori.value; renderTable(); });
  els.fAkun?.addEventListener('change', () => { state.akun = els.fAkun.value; renderTable(); });
  els.fBulan?.addEventListener('change', () => {
    state.bulan = els.fBulan.value;
    if (state.bulan) {
      state.dariTanggal = ''; state.sampaiTanggal = '';
      els.fDariTanggal.value = ''; els.fSampaiTanggal.value = '';
      updateDateRangeLabel();
    }
    renderTable();
  });

  function updateDateRangeLabel() {
    const labelEl = document.getElementById('dateRangeLabel');
    if (!labelEl) return;
    if (state.dariTanggal || state.sampaiTanggal) {
      labelEl.textContent = `${state.dariTanggal || '…'} — ${state.sampaiTanggal || '…'}`;
    } else {
      labelEl.textContent = dvT('tx.rentang_tanggal');
    }
  }

  (function setupDateRangeDropdown() {
    const btn = document.getElementById('dateRangeBtn');
    const menu = document.getElementById('dateRangeMenu');
    const applyBtn = document.getElementById('dateRangeApply');
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains('open');
      document.querySelectorAll('.pill-dropdown.open').forEach(m => m.classList.remove('open'));
      if (willOpen) menu.classList.add('open');
    });
    menu.addEventListener('click', (e) => e.stopPropagation());

    applyBtn?.addEventListener('click', () => {
      state.dariTanggal = els.fDariTanggal.value;
      state.sampaiTanggal = els.fSampaiTanggal.value;
      if (state.dariTanggal || state.sampaiTanggal) { state.bulan = ''; els.fBulan.value = ''; }
      updateDateRangeLabel();
      menu.classList.remove('open');
      renderTable();
    });

    document.addEventListener('click', () => menu.classList.remove('open'));
  })();
  els.fSort?.addEventListener('change', () => { state.sort = els.fSort.value; renderTable(); });
  els.btnReset?.addEventListener('click', () => {
    state.search = ''; state.jenis = ''; state.kategori = ''; state.akun = ''; state.bulan = ''; state.dariTanggal = ''; state.sampaiTanggal = ''; state.sort = 'terbaru';
    els.fSearch.value = ''; els.fJenis.value = ''; els.fAkun.value = ''; els.fBulan.value = ''; els.fDariTanggal.value = ''; els.fSampaiTanggal.value = ''; els.fSort.value = 'terbaru';
    updateDateRangeLabel();
    fillKategoriFilter();
    renderTable();
  });

  // ---------- Init ----------
  initStaticUI();
  showSkeleton();
  setTimeout(() => { renderTable(); }, 350);
  dvOnChange(renderTable);
})();