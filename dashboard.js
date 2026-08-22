// ============================================================
// DVpoint — Dashboard (dashboard.js)
// ============================================================
// Dashboard bersifat READ-ONLY: seluruh angka, grafik, dan daftar di
// halaman ini dihitung langsung dari storage.js (single source of
// truth yang sama dipakai Semua Transaksi, Pemasukan, Pengeluaran,
// Transfer, Akun & Kartu, dan Tujuan Keuangan). Setiap kali data
// berubah di halaman manapun, dvOnChange() memicu render() ulang di
// sini secara otomatis — tanpa reload.
// ============================================================

(function () {
  let charts = { cashflow: null, donut: null, sparkSaldo: null, sparkMasuk: null, sparkKeluar: null, sparkProfit: null };
  let cashflowRange = '6m';
  let kpiPeriod = 'today';     // dikontrol oleh date-pill "Hari Ini" di page-header
  let customRange = null;      // {start, end} saat kpiPeriod === 'custom'
  let catPeriod = 'month';     // dikontrol oleh select-pill "Bulan Ini" di panel kategori

  // Label periode ditangani lewat i18n.js (dvT) — lihat setupPillDropdown() di bawah.

  function formatShortDate(d) {
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  }

  // ---------- Rentang tanggal untuk setiap opsi periode ----------
  function periodRange(periodKey, now) {
    if (periodKey === 'custom') return customRange;
    now = now || new Date(); now.setHours(0, 0, 0, 0);
    const start = new Date(now), end = new Date(now);
    if (periodKey === 'today') { /* start=end=hari ini */ }
    else if (periodKey === '7d') { start.setDate(start.getDate() - 6); }
    else if (periodKey === '30d') { start.setDate(start.getDate() - 29); }
    else if (periodKey === 'week') { const day = (now.getDay() + 6) % 7; start.setDate(start.getDate() - day); }
    else if (periodKey === 'month') { start.setDate(1); }
    else if (periodKey === 'year') { start.setMonth(0, 1); }
    else if (periodKey === 'all') { return null; }
    return { start, end };
  }

  // Rentang periode SEBELUMNYA yang setara, untuk menghitung persentase perubahan
  function prevPeriodRange(periodKey, now) {
    if (periodKey === 'custom') {
      if (!customRange) return null;
      const days = Math.round((customRange.end - customRange.start) / 86400000) + 1;
      const end = new Date(customRange.start); end.setDate(end.getDate() - 1);
      const start = new Date(end); start.setDate(start.getDate() - (days - 1));
      return { start, end };
    }
    now = now || new Date(); now.setHours(0, 0, 0, 0);
    if (periodKey === 'today') { const d = new Date(now); d.setDate(d.getDate() - 1); return { start: d, end: d }; }
    if (periodKey === '7d') { const end = new Date(now); end.setDate(end.getDate() - 7); const start = new Date(end); start.setDate(start.getDate() - 6); return { start, end }; }
    if (periodKey === '30d') { const end = new Date(now); end.setDate(end.getDate() - 30); const start = new Date(end); start.setDate(start.getDate() - 29); return { start, end }; }
    if (periodKey === 'week') { const cur = periodRange('week', now); const start = new Date(cur.start); start.setDate(start.getDate() - 7); const end = new Date(cur.end); end.setDate(end.getDate() - 7); return { start, end }; }
    if (periodKey === 'month') { const start = new Date(now.getFullYear(), now.getMonth() - 1, 1); const end = new Date(now.getFullYear(), now.getMonth(), 0); return { start, end }; }
    if (periodKey === 'year') { const start = new Date(now.getFullYear() - 1, 0, 1); const end = new Date(now.getFullYear() - 1, 11, 31); return { start, end }; }
    return null;
  }

  function filterByRange(list, range) {
    if (!range) return list;
    const startISO = toISO(range.start), endISO = toISO(range.end);
    return list.filter(t => t.tanggal >= startISO && t.tanggal <= endISO);
  }

  const el = {
    kpiSaldoVal: document.getElementById('kpiSaldoVal'),
    kpiSaldoSub: document.getElementById('kpiSaldoSub'),
    kpiMasukVal: document.getElementById('kpiMasukVal'),
    kpiMasukSub: document.getElementById('kpiMasukSub'),
    kpiKeluarVal: document.getElementById('kpiKeluarVal'),
    kpiKeluarSub: document.getElementById('kpiKeluarSub'),
    kpiProfitVal: document.getElementById('kpiProfitVal'),
    kpiProfitSub: document.getElementById('kpiProfitSub'),

    cfRangeChips: document.getElementById('cfRangeChips'),
    donutTotalVal: document.getElementById('donutTotalVal'),
    catList: document.getElementById('catList'),

    recentTransaksiContainer: document.getElementById('recentTransaksiContainer'),
    akunContainer: document.getElementById('akunContainer'),
    tujuanContainer: document.getElementById('tujuanContainer')
  };

  // ============================================================
  // ---------- Helpers ----------
  // ============================================================
  const JENIS_LABEL = { masuk: 'Pemasukan', keluar: 'Pengeluaran', transfer: 'Transfer' };
  const BULAN_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function toISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function akunNama(id) {
    if (!id) return '-';
    const akun = dvGetAkunAll().find(a => a.id === id);
    return akun ? akun.nama : id;
  }

  function kpiIconArrow(up) {
    return up
      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M18 6H9M18 6v9"/></svg>'
      : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 18h9M6 18V9"/></svg>';
  }

  function renderKpiSub(node, pct, hasData, periodLabel) {
    if (!hasData) { node.textContent = dvT('common.belum_ada_data'); return; }
    const up = pct >= 0;
    const cls = up ? 'up' : 'down';
    const rounded = Math.round(Math.abs(pct));
    const suffix = periodLabel ? dvT('dash.vs_prev', { period: periodLabel.toLowerCase() }) : dvT('dash.dari_bulan_lalu');
    node.innerHTML = `<span class="kpi-change ${cls}" style="display:inline-flex;align-items:center;gap:3px;">${kpiIconArrow(up)}${rounded}%</span> ${suffix}`;
  }

  const CHART_OK = typeof Chart !== 'undefined';
  if (!CHART_OK) {
    console.error('[DVpoint] Library Chart.js tidak termuat (cek koneksi/CDN) — grafik akan dilewati, tapi widget lain tetap tampil.');
  }

  // ============================================================
  // ---------- Sparkline mini chart (dipakai 4 KPI card) ----------
  // ============================================================
  function drawSparkline(canvas, key, dataArr, color) {
    if (!CHART_OK) return;
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    charts[key] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dataArr.map((_, i) => i),
        datasets: [{
          data: dataArr, borderColor: color, borderWidth: 2, pointRadius: 0,
          tension: .35, fill: true,
          backgroundColor: (ctxx) => {
            const g = ctxx.chart.ctx.createLinearGradient(0, 0, 0, 40);
            g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
            return g;
          }
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, resizeDelay: 100, animation: { duration: 300 },
        scales: { x: { display: false }, y: { display: false } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
  }

  // ============================================================
  // ---------- Render: 4 KPI cards + sparklines ----------
  // ============================================================
  // pct perubahan vs periode sebelumnya yang setara (dipakai saat kpiPeriod != 'all')
  function pctVsPrev(now, prev) {
    if (!prev) return now > 0 ? 100 : (now < 0 ? -100 : 0);
    return ((now - prev) / Math.abs(prev)) * 100;
  }

  function renderKpi(fullList) {
    // Saldo selalu dihitung dari SELURUH transaksi (saldo berjalan/current balance,
    // tidak masuk akal jika di-scope ke "Hari Ini" saja).
    const summaryAll = dvGetSummary(fullList);
    el.kpiSaldoVal.textContent = dvFormatRupiah(summaryAll.saldo);

    // Uang Masuk / Uang Keluar / Profit mengikuti periode yang dipilih di date-pill.
    const range = periodRange(kpiPeriod);
    const filtered = filterByRange(fullList, range);
    const summary = dvGetSummary(filtered);
    const hasData = filtered.length > 0;

    el.kpiMasukVal.textContent = dvFormatRupiah(summary.totalMasuk);
    el.kpiKeluarVal.textContent = dvFormatRupiah(summary.totalKeluar);
    el.kpiProfitVal.textContent = dvFormatRupiah(summary.profit);

    if (kpiPeriod === 'all') {
      // Semua waktu: tidak ada "periode sebelumnya" yang relevan untuk dibandingkan.
      el.kpiSaldoSub.textContent = dvT('dash.saldo_saat_ini_sub');
      el.kpiMasukSub.textContent = hasData ? dvT('dash.total_seluruh_waktu') : dvT('common.belum_ada_data');
      el.kpiKeluarSub.textContent = filtered.some(t => t.tipe === 'keluar') ? dvT('dash.total_seluruh_waktu') : dvT('common.belum_ada_data');
      el.kpiProfitSub.textContent = hasData ? dvT('dash.total_seluruh_waktu') : dvT('common.belum_ada_data');
    } else {
      const prevRange = prevPeriodRange(kpiPeriod);
      const prevList = filterByRange(fullList, prevRange);
      const prevSummary = dvGetSummary(prevList);
      const periodLabel = kpiPeriod === 'custom'
        ? `${formatShortDate(range.start)} – ${formatShortDate(range.end)}`
        : dvT('dash.period.' + kpiPeriod);

      el.kpiSaldoSub.textContent = dvT('dash.saldo_saat_ini_sub');
      renderKpiSub(el.kpiMasukSub, pctVsPrev(summary.totalMasuk, prevSummary.totalMasuk), filtered.some(t => t.tipe === 'masuk'), periodLabel);
      renderKpiSub(el.kpiKeluarSub, pctVsPrev(summary.totalKeluar, prevSummary.totalKeluar), filtered.some(t => t.tipe === 'keluar'), periodLabel);
      renderKpiSub(el.kpiProfitSub, pctVsPrev(summary.profit, prevSummary.profit), hasData, periodLabel);
    }

    // Sparkline tetap memakai tren 6 bulan dari seluruh data (independen dari filter periode).
    const sparks = dvGetSparklines(fullList);
    drawSparkline(document.getElementById('sparkSaldo'), 'sparkSaldo', sparks.saldo, '#4f7dff');
    drawSparkline(document.getElementById('sparkMasuk'), 'sparkMasuk', sparks.masuk, '#2dd9a8');
    drawSparkline(document.getElementById('sparkKeluar'), 'sparkKeluar', sparks.keluar, '#ef4d8f');
    drawSparkline(document.getElementById('sparkProfit'), 'sparkProfit', sparks.profit, '#9f4dff');
  }

  // ============================================================
  // ---------- Cash Flow: bucket berdasarkan filter periode ----------
  // ============================================================
  function buildCashflowBuckets(rangeKey, list) {
    const now = new Date(); now.setHours(0, 0, 0, 0);

    if (rangeKey === '7d' || rangeKey === '30d') {
      const days = rangeKey === '7d' ? 7 : 30;
      const buckets = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        buckets.push({ key: toISO(d), label: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), masuk: 0, keluar: 0 });
      }
      const byKey = {}; buckets.forEach(b => byKey[b.key] = b);
      list.forEach(t => {
        const b = byKey[t.tanggal];
        if (!b) return;
        if (t.tipe === 'masuk') b.masuk += Number(t.jumlah) || 0;
        else if (t.tipe === 'keluar') b.keluar += Number(t.jumlah) || 0;
      });
      return buckets;
    }

    const monthsCount = rangeKey === '3m' ? 3 : rangeKey === '1y' ? 12 : 6;
    const buckets = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ year: d.getFullYear(), month: d.getMonth(), label: BULAN_LABEL[d.getMonth()], masuk: 0, keluar: 0 });
    }
    list.forEach(t => {
      const d = new Date(t.tanggal + 'T00:00:00');
      if (isNaN(d.getTime())) return;
      const b = buckets.find(x => x.year === d.getFullYear() && x.month === d.getMonth());
      if (!b) return;
      if (t.tipe === 'masuk') b.masuk += Number(t.jumlah) || 0;
      else if (t.tipe === 'keluar') b.keluar += Number(t.jumlah) || 0;
    });
    return buckets;
  }

  function renderCashflow(list) {
    const buckets = buildCashflowBuckets(cashflowRange, list);
    const canvas = document.getElementById('cashflowChart');
    if (!canvas || !CHART_OK) return;
    const ctx = canvas.getContext('2d');
    if (charts.cashflow) charts.cashflow.destroy();

    if (!list.length) {
      charts.cashflow = new Chart(ctx, {
        type: 'line',
        data: { labels: buckets.map(b => b.label), datasets: [{ data: buckets.map(() => 0), borderColor: 'rgba(255,255,255,.12)', borderWidth: 2, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, resizeDelay: 100, plugins: { legend: { display: false }, tooltip: { enabled: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#8a86a8', font: { size: 11 } } }, y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#8a86a8', font: { size: 11 } } } } }
      });
      return;
    }

    charts.cashflow = new Chart(ctx, {
      type: 'line',
      data: {
        labels: buckets.map(b => b.label),
        datasets: [
          { label: 'Uang Masuk', data: buckets.map(b => b.masuk), borderColor: '#2dd9a8', backgroundColor: 'rgba(45,217,168,.12)', fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#2dd9a8' },
          { label: 'Uang Keluar', data: buckets.map(b => b.keluar), borderColor: '#ef4d8f', backgroundColor: 'rgba(239,77,143,.12)', fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#ef4d8f' },
          { label: 'Profit', data: buckets.map(b => b.masuk - b.keluar), borderColor: '#4f7dff', backgroundColor: 'rgba(79,125,255,.08)', fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#4f7dff' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, resizeDelay: 100, animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${dvFormatRupiah(c.parsed.y)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8a86a8', font: { size: 11 }, maxRotation: 0, autoSkip: true } },
          y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#8a86a8', font: { size: 11 }, callback: (v) => dvFormatRupiah(v) } }
        }
      }
    });
  }

  // ============================================================
  // ---------- Pengeluaran per Kategori (donut, bulan berjalan) ----------
  // ============================================================
  // Versi lokal dari dvGetPengeluaranPerKategori yang mendukung periode
  // pilihan pengguna (Minggu/Bulan/Tahun Ini/Semua), bukan hanya bulan berjalan.
  function pengeluaranPerKategoriPeriod(list, periodKey) {
    const range = periodRange(periodKey);
    const filtered = filterByRange(list, range).filter(t => t.tipe === 'keluar');
    const map = {};
    let total = 0;
    filtered.forEach(t => {
      map[t.kategori] = (map[t.kategori] || 0) + (Number(t.jumlah) || 0);
      total += Number(t.jumlah) || 0;
    });
    const rows = Object.keys(map).map(k => ({
      kategori: k,
      jumlah: map[k],
      pct: total ? Math.round((map[k] / total) * 100) : 0,
      warna: (typeof DV_KATEGORI_WARNA !== 'undefined' && DV_KATEGORI_WARNA[k]) || '#8a86a8'
    })).sort((a, b) => b.jumlah - a.jumlah);
    return { total, rows };
  }

  function renderDonut(list) {
    const { total, rows } = pengeluaranPerKategoriPeriod(list, catPeriod);
    el.donutTotalVal.textContent = dvFormatRupiah(total);

    const canvas = document.getElementById('expenseDonut');
    if (!rows.length) {
      el.catList.innerHTML = '<div style="padding:40px 10px;text-align:center;color:#9ca3af;" data-i18n="dash.belum_ada_pengeluaran">' + dvT('dash.belum_ada_pengeluaran') + '</div>';
      if (CHART_OK && canvas) {
        const ctx = canvas.getContext('2d');
        if (charts.donut) charts.donut.destroy();
        charts.donut = new Chart(ctx, {
          type: 'doughnut',
          data: { labels: ['Tidak ada data'], datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,.06)'], borderWidth: 0 }] },
          options: { responsive: true, resizeDelay: 100, plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '72%' }
        });
      }
      return;
    }

    if (CHART_OK && canvas) {
      const ctx = canvas.getContext('2d');
      if (charts.donut) charts.donut.destroy();
      charts.donut = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: rows.map(r => r.kategori), datasets: [{ data: rows.map(r => r.jumlah), backgroundColor: rows.map(r => r.warna), borderWidth: 0, hoverOffset: 6 }] },
        options: {
          responsive: true, resizeDelay: 100,
          animation: false, cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${dvFormatRupiah(c.parsed)} (${rows[c.dataIndex].pct}%)` } } }
        }
      });
    }

    el.catList.innerHTML = rows.map(r => `
      <div class="cat-row">
        <div class="cat-name"><span class="dot" style="background:${r.warna}"></span>${r.kategori}</div>
        <div class="cat-pct">${r.pct}%</div>
        <div class="cat-amt">${dvFormatRupiah(r.jumlah)}</div>
      </div>`).join('');
  }

  // ============================================================
  // ---------- Transaksi Terakhir (maks 5, terbaru) ----------
  // ============================================================
  function tipeIconSvg(tipe) {
    if (tipe === 'masuk') return '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="17" height="17"><path d="M12 4v14M6 12l6 6 6-6"></path></svg>';
    if (tipe === 'keluar') return '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="17" height="17"><path d="M12 20V6M6 12l6-6 6 6"></path></svg>';
    return '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="17" height="17"><path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13"></path></svg>';
  }

  const BADGE_STYLE = {
    masuk: 'background:rgba(45,217,168,.16); color:var(--teal);',
    keluar: 'background:rgba(239,77,143,.16); color:var(--pink);',
    transfer: 'background:rgba(79,125,255,.16); color:var(--blue);'
  };

  function renderRecentTransaksi(list) {
    if (!list.length) {
      el.recentTransaksiContainer.innerHTML = '<div class="empty-state"><h4 data-i18n="dash.belum_ada_transaksi">' + dvT('dash.belum_ada_transaksi') + '</h4><p data-i18n="dash.belum_ada_transaksi_desc">' + dvT('dash.belum_ada_transaksi_desc') + '</p></div>';
      return;
    }
    const recent = list.slice().sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1)).slice(0, 5);
    el.recentTransaksiContainer.innerHTML = recent.map(t => {
      const iconCls = t.tipe === 'masuk' ? 'income' : (t.tipe === 'keluar' ? 'expense' : 'transfer');
      const jumlahCls = t.tipe === 'masuk' ? 'income' : (t.tipe === 'keluar' ? 'expense' : 'transfer');
      const sign = t.tipe === 'masuk' ? '+' : (t.tipe === 'keluar' ? '-' : '');
      const akunText = t.tipe === 'transfer' ? `${akunNama(t.akunAsal)} → ${akunNama(t.akunTujuan)}` : akunNama(t.akun);
      return `
        <div class="transaksi-item">
          <div class="transaksi-info">
            <div class="transaksi-icon ${iconCls}">${tipeIconSvg(t.tipe)}</div>
            <div>
              <div class="transaksi-nama">${t.deskripsi || t.kategori}
                <span class="cat-badge" style="${BADGE_STYLE[t.tipe] || ''} margin-left:6px;">${JENIS_LABEL[t.tipe] || t.tipe}</span>
              </div>
              <div class="transaksi-kategori">${t.kategori || '-'} · ${akunText}</div>
            </div>
          </div>
          <div style="text-align:right;">
            <div class="transaksi-jumlah ${jumlahCls}">${sign}${dvFormatRupiah(t.jumlah)}</div>
            <div class="transaksi-tanggal">${dvFormatTanggal(t.tanggal)}</div>
          </div>
        </div>`;
    }).join('');
  }

  // ============================================================
  // ---------- Akun Saya (semua akun aktif, urut saldo terbesar) ----------
  // ============================================================
  function initialAkun(nama) {
    if (!nama) return '?';
    const parts = nama.trim().split(/\s+/);
    return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : nama.slice(0, 2).toUpperCase();
  }

  function renderAkunSaya(list) {
    const akunList = dvGetAkunList(list).sort((a, b) => b.saldo - a.saldo);
    const totalToggle = document.querySelector('#akunContainer').closest('.panel').querySelector('.total-toggle');

    if (!akunList.length) {
      el.akunContainer.innerHTML = '<div class="empty-state"><h4 data-i18n="dash.belum_ada_akun">' + dvT('dash.belum_ada_akun') + '</h4><p data-i18n="dash.belum_ada_akun_desc">' + dvT('dash.belum_ada_akun_desc') + '</p></div>';
      if (totalToggle) totalToggle.childNodes[0].textContent = dvT('dash.total_saldo_label') + ' ';
      return;
    }

    const totalSaldo = akunList.reduce((s, a) => s + a.saldo, 0);
    if (totalToggle) totalToggle.childNodes[0].textContent = `${dvT('dash.total_prefix')} ${dvFormatRupiah(totalSaldo)} `;

    const header = `<div style="font-size:12px;color:var(--text-dimmer);margin-bottom:10px;">${akunList.length} Akun</div>`;
    const rows = akunList.map(a => `
      <div class="acc-row">
        <div class="acc-left">
          <div class="acc-icon" style="background:${a.warna}2e; color:${a.warna};">${initialAkun(a.nama)}</div>
          <div>
            <div class="acc-name">${a.nama}</div>
            <div class="acc-num">${a.jenis}</div>
          </div>
        </div>
        <div class="acc-bal" style="${a.saldo < 0 ? 'color:var(--pink);' : ''}">${dvFormatRupiah(a.saldo)}</div>
      </div>`).join('');
    el.akunContainer.innerHTML = header + rows;
  }

  // ============================================================
  // ---------- Tujuan Keuangan (maks 3, progress bar) ----------
  // ============================================================
  function renderTujuan() {
    const list = dvGetTujuan().filter(g => !g.arsip).slice(0, 3);
    if (!list.length) {
      el.tujuanContainer.innerHTML = '<div class="empty-state"><h4 data-i18n="dash.belum_ada_tujuan">' + dvT('dash.belum_ada_tujuan') + '</h4><p data-i18n="dash.belum_ada_tujuan_desc">' + dvT('dash.belum_ada_tujuan_desc') + '</p></div>';
      return;
    }
    el.tujuanContainer.innerHTML = list.map(g => {
      const target = Number(g.target) || 0;
      const terkumpul = Number(g.terkumpul) || 0;
      const pct = target > 0 ? Math.min(100, Math.round((terkumpul / target) * 100)) : 0;
      const warna = g.warna || '#4f7dff';
      return `
        <div class="goal">
          <div class="goal-top">
            <div class="name"><span class="goal-icon" style="background:${warna}2e; color:${warna};">
              <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 2v2M12 20v2"></path></svg>
            </span>${g.nama}</div>
            <div class="pct">${pct}%</div>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${warna};"></div></div>
          <div class="goal-amt">${dvFormatRupiah(terkumpul)} dari ${dvFormatRupiah(target)}</div>
        </div>`;
    }).join('');
  }

  // ============================================================
  // ---------- Master render ----------
  // ============================================================
  function render() {
    const list = dvGetTransaksi();

    function safe(label, fn) {
      try { fn(); } catch (err) { console.error(`[DVpoint] Gagal render widget "${label}":`, err); }
    }

    safe('KPI', () => renderKpi(list));
    safe('Cash Flow', () => renderCashflow(list));
    safe('Pengeluaran per Kategori', () => renderDonut(list));
    safe('Transaksi Terakhir', () => renderRecentTransaksi(list));
    safe('Akun Saya', () => renderAkunSaya(list));
    safe('Tujuan Keuangan', () => renderTujuan());
  }

  // ============================================================
  // ---------- Event bindings ----------
  // ============================================================
  if (el.cfRangeChips) {
    el.cfRangeChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.cf-chip');
      if (!chip) return;
      el.cfRangeChips.querySelectorAll('.cf-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      cashflowRange = chip.dataset.range;
      renderCashflow(dvGetTransaksi());
    });
  }

  // ---------- Dropdown periode: date-pill "Hari Ini" & select-pill "Bulan Ini" ----------
  function setupPillDropdown(btnId, wrapId, menuId, labelId, i18nPrefix, onSelect) {
    const btn = document.getElementById(btnId);
    const wrap = document.getElementById(wrapId);
    const menu = document.getElementById(menuId);
    const labelEl = document.getElementById(labelId);
    if (!btn || !wrap || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = !menu.classList.contains('open');
      document.querySelectorAll('.pill-dropdown.open').forEach(m => m.classList.remove('open'));
      if (willOpen) menu.classList.add('open');
    });

    menu.addEventListener('click', (e) => {
      const opt = e.target.closest('button[data-period]');
      if (!opt || opt.dataset.period === 'custom') return;
      menu.querySelectorAll('button[data-period]').forEach(b => b.classList.remove('active'));
      opt.classList.add('active');
      if (labelEl) labelEl.textContent = dvT(i18nPrefix + opt.dataset.period);
      const customBox = menu.querySelector('.pill-custom-range');
      if (customBox) customBox.classList.remove('open');
      menu.classList.remove('open');
      onSelect(opt.dataset.period);
    });
  }

  setupPillDropdown('dateFilterBtn', 'dateFilterWrap', 'dateFilterMenu', 'dateFilterLabel', 'dash.period.', (key) => {
    kpiPeriod = key;
    renderKpi(dvGetTransaksi());
  });

  setupPillDropdown('catFilterBtn', 'catFilterWrap', 'catFilterMenu', 'catFilterLabel', 'dash.cat_period.', (key) => {
    catPeriod = key;
    renderDonut(dvGetTransaksi());
  });

  // ---------- Rentang kustom (Dari – Sampai) di dropdown date-pill ----------
  (function setupCustomRange() {
    const toggleBtn = document.getElementById('customRangeToggle');
    const box = document.getElementById('customRangeBox');
    const fromInput = document.getElementById('customRangeFrom');
    const toInput = document.getElementById('customRangeTo');
    const applyBtn = document.getElementById('customRangeApply');
    const menu = document.getElementById('dateFilterMenu');
    const labelEl = document.getElementById('dateFilterLabel');
    if (!toggleBtn || !box || !fromInput || !toInput || !applyBtn) return;

    const todayISO = dvTodayISO();
    toInput.value = todayISO;
    fromInput.value = todayISO;
    fromInput.max = todayISO;
    toInput.max = todayISO;

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      box.classList.toggle('open');
    });
    box.addEventListener('click', (e) => e.stopPropagation());

    applyBtn.addEventListener('click', () => {
      if (!fromInput.value || !toInput.value) return;
      let start = new Date(fromInput.value + 'T00:00:00');
      let end = new Date(toInput.value + 'T00:00:00');
      if (start > end) { const tmp = start; start = end; end = tmp; } // tukar jika terbalik

      customRange = { start, end };
      kpiPeriod = 'custom';
      menu.querySelectorAll('button[data-period]').forEach(b => b.classList.remove('active'));
      toggleBtn.classList.add('active');
      if (labelEl) labelEl.textContent = `${formatShortDate(start)} – ${formatShortDate(end)}`;
      box.classList.remove('open');
      menu.classList.remove('open');
      renderKpi(dvGetTransaksi());
    });
  })();

  document.addEventListener('click', () => {
    document.querySelectorAll('.pill-dropdown.open').forEach(m => m.classList.remove('open'));
    const box = document.getElementById('customRangeBox');
    if (box) box.classList.remove('open');
  });

  // ---------- Sinkronisasi real-time lintas halaman/modul ----------
  dvOnChange(render);

  // ---------- Init ----------
  render();
})();