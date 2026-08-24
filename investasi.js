// ============================================================
// DVpoint — Halaman Investasi (investasi.js)
// ============================================================
// Modul MANDIRI: seluruh data investasi disimpan & dibaca lewat
// storage.js (dvGetInvestasiAll, dvAddInvestasi, dvUpdateInvestasi,
// dvUpdateInvestasiNilai, dvSetInvestasiArsip, dvDeleteInvestasi,
// dvGetInvestasiSummary). Halaman ini TIDAK membaca data transaksi,
// akun, anggaran, atau tujuan keuangan — dan tidak menuliskannya juga.
// ============================================================

(function () {
  let currentFilter = 'semua';
  let activeDrawerId = null;
  let selectedJenis = 'Saham';
  let editingId = null; // null = mode tambah, else mode edit

  // ---------- Icon set (gaya Lucide, stroke-based, konsisten dgn app) ----------
  const IV_ICON_SVG = {
    'trending-up': '<path d="M3 17l5-5 3 3 7-7M13 8h5v5"></path>',
    'pie-chart': '<path d="M21.21 15.89A10 10 0 118 2.83"></path><path d="M22 12A10 10 0 0012 2v10z"></path>',
    'file-text': '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"></path>',
    'bitcoin': '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 8h3.6a1.9 1.9 0 010 3.8H9.5m0 0h4.1a1.9 1.9 0 010 3.8H9.5M9.5 8v7.6M11 6.5V8m0 7.6v1.9"></path>',
    'gem': '<path d="M6 3h12l4 6-10 12L2 9z"></path><path d="M2 9h20M9 3l3 6-3 12M15 3l-3 6 3 12"></path>',
    'home': '<path d="M3 10.5L12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path>',
    'landmark': '<path d="M3 21h18M4 10h16M4 10l8-6 8 6M6 10v9M10 10v9M14 10v9M18 10v9"></path>',
    'briefcase': '<rect height="13" rx="2" width="20" x="2" y="7"></rect><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"></path>',
    'plus': '<path d="M12 5v14M5 12h14"></path>',
    'edit': '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"></path>',
    'archive': '<rect height="5" rx="1" width="20" x="2" y="4"></rect><path d="M4 9v9a2 2 0 002 2h12a2 2 0 002-2V9M10 13h4"></path>',
    'trash': '<path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13"></path>',
    'arrow-up-right': '<path d="M7 17L17 7M8 7h9v9"></path>',
    'arrow-down-right': '<path d="M7 7l10 10M17 8v9H8"></path>',
    'minus': '<path d="M5 12h14"></path>'
  };

  function ivSvg(iconName, size) {
    size = size || 18;
    const paths = IV_ICON_SVG[iconName] || IV_ICON_SVG['briefcase'];
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  function ivIconFor(jenis) {
    return DV_INVEST_ICON[jenis] || 'briefcase';
  }
  function ivWarnaFor(jenis) {
    return DV_INVEST_WARNA[jenis] || '#8a86a8';
  }

  function ivBadgeClass(status) {
    if (status === 'Aktif') return 'iv-badge-aktif';
    if (status === 'Dijual') return 'iv-badge-dijual';
    if (status === 'Ditutup') return 'iv-badge-ditutup';
    return 'iv-badge-arsip';
  }

  function ivPct(modalAwal, nilaiSaatIni) {
    if (!modalAwal) return nilaiSaatIni > 0 ? 100 : 0;
    return ((nilaiSaatIni - modalAwal) / modalAwal) * 100;
  }

  // ---------- Toast ----------
  // Toast: pakai dvShowGenericToast() standar (storage.js) — pojok
  // kanan atas, konsisten dengan halaman lain.

  // ---------- Confirm dialog ----------
  let confirmCallback = null;
  function ivConfirm(title, text, onOk) {
    document.getElementById('ivConfirmTitle').textContent = title;
    document.getElementById('ivConfirmText').textContent = text;
    confirmCallback = onOk;
    document.getElementById('ivConfirmOverlay').classList.add('open');
  }
  document.getElementById('ivConfirmCancel').addEventListener('click', () => {
    document.getElementById('ivConfirmOverlay').classList.remove('open');
    confirmCallback = null;
  });
  document.getElementById('ivConfirmOk').addEventListener('click', () => {
    document.getElementById('ivConfirmOverlay').classList.remove('open');
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });

  // ============================================================
  // Ringkasan / KPI
  // ============================================================
  function renderSummary() {
    const s = dvGetInvestasiSummary();
    document.getElementById('sumTotalInvestasi').textContent = dvFormatRupiah(s.totalModal);
    document.getElementById('sumTotalInvestasiSub').textContent = s.jumlahAset ? dvT('iv.dari_n_aset', {n: s.jumlahAset}) : dvT('iv.belum_ada_data');

    document.getElementById('sumNilaiPortofolio').textContent = dvFormatRupiah(s.totalNilai);
    const selisihTotal = s.totalNilai - s.totalModal;
    document.getElementById('sumNilaiPortofolioSub').textContent = s.jumlahAset
      ? (selisihTotal >= 0 ? `+${dvFormatRupiah(selisihTotal)} dari modal` : `${dvFormatRupiah(selisihTotal)} dari modal`)
      : dvT('iv.belum_ada_data');

    document.getElementById('sumJumlahAset').textContent = s.jumlahAset;
    document.getElementById('sumJumlahAsetSub').textContent = s.jumlahAset ? dvT('iv.aset_tercatat') : dvT('iv.belum_ada_aset');

    document.getElementById('sumInvestasiAktif').textContent = s.investasiAktif;
    document.getElementById('sumInvestasiAktifSub').textContent = s.investasiAktif ? dvT('iv.sedang_berjalan') : dvT('iv.belum_ada_aktif');
  }

  // ============================================================
  // Grid daftar investasi
  // ============================================================
  function getFilteredList() {
    const all = dvGetInvestasiAll();
    if (currentFilter === 'semua') return all.filter(i => !i.arsip);
    if (currentFilter === 'arsip') return all.filter(i => i.arsip);
    return all.filter(i => i.jenis === currentFilter && !i.arsip);
  }

  function renderGrid() {
    const grid = document.getElementById('ivGrid');
    const list = getFilteredList();

    if (!list.length) {
      grid.innerHTML = `
        <div class="iv-empty">
          <div class="iv-empty-illus">${ivSvg('trending-up', 34)}</div>
          <h4>${dvT('iv.empty_title')}</h4>
          <p>${dvT('iv.empty_desc')}</p>
          <button class="btn-primary" id="ivEmptyAddBtn">${ivSvg('plus', 16)} ${dvT('iv.tambah_investasi')}</button>
        </div>`;
      const btn = document.getElementById('ivEmptyAddBtn');
      if (btn) btn.addEventListener('click', openAddModal);
      return;
    }

    grid.innerHTML = list.map(inv => {
      const warna = ivWarnaFor(inv.jenis);
      const pct = ivPct(inv.modalAwal, inv.nilaiSaatIni);
      const perfClass = pct > 0.01 ? 'up' : (pct < -0.01 ? 'down' : 'flat');
      const perfIcon = pct > 0.01 ? 'arrow-up-right' : (pct < -0.01 ? 'arrow-down-right' : 'minus');
      return `
      <div class="iv-card" data-id="${inv.id}" style="--tint:${warna};">
        <div class="iv-card-top">
          <div class="iv-card-id">
            <div class="iv-icon" style="background:${warna}26; color:${warna};">${ivSvg(ivIconFor(inv.jenis), 19)}</div>
            <div style="min-width:0;">
              <div class="iv-card-nama">${escapeHtml(inv.nama)}</div>
              <div class="iv-card-jenis">${escapeHtml(inv.jenis)}</div>
            </div>
          </div>
          <div class="iv-badge ${ivBadgeClass(inv.arsip ? 'Arsip' : inv.status)}">${inv.arsip ? 'Arsip' : inv.status}</div>
        </div>
        <div class="iv-card-rows">
          <div class="iv-card-row"><span>Modal Awal</span><strong>${dvFormatRupiah(inv.modalAwal)}</strong></div>
          <div class="iv-card-row"><span>Nilai Saat Ini</span><strong>${dvFormatRupiah(inv.nilaiSaatIni)}</strong></div>
        </div>
        <div class="iv-card-perf ${perfClass}">
          ${ivSvg(perfIcon, 13)}
          <span>${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% dari modal awal</span>
        </div>
        <div class="iv-card-actions">
          <button class="iv-btn-update" data-action="update" data-id="${inv.id}">${ivSvg('trending-up', 14)} Update Nilai</button>
        </div>
      </div>`;
    }).join('');

    // Klik kartu -> buka drawer (kecuali klik tombol update)
    grid.querySelectorAll('.iv-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="update"]')) return;
        openDrawer(card.dataset.id);
      });
    });
    grid.querySelectorAll('[data-action="update"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openUpdateNilaiModal(btn.dataset.id);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // ============================================================
  // Filter chips
  // ============================================================
  document.getElementById('ivFilters').addEventListener('click', (e) => {
    const chip = e.target.closest('.iv-filter-chip');
    if (!chip) return;
    document.querySelectorAll('.iv-filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    renderGrid();
  });

  // ============================================================
  // Modal: Tambah / Edit Investasi
  // ============================================================
  function renderJenisGrid() {
    const wrap = document.getElementById('ivJenisGrid');
    wrap.innerHTML = DV_INVEST_JENIS.map(j => `
      <div class="iv-jenis-opt ${j === selectedJenis ? 'selected' : ''}" data-jenis="${j}">
        ${ivSvg(ivIconFor(j), 18)}
        <span>${j}</span>
      </div>`).join('');
    wrap.querySelectorAll('.iv-jenis-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        selectedJenis = opt.dataset.jenis;
        wrap.querySelectorAll('.iv-jenis-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
  }

  function openAddModal() {
    editingId = null;
    selectedJenis = 'Saham';
    document.getElementById('ivModalTitle').textContent = dvT('iv.modal_title_tambah');
    document.getElementById('ivModalSubmit').textContent = dvT('iv.modal_submit_tambah');
    document.getElementById('formInvestasi').reset();
    document.getElementById('ivInpTanggal').value = dvTodayISO();
    document.getElementById('ivInpStatus').value = 'Aktif';
    document.getElementById('ivModalError').textContent = '';
    dvAttachRibuanInput(document.getElementById('ivInpModal'));
    dvAttachRibuanInput(document.getElementById('ivInpNilai'));
    renderJenisGrid();
    document.getElementById('ivModalOverlay').classList.add('open');
  }

  function openEditModal(inv) {
    editingId = inv.id;
    selectedJenis = inv.jenis;
    document.getElementById('ivModalTitle').textContent = dvT('iv.modal_title_edit');
    document.getElementById('ivModalSubmit').textContent = dvT('iv.modal_submit_edit');
    document.getElementById('ivInpNama').value = inv.nama;
    document.getElementById('ivInpModal').value = dvFormatRibuan(inv.modalAwal);
    document.getElementById('ivInpNilai').value = dvFormatRibuan(inv.nilaiSaatIni);
    document.getElementById('ivInpTanggal').value = inv.tanggalInvestasi;
    document.getElementById('ivInpPlatform').value = inv.platform || '';
    document.getElementById('ivInpStatus').value = inv.status;
    document.getElementById('ivInpCatatan').value = inv.catatan || '';
    document.getElementById('ivModalError').textContent = '';
    dvAttachRibuanInput(document.getElementById('ivInpModal'));
    dvAttachRibuanInput(document.getElementById('ivInpNilai'));
    renderJenisGrid();
    document.getElementById('ivModalOverlay').classList.add('open');
  }

  function closeAddModal() {
    document.getElementById('ivModalOverlay').classList.remove('open');
  }

  document.getElementById('btnTambahInvestasi').addEventListener('click', openAddModal);
  document.getElementById('ivModalClose').addEventListener('click', closeAddModal);
  document.getElementById('ivModalCancel').addEventListener('click', closeAddModal);
  document.getElementById('ivModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('ivModalOverlay')) closeAddModal();
  });

  document.getElementById('formInvestasi').addEventListener('submit', (e) => {
    e.preventDefault();
    const nama = document.getElementById('ivInpNama').value.trim();
    const modalAwalRaw = document.getElementById('ivInpModal').value;
    const modalAwal = dvParseRibuan(modalAwalRaw);
    const nilaiInput = document.getElementById('ivInpNilai').value;
    const tanggal = document.getElementById('ivInpTanggal').value;
    const platform = document.getElementById('ivInpPlatform').value.trim();
    const status = document.getElementById('ivInpStatus').value;
    const catatan = document.getElementById('ivInpCatatan').value.trim();
    const errEl = document.getElementById('ivModalError');

    if (!nama) { errEl.textContent = dvT('iv.err_nama_wajib'); return; }
    if (modalAwalRaw.trim() === '' || !(modalAwal >= 0)) { errEl.textContent = dvT('iv.err_modal_invalid'); return; }
    if (!tanggal) { errEl.textContent = dvT('iv.err_tanggal_wajib'); return; }
    errEl.textContent = '';

    dvShowConfirm(dvT(editingId ? 'iv.confirm_simpan_edit' : 'iv.confirm_simpan_tambah'), async () => {
      const payload = {
        nama,
        jenis: selectedJenis,
        modalAwal,
        nilaiSaatIni: nilaiInput.trim() === '' ? modalAwal : dvParseRibuan(nilaiInput),
        tanggalInvestasi: tanggal,
        platform,
        status,
        catatan
      };

      try {
        if (editingId) {
          await dvUpdateInvestasi(editingId, payload);
          dvShowGenericToast(dvT('iv.toast_diperbarui'));
        } else {
          await dvAddInvestasi(payload);
          dvShowGenericToast(dvT('iv.toast_ditambahkan'));
        }
        closeAddModal();
        renderAll();
      } catch (err) {
        errEl.textContent = err.message || 'Gagal menyimpan investasi.';
      }
    });
  });

  // ============================================================
  // Modal: Update Nilai Investasi
  // ============================================================
  let updateNilaiTargetId = null;
  function openUpdateNilaiModal(id) {
    const inv = dvGetInvestasiAll().find(i => i.id === id);
    if (!inv) return;
    updateNilaiTargetId = id;
    document.getElementById('ivNilaiHint').textContent = `${inv.nama} — Nilai saat ini: ${dvFormatRupiah(inv.nilaiSaatIni)}`;
    document.getElementById('formUpdateNilai').reset();
    document.getElementById('ivInpNilaiBaru').value = dvFormatRibuan(inv.nilaiSaatIni);
    document.getElementById('ivInpTanggalUpdate').value = dvTodayISO();
    document.getElementById('ivNilaiModalError').textContent = '';
    dvAttachRibuanInput(document.getElementById('ivInpNilaiBaru'));
    document.getElementById('ivNilaiModalOverlay').classList.add('open');
  }
  function closeUpdateNilaiModal() {
    document.getElementById('ivNilaiModalOverlay').classList.remove('open');
    updateNilaiTargetId = null;
  }
  document.getElementById('ivNilaiModalClose').addEventListener('click', closeUpdateNilaiModal);
  document.getElementById('ivNilaiModalCancel').addEventListener('click', closeUpdateNilaiModal);
  document.getElementById('ivNilaiModalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('ivNilaiModalOverlay')) closeUpdateNilaiModal();
  });

  document.getElementById('formUpdateNilai').addEventListener('submit', (e) => {
    e.preventDefault();
    const nilaiRaw = document.getElementById('ivInpNilaiBaru').value;
    const nilai = dvParseRibuan(nilaiRaw);
    const tanggal = document.getElementById('ivInpTanggalUpdate').value;
    const catatan = document.getElementById('ivInpCatatanUpdate').value.trim();
    const errEl = document.getElementById('ivNilaiModalError');
    if (nilaiRaw.trim() === '') { errEl.textContent = dvT('iv.err_nilai_invalid'); return; }
    if (!tanggal) { errEl.textContent = dvT('iv.err_tanggal_update_wajib'); return; }
    if (!updateNilaiTargetId) return;
    dvShowConfirm(dvT('iv.confirm_update_nilai'), async () => {
      await dvUpdateInvestasiNilai(updateNilaiTargetId, { nilai, tanggal, catatan });
      dvShowGenericToast(dvT('iv.toast_nilai_diperbarui'));
      closeUpdateNilaiModal();
      renderAll();
      if (activeDrawerId === updateNilaiTargetId) openDrawer(activeDrawerId);
    });
  });

  // ============================================================
  // Drawer detail investasi
  // ============================================================
  function openDrawer(id) {
    const inv = dvGetInvestasiAll().find(i => i.id === id);
    if (!inv) return;
    activeDrawerId = id;
    const warna = ivWarnaFor(inv.jenis);

    document.getElementById('ivDrawerIcon').style.background = warna + '26';
    document.getElementById('ivDrawerIcon').style.color = warna;
    document.getElementById('ivDrawerIcon').innerHTML = ivSvg(ivIconFor(inv.jenis), 20);
    document.getElementById('ivDrawerNama').textContent = inv.nama;
    document.getElementById('ivDrawerJenis').textContent = inv.jenis;

    const pct = ivPct(inv.modalAwal, inv.nilaiSaatIni);
    const perfClass = pct > 0.01 ? 'up' : (pct < -0.01 ? 'down' : 'flat');
    const perfIcon = pct > 0.01 ? 'arrow-up-right' : (pct < -0.01 ? 'arrow-down-right' : 'minus');
    const pctEl = document.getElementById('ivDrawerPct');
    pctEl.className = 'iv-drawer-perf-pct ' + perfClass;
    pctEl.innerHTML = `${ivSvg(perfIcon, 15)} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;

    document.getElementById('ivDrawerModal').textContent = dvFormatRupiah(inv.modalAwal);
    document.getElementById('ivDrawerNilai').textContent = dvFormatRupiah(inv.nilaiSaatIni);
    const selisih = inv.nilaiSaatIni - inv.modalAwal;
    const selisihEl = document.getElementById('ivDrawerSelisih');
    selisihEl.textContent = (selisih >= 0 ? '+' : '') + dvFormatRupiah(selisih);
    selisihEl.style.color = selisih > 0 ? 'var(--teal)' : (selisih < 0 ? 'var(--pink)' : 'var(--text)');
    document.getElementById('ivDrawerStatus').textContent = inv.arsip ? 'Arsip' : inv.status;

    document.getElementById('ivDrawerTanggal').textContent = dvFormatTanggal(inv.tanggalInvestasi);
    document.getElementById('ivDrawerPlatform').textContent = inv.platform || '—';

    const noteWrap = document.getElementById('ivDrawerNoteWrap');
    if (inv.catatan) {
      noteWrap.style.display = '';
      document.getElementById('ivDrawerCatatan').textContent = inv.catatan;
    } else {
      noteWrap.style.display = 'none';
    }

    const histList = document.getElementById('ivDrawerHistoryList');
    const riwayat = Array.isArray(inv.riwayat) ? inv.riwayat : [];
    if (!riwayat.length) {
      histList.innerHTML = '<div class="iv-history-empty">Belum ada riwayat perubahan nilai.</div>';
    } else {
      histList.innerHTML = riwayat.map(r => `
        <div class="iv-history-item">
          <div class="iv-history-left">
            <div class="iv-history-nilai">${dvFormatRupiah(r.nilai)}</div>
            ${r.catatan ? `<div class="iv-history-note">${escapeHtml(r.catatan)}</div>` : ''}
          </div>
          <div class="iv-history-tgl">${dvFormatTanggal(r.tanggal)}</div>
        </div>`).join('');
    }

    document.getElementById('ivDrawerBtnArsip').textContent = inv.arsip ? 'Batalkan Arsip' : 'Arsipkan';

    document.getElementById('ivDrawerOverlay').classList.add('open');
    document.getElementById('ivDrawer').classList.add('open');
  }

  function closeDrawer() {
    document.getElementById('ivDrawerOverlay').classList.remove('open');
    document.getElementById('ivDrawer').classList.remove('open');
    activeDrawerId = null;
  }
  document.getElementById('ivDrawerClose').addEventListener('click', closeDrawer);
  document.getElementById('ivDrawerOverlay').addEventListener('click', closeDrawer);

  document.getElementById('ivDrawerBtnUpdate').addEventListener('click', () => {
    if (activeDrawerId) openUpdateNilaiModal(activeDrawerId);
  });
  document.getElementById('ivDrawerBtnEdit').addEventListener('click', () => {
    const inv = dvGetInvestasiAll().find(i => i.id === activeDrawerId);
    if (inv) { closeDrawer(); openEditModal(inv); }
  });
  document.getElementById('ivDrawerBtnArsip').addEventListener('click', () => {
    const inv = dvGetInvestasiAll().find(i => i.id === activeDrawerId);
    if (!inv) return;
    const willArsip = !inv.arsip;
    ivConfirm(
      willArsip ? 'Arsipkan Investasi' : 'Batalkan Arsip',
      willArsip ? `Investasi "${inv.nama}" akan dipindahkan ke Diarsipkan.` : `Investasi "${inv.nama}" akan dikembalikan ke daftar aktif.`,
      async () => {
        await dvSetInvestasiArsip(inv.id, willArsip);
        dvShowGenericToast(willArsip ? 'Investasi diarsipkan.' : 'Investasi dikembalikan dari arsip.');
        closeDrawer();
        renderAll();
      }
    );
  });
  document.getElementById('ivDrawerBtnHapus').addEventListener('click', () => {
    const inv = dvGetInvestasiAll().find(i => i.id === activeDrawerId);
    if (!inv) return;
    ivConfirm(dvT('iv.confirm_hapus_title'), dvT('iv.confirm_hapus_desc', {nama: inv.nama}), async () => {
      await dvDeleteInvestasi(inv.id);
      dvShowGenericToast(dvT('iv.toast_dihapus'));
      closeDrawer();
      renderAll();
    });
  });

  // ============================================================
  // Render utama
  // ============================================================
  function renderAll() {
    renderSummary();
    renderGrid();
  }

  dvBootstrapPage(() => {
    renderAll();
    dvOnChange(renderAll);
  });
})();