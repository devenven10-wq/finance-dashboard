// ============================================================
// DVpoint — Logika halaman Transfer Antar Akun
// Menyimpan transfer lewat dvAddTransfer() (storage.js) sehingga
// otomatis tersinkron ke Dashboard & Semua Transaksi secara real-time.
// ============================================================

function dvInitTransferPage() {
  const els = {
    btnBaru: document.getElementById('btnTransferBaru'),
    overlay: document.getElementById('transferModal'),
    closeBtn: document.getElementById('modalCloseBtn'),
    stepForm: document.getElementById('stepForm'),
    stepPreview: document.getElementById('stepPreview'),
    fDate: document.getElementById('fDate'),
    fFrom: document.getElementById('fFrom'),
    fTo: document.getElementById('fTo'),
    fAmount: document.getElementById('fAmount'),
    fNote: document.getElementById('fNote'),
    fromBalanceHint: document.getElementById('fromBalanceHint'),
    formError: document.getElementById('formError'),
    btnCancelForm: document.getElementById('btnCancelForm'),
    btnPreview: document.getElementById('btnPreview'),
    btnBackForm: document.getElementById('btnBackForm'),
    btnConfirmTransfer: document.getElementById('btnConfirmTransfer'),
    pvFromName: document.getElementById('pvFromName'),
    pvToName: document.getElementById('pvToName'),
    pvFromName2: document.getElementById('pvFromName2'),
    pvToName2: document.getElementById('pvToName2'),
    pvAmount: document.getElementById('pvAmount'),
    pvFromAfter: document.getElementById('pvFromAfter'),
    pvToAfter: document.getElementById('pvToAfter'),
    pvNote: document.getElementById('pvNote'),
    tableWrap: document.getElementById('transferTableWrap')
  };

  const sparkCharts = {};

  function accBalance(id) {
    const list = dvGetAkunList();
    const acc = list.find(a => a.id === id);
    return acc ? acc.saldo : 0;
  }

  function fillAkunSelects() {
    const opts = DV_AKUN.map(a => `<option value="${a.id}">${a.nama}</option>`).join('');
    if (els.fFrom) els.fFrom.innerHTML = opts;
    if (els.fTo) els.fTo.innerHTML = opts;
    if (els.fTo && DV_AKUN.length > 1) els.fTo.selectedIndex = 1;
  }

  function parseAmount(str) {
    return Number(String(str || '').replace(/[^0-9]/g, '')) || 0;
  }

  function updateBalanceHint() {
    if (!els.fFrom || !els.fromBalanceHint) return;
    const bal = accBalance(els.fFrom.value);
    els.fromBalanceHint.textContent = dvT('transfer.saldo_tersedia', { saldo: dvFormatRupiah(bal) });
  }

  function openModal() {
    if (els.fDate) els.fDate.value = dvTodayISO();
    fillAkunSelects();
    updateBalanceHint();
    if (els.fAmount) els.fAmount.value = '';
    if (els.fNote) els.fNote.value = '';
    if (els.formError) els.formError.textContent = '';
    if (els.stepForm) els.stepForm.style.display = 'block';
    if (els.stepPreview) els.stepPreview.style.display = 'none';
    els.overlay?.classList.add('open');
  }
  function closeModal() {
    els.overlay?.classList.remove('open');
  }

  function goPreview() {
    const from = els.fFrom.value, to = els.fTo.value;
    const amount = parseAmount(els.fAmount.value);
    els.formError.textContent = '';

    if (from === to) { els.formError.textContent = dvT('transfer.err_akun_sama'); return; }
    if (!amount || amount <= 0) { els.formError.textContent = dvT('transfer.err_nominal_invalid'); return; }
    const bal = accBalance(from);
    if (amount > bal) { els.formError.textContent = dvT('transfer.err_saldo_kurang', { akun: DV_AKUN.find(a=>a.id===from)?.nama || from }); return; }

    const fromAcc = DV_AKUN.find(a => a.id === from);
    const toAcc = DV_AKUN.find(a => a.id === to);
    els.pvFromName.textContent = fromAcc ? fromAcc.nama : from;
    els.pvToName.textContent = toAcc ? toAcc.nama : to;
    els.pvFromName2.textContent = fromAcc ? fromAcc.nama : from;
    els.pvToName2.textContent = toAcc ? toAcc.nama : to;
    els.pvAmount.textContent = dvFormatRupiah(amount);
    els.pvFromAfter.textContent = dvFormatRupiah(bal - amount);
    els.pvToAfter.textContent = dvFormatRupiah(accBalance(to) + amount);
    els.pvNote.textContent = els.fNote.value || '—';

    els.stepForm.style.display = 'none';
    els.stepPreview.style.display = 'block';
  }

  async function confirmTransfer() {
    try {
      await dvAddTransfer({
        tanggal: els.fDate.value || dvTodayISO(),
        akunAsal: els.fFrom.value,
        akunTujuan: els.fTo.value,
        jumlah: parseAmount(els.fAmount.value),
        catatan: els.fNote.value
      });
      closeModal();
      dvShowGenericToast(dvT('trf.toast_tersimpan'));
    } catch (err) {
      dvShowGenericToast(err.message || 'Gagal menyimpan transfer.', true);
    }
  }

  els.btnBaru?.addEventListener('click', openModal);
  els.closeBtn?.addEventListener('click', closeModal);
  els.btnCancelForm?.addEventListener('click', closeModal);
  els.overlay?.addEventListener('click', (e) => { if (e.target === els.overlay) closeModal(); });
  els.btnPreview?.addEventListener('click', goPreview);
  els.btnBackForm?.addEventListener('click', () => {
    els.stepPreview.style.display = 'none';
    els.stepForm.style.display = 'block';
  });
  els.btnConfirmTransfer?.addEventListener('click', confirmTransfer);
  els.fFrom?.addEventListener('change', updateBalanceHint);
  els.fAmount?.addEventListener('input', () => {
    const n = parseAmount(els.fAmount.value);
    els.fAmount.value = n ? n.toLocaleString('id-ID') : '';
  });

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

  function render() {
    const list = dvGetTransaksi().filter(t => t.tipe === 'transfer');
    const monthly = dvGetMonthlyStats();
    const thisMonth = monthly[monthly.length - 1];
    const lastMonth = monthly[monthly.length - 2] || { transferCount: 0, transfer: 0 };
    const todayISO = dvTodayISO();
    const countToday = list.filter(t => t.tanggal === todayISO).length;

    const pctCount = lastMonth.transferCount ? Math.round(((thisMonth.transferCount - lastMonth.transferCount) / lastMonth.transferCount) * 1000) / 10 : (thisMonth.transferCount ? 100 : 0);
    const pctAmount = lastMonth.transfer ? Math.round(((thisMonth.transfer - lastMonth.transfer) / lastMonth.transfer) * 1000) / 10 : (thisMonth.transfer ? 100 : 0);

    document.getElementById('statCountMonth').textContent = thisMonth.transferCount;
    document.getElementById('statCountMonthSub').innerHTML = thisMonth.transferCount
      ? `<span class="kpi-change ${pctCount >= 0 ? 'up' : 'down'}">${pctCount >= 0 ? '↗' : '↘'} ${Math.abs(pctCount)}%</span> ${dvT('transfer.dari_bulan_lalu')}`
      : dvT('transfer.belum_ada_transfer');

    document.getElementById('statTotalAmount').textContent = dvFormatRupiah(thisMonth.transfer);
    document.getElementById('statTotalAmountSub').innerHTML = thisMonth.transfer
      ? `<span class="kpi-change ${pctAmount >= 0 ? 'up' : 'down'}">${pctAmount >= 0 ? '↗' : '↘'} ${Math.abs(pctAmount)}%</span> ${dvT('transfer.dari_bulan_lalu')}`
      : dvT('transfer.belum_ada_data');

    document.getElementById('statCountToday').textContent = countToday;
    document.getElementById('statCountTodaySub').textContent = countToday ? dvT('transfer.tercatat_hari_ini') : dvT('transfer.belum_ada_hari_ini');

    const usage = {};
    list.forEach(t => { usage[t.akunAsal] = (usage[t.akunAsal] || 0) + 1; usage[t.akunTujuan] = (usage[t.akunTujuan] || 0) + 1; });
    const topId = Object.keys(usage).sort((a, b) => usage[b] - usage[a])[0];
    const topAcc = DV_AKUN.find(a => a.id === topId);
    document.getElementById('statTopAccount').textContent = topAcc ? topAcc.nama : '—';
    document.getElementById('statTopAccountSub').textContent = topAcc ? dvT('transfer.x_digunakan', { n: usage[topId] }) : dvT('transfer.belum_ada_data');

    renderSpark('sparkCountMonth', monthly.map(b => b.transferCount), '#4f7dff');
    renderSpark('sparkTotalAmount', monthly.map(b => b.transfer), '#2dd9a8');
    renderSpark('sparkCountToday', monthly.map(b => b.transferCount), '#ef4d8f');

    if (!list.length) {
      els.tableWrap.innerHTML = `<div class="empty-state"><h4>${dvT('transfer.empty_title')}</h4><p>${dvT('transfer.empty_desc')}</p></div>`;
      return;
    }

    els.tableWrap.innerHTML = `
      <table>
        <thead><tr><th>${dvT('transfer.th_tanggal')}</th><th>${dvT('transfer.th_dari')}</th><th>${dvT('transfer.th_ke')}</th><th>${dvT('transfer.th_catatan')}</th><th>${dvT('transfer.th_nominal')}</th><th></th></tr></thead>
        <tbody>
          ${list.map(t => {
            const from = DV_AKUN.find(a => a.id === t.akunAsal);
            const to = DV_AKUN.find(a => a.id === t.akunTujuan);
            return `<tr>
              <td class="desc-cell">${dvFormatTanggal(t.tanggal)}</td>
              <td><span class="acc-tag">${from ? from.nama : t.akunAsal}</span></td>
              <td><span class="acc-tag">${to ? to.nama : t.akunTujuan}</span></td>
              <td class="desc-cell">${t.catatan || '-'}</td>
              <td class="amount" style="color:var(--blue);">${dvFormatRupiah(t.jumlah)}</td>
              <td style="text-align:right;">
                <button class="row-action" data-id="${t.id}" title="${dvT('common.hapus')}">
                  <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"></path></svg>
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;

    els.tableWrap.querySelectorAll('.row-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        dvShowConfirm(dvT('trf.confirm_hapus'), async () => {
          await dvDeleteTransaksi(id);
          dvShowGenericToast(dvT('trf.toast_dihapus'));
        }, { danger: true });
      });
    });
  }

  dvBootstrapPage(() => {
    render();
    dvOnChange(render);
  });
}

dvInitTransferPage();