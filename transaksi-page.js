// ============================================================
// DVpoint — Logika halaman Pemasukan & Pengeluaran
// Kedua halaman memakai layout & script yang sama; hanya berbeda
// `tipe` ('masuk' atau 'keluar') sehingga warna aksen, kategori,
// dan judul menyesuaikan otomatis.
// ============================================================

function dvInitTransaksiPage(tipe) {
  const isMasuk = tipe === 'masuk';
  const kategoriList = DV_KATEGORI[tipe];
  const accent = isMasuk ? '#2dd9a8' : '#ef4d8f';

  const els = {
    statHariIni: document.getElementById('statHariIni'),
    statBulanIni: document.getElementById('statBulanIni'),
    statJumlah: document.getElementById('statJumlah'),
    tableBody: document.getElementById('transaksiTableBody'),
    tableEmpty: document.getElementById('tableEmptyState'),
    tambahBtn: document.getElementById('btnTambah'),
    overlay: document.getElementById('modalOverlay'),
    closeBtn: document.getElementById('modalClose'),
    cancelBtn: document.getElementById('modalCancel'),
    form: document.getElementById('formTransaksi'),
    inpTanggal: document.getElementById('inpTanggal'),
    inpKategori: document.getElementById('inpKategori'),
    inpNominal: document.getElementById('inpNominal'),
    inpAkun: document.getElementById('inpAkun'),
    inpCatatan: document.getElementById('inpCatatan')
  };

  // Isi opsi kategori & akun
  if (els.inpKategori) {
    els.inpKategori.innerHTML = kategoriList.map(k => `<option value="${k}">${k}</option>`).join('');
  }
  if (els.inpAkun) {
    els.inpAkun.innerHTML = DV_AKUN.map(a => `<option value="${a.id}">${a.nama}</option>`).join('');
  }
  if (els.inpTanggal) els.inpTanggal.value = dvTodayISO();

  function render() {
    const list = dvGetTransaksi();
    const ring = dvGetRingkasanTipe(tipe, list);

    if (els.statHariIni) els.statHariIni.textContent = dvFormatRupiah(ring.totalHariIni);
    if (els.statBulanIni) els.statBulanIni.textContent = dvFormatRupiah(ring.totalBulanIni);
    if (els.statJumlah) els.statJumlah.textContent = ring.jumlahTransaksi;

    if (!ring.list.length) {
      if (els.tableEmpty) els.tableEmpty.style.display = 'block';
      if (els.tableBody) els.tableBody.innerHTML = '';
      return;
    }
    if (els.tableEmpty) els.tableEmpty.style.display = 'none';

    if (els.tableBody) {
      els.tableBody.innerHTML = ring.list.map(t => {
        const akun = DV_AKUN.find(a => a.id === t.akun);
        const warnaKat = DV_KATEGORI_WARNA[t.kategori] || '#8a86a8';
        return `
          <tr>
            <td class="desc-cell">${dvFormatTanggal(t.tanggal)}</td>
            <td>
              <div class="cat-cell">
                <span class="cat-badge" style="background:${warnaKat}22; color:${warnaKat};">${t.kategori}</span>
              </div>
            </td>
            <td class="desc-cell">${t.deskripsi || '-'}</td>
            <td><span class="acc-tag">${akun ? akun.nama : t.akun}</span></td>
            <td class="amount ${isMasuk ? 'pos' : 'neg'}">${isMasuk ? '+' : '-'} ${dvFormatRupiah(t.jumlah)}</td>
            <td style="text-align:right;">
              <button class="row-action" data-id="${t.id}" title="${dvT('common.hapus')}">
                <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"></path></svg>
              </button>
            </td>
          </tr>`;
      }).join('');

      els.tableBody.querySelectorAll('.row-action').forEach(btn => {
        btn.addEventListener('click', () => {
          const confirmKey = isMasuk ? 'pm.confirm_hapus' : 'pk.confirm_hapus';
          const id = btn.getAttribute('data-id');
          dvShowConfirm(dvT(confirmKey), () => {
            dvDeleteTransaksi(id);
            dvShowGenericToast(dvT(isMasuk ? 'pm.toast_dihapus' : 'pk.toast_dihapus'));
          }, { danger: true });
        });
      });
    }
  }

  function openModal() {
    if (els.inpTanggal) els.inpTanggal.value = dvTodayISO();
    if (els.inpNominal) dvAttachRibuanInput(els.inpNominal);
    els.overlay?.classList.add('open');
  }
  function closeModal() {
    els.overlay?.classList.remove('open');
    els.form?.reset();
    if (els.inpTanggal) els.inpTanggal.value = dvTodayISO();
  }

  els.tambahBtn?.addEventListener('click', openModal);
  els.closeBtn?.addEventListener('click', closeModal);
  els.cancelBtn?.addEventListener('click', closeModal);
  els.overlay?.addEventListener('click', (e) => { if (e.target === els.overlay) closeModal(); });

  els.form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nominal = dvParseRibuan(els.inpNominal.value);
    if (!nominal || nominal <= 0) { els.inpNominal.focus(); return; }

    const confirmKey = isMasuk ? 'pm.confirm_simpan' : 'pk.confirm_simpan';
    dvShowConfirm(dvT(confirmKey), () => {
      dvAddTransaksi({
        tanggal: els.inpTanggal.value || dvTodayISO(),
        kategori: els.inpKategori.value,
        deskripsi: els.inpCatatan.value ? els.inpCatatan.value : els.inpKategori.value,
        catatan: els.inpCatatan.value,
        akun: els.inpAkun.value,
        jumlah: nominal,
        tipe
      });

      closeModal();
      dvShowGenericToast(dvT(isMasuk ? 'pm.toast_tersimpan' : 'pk.toast_tersimpan'));
    });
  });

  render();
  dvOnChange(render);
}