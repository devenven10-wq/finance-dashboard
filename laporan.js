// ============================================================
// DVpoint — Laporan (Reports) page logic
// ============================================================
// Halaman ini bersifat READ-ONLY. Tidak ada fungsi tambah/edit/hapus
// transaksi di sini. Semua data dibaca dari storage.js (single source
// of truth yang sama dipakai Semua Transaksi, Pemasukan, Pengeluaran,
// dan Transfer) dan halaman ini otomatis re-render lewat dvOnChange()
// setiap kali data berubah di halaman lain — tanpa refresh manual.
// ============================================================

(function () {
  let charts = { cashflow: null, donut: null, activity: null };

  const state = {
    period: 'hari-ini',
    customFrom: '',
    customTo: '',
    akun: '',
    kategori: '',
    jenis: ''
  };

  // ---------- DOM refs ----------
  const el = {
    filterPanel: document.getElementById('filterPanel'),
    periodChips: document.getElementById('periodChips'),
    customRange: document.getElementById('customRange'),
    fCustomFrom: document.getElementById('fCustomFrom'),
    fCustomTo: document.getElementById('fCustomTo'),
    fAkun: document.getElementById('fAkun'),
    fKategori: document.getElementById('fKategori'),
    fJenis: document.getElementById('fJenis'),
    btnResetFilter: document.getElementById('btnResetFilter'),
    btnToggleFilter: document.getElementById('btnToggleFilter'),
    btnExportPdf: document.getElementById('btnExportPdf'),
    btnExportExcel: document.getElementById('btnExportExcel'),
    btnPrint: document.getElementById('btnPrint'),
    periodLabel: document.getElementById('periodLabel'),
    laporanContent: document.getElementById('laporanContent'),
    laporanEmptyState: document.getElementById('laporanEmptyState'),
    riwayatNoResult: document.getElementById('riwayatNoResult'),
    riwayatTable: document.getElementById('riwayatTable'),
    riwayatTableBody: document.getElementById('riwayatTableBody'),
    resultCount: document.getElementById('resultCount'),
    kategoriTableBody: document.getElementById('kategoriTableBody'),
    kategoriEmpty: document.getElementById('kategoriEmpty'),
    insightGrid: document.getElementById('insightGrid'),
    catList: document.getElementById('catList'),
    donutTotalVal: document.getElementById('donutTotalVal'),
    toast: document.getElementById('lapToast')
  };

  // ============================================================
  // ---------- Helpers: tanggal & periode ----------
  // ============================================================
  function toISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseISO(iso) {
    return new Date(iso + 'T00:00:00');
  }
  function startOfWeek(d) {
    const x = new Date(d);
    const day = x.getDay(); // 0=Minggu
    const diff = day === 0 ? 6 : day - 1; // Senin sebagai awal minggu
    x.setDate(x.getDate() - diff);
    return x;
  }

  function computeRange() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    let start, end;
    if (state.period === 'hari-ini') {
      start = new Date(now); end = new Date(now);
    } else if (state.period === 'minggu-ini') {
      start = startOfWeek(now); end = new Date(now);
    } else if (state.period === 'bulan-ini') {
      start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now);
    } else if (state.period === 'tahun-ini') {
      start = new Date(now.getFullYear(), 0, 1); end = new Date(now);
    } else if (state.period === 'custom') {
      start = state.customFrom ? parseISO(state.customFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
      end = state.customTo ? parseISO(state.customTo) : new Date(now);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1); end = new Date(now);
    }
    if (start > end) { const t = start; start = end; end = t; }
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  function periodLabelText(range) {
    const opt = { day: '2-digit', month: 'short', year: 'numeric' };
    const names = { 'hari-ini': dvT('lap.period_cap.hari_ini'), 'minggu-ini': dvT('lap.period_cap.minggu_ini'), 'bulan-ini': dvT('lap.period_cap.bulan_ini'), 'tahun-ini': dvT('lap.period_cap.tahun_ini'), 'custom': dvT('lap.period_cap.custom') };
    return dvT('lap.periode_prefix', { label: names[state.period] || dvT('lap.period_cap.bulan_ini'), start: range.start.toLocaleDateString('id-ID', opt), end: range.end.toLocaleDateString('id-ID', opt) });
  }

  // ============================================================
  // ---------- Populate filter dropdowns dari data nyata ----------
  // ============================================================
  function populateFilterOptions() {
    const list = dvGetTransaksi();
    const akunAll = dvGetAkunAll();

    // Akun: gabungkan akun yang tersimpan + akun yang muncul di transaksi
    const akunMap = {};
    akunAll.forEach(a => akunMap[a.id] = a.nama);
    list.forEach(t => {
      if (t.akun && !akunMap[t.akun]) akunMap[t.akun] = t.akun;
      if (t.akunAsal && !akunMap[t.akunAsal]) akunMap[t.akunAsal] = t.akunAsal;
      if (t.akunTujuan && !akunMap[t.akunTujuan]) akunMap[t.akunTujuan] = t.akunTujuan;
    });
    const prevAkun = el.fAkun.value;
    el.fAkun.innerHTML = '<option value="">Semua Akun</option>' +
      Object.keys(akunMap).sort((a, b) => akunMap[a].localeCompare(akunMap[b])).map(id => `<option value="${id}">${akunMap[id]}</option>`).join('');
    if (Object.prototype.hasOwnProperty.call(akunMap, prevAkun)) el.fAkun.value = prevAkun;

    // Kategori: ambil semua kategori unik yang benar-benar dipakai
    const kategoriSet = new Set();
    list.forEach(t => { if (t.kategori) kategoriSet.add(t.kategori); });
    const prevKategori = el.fKategori.value;
    el.fKategori.innerHTML = '<option value="">Semua Kategori</option>' +
      Array.from(kategoriSet).sort().map(k => `<option value="${k}">${k}</option>`).join('');
    if (kategoriSet.has(prevKategori)) el.fKategori.value = prevKategori;
  }

  // ============================================================
  // ---------- Filtering ----------
  // ============================================================
  function getFiltered() {
    const list = dvGetTransaksi();
    const { start, end } = computeRange();
    return list.filter(t => {
      const d = parseISO(t.tanggal);
      if (isNaN(d.getTime())) return false;
      if (d < start || d > end) return false;
      if (state.akun && !(t.akun === state.akun || t.akunAsal === state.akun || t.akunTujuan === state.akun)) return false;
      if (state.kategori && t.kategori !== state.kategori) return false;
      if (state.jenis && t.tipe !== state.jenis) return false;
      return true;
    });
  }



  // ============================================================
  // ---------- Bucket untuk Cash Flow (adaptif harian/bulanan) ----------
  // ============================================================
  const BULAN_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  function buildCashflowBuckets(list, start, end) {
    const diffDays = (end - start) / 86400000;
    const buckets = [];
    if (diffDays <= 45) {
      // bucket per hari
      const cur = new Date(start); cur.setHours(0, 0, 0, 0);
      const last = new Date(end); last.setHours(0, 0, 0, 0);
      while (cur <= last) {
        buckets.push({ key: toISO(cur), label: cur.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }), masuk: 0, keluar: 0 });
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      // bucket per bulan
      const cur = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);
      while (cur <= last) {
        buckets.push({ key: cur.getFullYear() + '-' + cur.getMonth(), label: BULAN_LABEL[cur.getMonth()] + ' ' + String(cur.getFullYear()).slice(2), masuk: 0, keluar: 0 });
        cur.setMonth(cur.getMonth() + 1);
      }
    }
    const byKey = {};
    buckets.forEach(b => byKey[b.key] = b);
    const perHari = diffDays <= 45;
    list.forEach(t => {
      const d = parseISO(t.tanggal);
      const key = perHari ? t.tanggal : (d.getFullYear() + '-' + d.getMonth());
      const b = byKey[key];
      if (!b) return;
      if (t.tipe === 'masuk') b.masuk += Number(t.jumlah) || 0;
      else if (t.tipe === 'keluar') b.keluar += Number(t.jumlah) || 0;
    });
    return buckets;
  }

  function buildMonthlyActivity(list, start, end) {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    const buckets = [];
    while (cur <= last) {
      buckets.push({ key: cur.getFullYear() + '-' + cur.getMonth(), label: BULAN_LABEL[cur.getMonth()] + ' ' + cur.getFullYear(), count: 0 });
      cur.setMonth(cur.getMonth() + 1);
    }
    const byKey = {};
    buckets.forEach(b => byKey[b.key] = b);
    list.forEach(t => {
      const d = parseISO(t.tanggal);
      const key = d.getFullYear() + '-' + d.getMonth();
      const b = byKey[key];
      if (b) b.count++;
    });
    return buckets;
  }

  // ============================================================
  // ---------- Render: Ringkasan 4 card ----------
  // ============================================================
  function renderSummary(filtered, range) {
    let masuk = 0, keluar = 0, transfer = 0;
    filtered.forEach(t => {
      if (t.tipe === 'masuk') masuk += Number(t.jumlah) || 0;
      else if (t.tipe === 'keluar') keluar += Number(t.jumlah) || 0;
      else if (t.tipe === 'transfer') transfer += Number(t.jumlah) || 0;
    });
    document.getElementById('sumMasuk').textContent = dvFormatRupiah(masuk);
    document.getElementById('sumKeluar').textContent = dvFormatRupiah(keluar);
    document.getElementById('sumTransfer').textContent = dvFormatRupiah(transfer);
    document.getElementById('sumTotal').textContent = filtered.length;

    const label = periodShortLabel();
    document.getElementById('sumMasukSub').textContent = filtered.some(t => t.tipe === 'masuk') ? `${label}` : dvT('lap.belum_ada_data');
    document.getElementById('sumKeluarSub').textContent = filtered.some(t => t.tipe === 'keluar') ? `${label}` : dvT('lap.belum_ada_data');
    document.getElementById('sumTransferSub').textContent = filtered.some(t => t.tipe === 'transfer') ? `${label}` : dvT('lap.belum_ada_data');
    document.getElementById('sumTotalSub').textContent = filtered.length ? dvT('lap.n_transaksi', {n: filtered.length, label}) : dvT('lap.belum_ada_data');
  }

  function periodShortLabel() {
    const names = { 'hari-ini': dvT('lap.period.hari_ini'), 'minggu-ini': dvT('lap.period.minggu_ini'), 'bulan-ini': dvT('lap.period.bulan_ini'), 'tahun-ini': dvT('lap.period.tahun_ini'), 'custom': dvT('lap.period.custom') };
    return names[state.period] || dvT('lap.period.custom');
  }

  // ============================================================
  // ---------- Render: Cash Flow line chart ----------
  // ============================================================
  function renderCashflow(filtered, range) {
    const buckets = buildCashflowBuckets(filtered, range.start, range.end);
    const ctx = document.getElementById('cashflowChart').getContext('2d');
    if (charts.cashflow) charts.cashflow.destroy();

    // Line chart tidak bisa menggambar apa pun dengan hanya 1 titik data
    // (mis. periode "Hari Ini") — pakai bar chart supaya tetap terbaca.
    const singlePoint = buckets.length <= 1;
    const chartType = singlePoint ? 'bar' : 'line';
    const sharedOpts = singlePoint
      ? { borderRadius: 6, maxBarThickness: 56, categoryPercentage: 0.32, barPercentage: 0.9 }
      : { fill: true, tension: .35, pointRadius: 3 };

    charts.cashflow = new Chart(ctx, {
      type: chartType,
      data: {
        labels: buckets.map(b => b.label),
        datasets: [
          Object.assign({ label: 'Pemasukan', data: buckets.map(b => b.masuk), borderColor: '#2dd9a8', backgroundColor: singlePoint ? '#2dd9a8' : 'rgba(45,217,168,.12)' }, sharedOpts),
          Object.assign({ label: 'Pengeluaran', data: buckets.map(b => b.keluar), borderColor: '#ef4d8f', backgroundColor: singlePoint ? '#ef4d8f' : 'rgba(239,77,143,.12)' }, sharedOpts)
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${dvFormatRupiah(c.parsed.y)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8a86a8', font: { size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#8a86a8', font: { size: 11 }, callback: (v) => dvFormatRupiah(v) } }
        }
      }
    });
  }

  // ============================================================
  // ---------- Render: Donut Pengeluaran per Kategori ----------
  // ============================================================
  function renderDonutAndCategoryTable(filtered) {
    const map = {};
    let total = 0;
    filtered.forEach(t => {
      if (t.tipe !== 'keluar') return;
      if (!map[t.kategori]) map[t.kategori] = { jumlah: 0, count: 0 };
      map[t.kategori].jumlah += Number(t.jumlah) || 0;
      map[t.kategori].count++;
      total += Number(t.jumlah) || 0;
    });
    const rows = Object.keys(map).map(k => ({
      kategori: k, jumlah: map[k].jumlah, count: map[k].count,
      pct: total ? Math.round((map[k].jumlah / total) * 100) : 0,
      warna: DV_KATEGORI_WARNA[k] || '#8a86a8'
    })).sort((a, b) => b.jumlah - a.jumlah);

    document.getElementById('donutTotalVal').textContent = dvFormatRupiah(total);

    const ctx = document.getElementById('expenseDonut').getContext('2d');
    if (charts.donut) charts.donut.destroy();
    if (!rows.length) {
      el.catList.innerHTML = '<div style="padding:40px 10px;text-align:center;color:#9ca3af;">Belum ada data pengeluaran.</div>';
      charts.donut = new Chart(ctx, { type: 'doughnut', data: { labels: ['Tidak ada data'], datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,.06)'], borderWidth: 0 }] }, options: { plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '72%' } });
    } else {
      charts.donut = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: rows.map(r => r.kategori), datasets: [{ data: rows.map(r => r.jumlah), backgroundColor: rows.map(r => r.warna), borderWidth: 0, hoverOffset: 6 }] },
        options: {
          animation: { duration: 300 }, cutout: '72%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${dvFormatRupiah(c.parsed)}` } } }
        }
      });
      el.catList.innerHTML = rows.map(r => `
        <div class="cat-row">
          <div class="cat-name"><span class="dot" style="background:${r.warna}"></span>${r.kategori}</div>
          <div class="cat-pct">${r.pct}%</div>
          <div class="cat-amt">${dvFormatRupiah(r.jumlah)}</div>
        </div>`).join('');
    }

    // Tabel Ringkasan Kategori
    if (!rows.length) {
      el.kategoriTableBody.innerHTML = '';
      el.kategoriEmpty.style.display = 'block';
    } else {
      el.kategoriEmpty.style.display = 'none';
      el.kategoriTableBody.innerHTML = rows.map(r => `
        <tr>
          <td>
            <div class="lap-cat-cell"><span class="lap-cat-dot" style="background:${r.warna}"></span>${r.kategori}</div>
            <div class="lap-cat-bar-wrap"><div class="lap-cat-bar-track"><div class="lap-cat-bar-fill" style="width:${r.pct}%;background:${r.warna}"></div></div></div>
          </td>
          <td>${r.count}</td>
          <td class="amount neg">${dvFormatRupiah(r.jumlah)}</td>
        </tr>`).join('');
    }
    return rows;
  }

  // ============================================================
  // ---------- Render: Bar chart Aktivitas Bulanan ----------
  // ============================================================
  function renderActivityChart(filtered, range) {
    const buckets = buildMonthlyActivity(filtered, range.start, range.end);
    const ctx = document.getElementById('activityChart').getContext('2d');
    if (charts.activity) charts.activity.destroy();
    charts.activity = new Chart(ctx, {
      type: 'bar',
      data: { labels: buckets.map(b => b.label), datasets: [{ data: buckets.map(b => b.count), backgroundColor: '#4f7dff', borderRadius: 6, maxBarThickness: 40 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y} transaksi` } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8a86a8', font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.05)' }, ticks: { color: '#8a86a8', font: { size: 11 }, precision: 0 } }
        }
      }
    });
  }

  // ============================================================
  // ---------- Render: Tabel Riwayat Transaksi ----------
  // ============================================================
  const JENIS_LABEL = { masuk: 'Pemasukan', keluar: 'Pengeluaran', transfer: 'Transfer' };

  function akunNama(id) {
    if (!id) return '-';
    const akun = dvGetAkunAll().find(a => a.id === id);
    return akun ? akun.nama : id;
  }

  function renderRiwayat(filtered) {
    const sorted = filtered.slice().sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
    el.resultCount.textContent = sorted.length ? `${sorted.length} transaksi ditemukan` : '';
    if (!sorted.length) {
      el.riwayatTable.style.display = 'none';
      el.riwayatNoResult.style.display = 'block';
      el.riwayatTableBody.innerHTML = '';
      return;
    }
    el.riwayatTable.style.display = 'table';
    el.riwayatNoResult.style.display = 'none';
    el.riwayatTableBody.innerHTML = sorted.map(t => {
      const jenis = t.tipe;
      const nominalClass = jenis === 'masuk' ? 'pos' : (jenis === 'keluar' ? 'neg' : '');
      const sign = jenis === 'masuk' ? '+' : (jenis === 'keluar' ? '-' : '');
      const akunText = jenis === 'transfer' ? `${akunNama(t.akunAsal)} → ${akunNama(t.akunTujuan)}` : akunNama(t.akun);
      return `
        <tr>
          <td>${dvFormatTanggal(t.tanggal)}</td>
          <td><span class="jenis-badge ${jenis}">${JENIS_LABEL[jenis] || jenis}</span></td>
          <td>${t.kategori || '-'}</td>
          <td class="desc-cell">${t.deskripsi || t.catatan || '-'}</td>
          <td><span class="acc-tag">${akunText}</span></td>
          <td class="amount ${nominalClass}">${sign}${dvFormatRupiah(t.jumlah)}</td>
        </tr>`;
    }).join('');
  }

  // ============================================================
  // ---------- Render: Insight Keuangan ----------
  // ============================================================
  function insightCard(icon, colorVar, label, value) {
    return `
      <div class="lap-insight-card">
        <div class="lap-insight-icon" style="background:${colorVar}22; color:${colorVar};">${icon}</div>
        <div class="lap-insight-body">
          <div class="lap-insight-label">${label}</div>
          <div class="lap-insight-value">${value}</div>
        </div>
      </div>`;
  }

  function renderInsight(filtered, range) {
    const keluarList = filtered.filter(t => t.tipe === 'keluar');
    const masukList = filtered.filter(t => t.tipe === 'masuk');
    const muted = '<span class="muted">Belum ada data</span>';

    // 1. Kategori pengeluaran terbesar
    let topExpenseHtml = muted;
    if (keluarList.length) {
      const map = {};
      keluarList.forEach(t => map[t.kategori] = (map[t.kategori] || 0) + (Number(t.jumlah) || 0));
      const top = Object.keys(map).sort((a, b) => map[b] - map[a])[0];
      topExpenseHtml = `${top} <span class="muted">· ${dvFormatRupiah(map[top])}</span>`;
    }

    // 2. Kategori/transaksi dengan jumlah terbanyak (berdasarkan hitungan)
    let mostFrequentHtml = muted;
    if (filtered.length) {
      const cmap = {};
      filtered.forEach(t => cmap[t.kategori] = (cmap[t.kategori] || 0) + 1);
      const top = Object.keys(cmap).sort((a, b) => cmap[b] - cmap[a])[0];
      mostFrequentHtml = `${top} <span class="muted">· ${cmap[top]} transaksi</span>`;
    }

    // 3. Hari dengan pengeluaran tertinggi
    let highestDayHtml = muted;
    if (keluarList.length) {
      const dmap = {};
      keluarList.forEach(t => dmap[t.tanggal] = (dmap[t.tanggal] || 0) + (Number(t.jumlah) || 0));
      const top = Object.keys(dmap).sort((a, b) => dmap[b] - dmap[a])[0];
      highestDayHtml = `${dvFormatTanggal(top)} <span class="muted">· ${dvFormatRupiah(dmap[top])}</span>`;
    }

    // 4. Rata-rata pengeluaran harian
    let avgDailyHtml = muted;
    if (keluarList.length) {
      const totalKeluar = keluarList.reduce((s, t) => s + (Number(t.jumlah) || 0), 0);
      const totalHari = Math.max(1, Math.round((range.end - range.start) / 86400000) + 1);
      avgDailyHtml = dvFormatRupiah(totalKeluar / totalHari) + ' <span class="muted">/ hari</span>';
    }

    // 5. Rata-rata pemasukan bulanan
    let avgMonthlyHtml = muted;
    if (masukList.length) {
      const totalMasuk = masukList.reduce((s, t) => s + (Number(t.jumlah) || 0), 0);
      const monthSet = new Set(masukList.map(t => t.tanggal.slice(0, 7)));
      avgMonthlyHtml = dvFormatRupiah(totalMasuk / Math.max(1, monthSet.size)) + ' <span class="muted">/ bulan</span>';
    }

    el.insightGrid.innerHTML = [
      insightCard('<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 20V6M6 12l6-6 6 6"></path></svg>', '#ef4d8f', 'Kategori pengeluaran terbesar', topExpenseHtml),
      insightCard('<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><rect height="16" rx="2" width="16" x="4" y="4"></rect><path d="M8 9h8M8 13h5"></path></svg>', '#9f4dff', 'Kategori dengan transaksi terbanyak', mostFrequentHtml),
      insightCard('<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><rect height="16" rx="2" width="18" x="3" y="5"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg>', '#f5b342', 'Hari dengan pengeluaran tertinggi', highestDayHtml),
      insightCard('<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 20V10M12 20V4M20 20v-7"></path></svg>', '#ef4d8f', 'Rata-rata pengeluaran harian', avgDailyHtml),
      insightCard('<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M12 4v14M6 12l6 6 6-6"></path></svg>', '#2dd9a8', 'Rata-rata pemasukan bulanan', avgMonthlyHtml)
    ].join('');
  }

  // ============================================================
  // ---------- Master render ----------
  // ============================================================
  function render() {
    const allData = dvGetTransaksi();

    if (!allData.length) {
      el.laporanContent.style.display = 'none';
      el.laporanEmptyState.style.display = 'block';
      el.filterPanel.style.display = 'none';
      document.querySelector('.lap-header-actions').style.display = 'none';
      return;
    }
    el.laporanContent.style.display = 'block';
    el.laporanEmptyState.style.display = 'none';
    el.filterPanel.style.display = 'block';
    document.querySelector('.lap-header-actions').style.display = 'flex';

    populateFilterOptions();

    const range = computeRange();
    el.periodLabel.textContent = periodLabelText(range);

    const filtered = getFiltered();

    renderSummary(filtered, range);
    renderCashflow(filtered, range);
    renderDonutAndCategoryTable(filtered);
    renderActivityChart(filtered, range);
    renderRiwayat(filtered);
    renderInsight(filtered, range);
  }

  // ============================================================
  // ---------- Toast ----------
  // ============================================================
  let toastTimer = null;
  function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
  }

  // ============================================================
  // ---------- Export: Excel (SheetJS) ----------
  // ============================================================
  function exportExcel() {
    if (typeof XLSX === 'undefined') { showToast(dvT('lap.err_export_gagal')); return; }
    const filtered = getFiltered().slice().sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
    const riwayatRows = filtered.map(t => ({
      Tanggal: dvFormatTanggal(t.tanggal),
      Jenis: JENIS_LABEL[t.tipe] || t.tipe,
      Kategori: t.kategori || '-',
      Deskripsi: t.deskripsi || t.catatan || '-',
      Akun: t.tipe === 'transfer' ? `${akunNama(t.akunAsal)} → ${akunNama(t.akunTujuan)}` : akunNama(t.akun),
      Nominal: Number(t.jumlah) || 0
    }));

    const kategoriRows = renderDonutAndCategoryTable(filtered).map(r => ({
      Kategori: r.kategori, 'Total Transaksi': r.count, 'Total Nominal': r.jumlah
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(riwayatRows), 'Riwayat Transaksi');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kategoriRows), 'Ringkasan Kategori');
    const range = computeRange();
    const filename = `Laporan-DVpoint-${toISO(range.start)}_${toISO(range.end)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(dvT('lap.toast_export_sukses'));
  }

  // ============================================================
  // ---------- Export: PDF (via print dialog) ----------
  // ============================================================
  function exportPdf() {
    showToast(dvT('lap.toast_print'));
    setTimeout(() => window.print(), 400);
  }

  // ============================================================
  // ---------- Event bindings ----------
  // ============================================================
  el.periodChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.lap-chip');
    if (!chip) return;
    el.periodChips.querySelectorAll('.lap-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.period = chip.dataset.period;
    el.customRange.style.display = state.period === 'custom' ? 'flex' : 'none';
    if (state.period === 'custom' && !state.customFrom) {
      const now = new Date();
      state.customFrom = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
      state.customTo = toISO(now);
      el.fCustomFrom.value = state.customFrom;
      el.fCustomTo.value = state.customTo;
    }
    render();
  });

  el.fCustomFrom.addEventListener('change', () => { state.customFrom = el.fCustomFrom.value; render(); });
  el.fCustomTo.addEventListener('change', () => { state.customTo = el.fCustomTo.value; render(); });
  el.fAkun.addEventListener('change', () => { state.akun = el.fAkun.value; render(); });
  el.fKategori.addEventListener('change', () => { state.kategori = el.fKategori.value; render(); });
  el.fJenis.addEventListener('change', () => { state.jenis = el.fJenis.value; render(); });

  el.btnResetFilter.addEventListener('click', () => {
    state.period = 'hari-ini'; state.customFrom = ''; state.customTo = ''; state.akun = ''; state.kategori = ''; state.jenis = '';
    el.periodChips.querySelectorAll('.lap-chip').forEach(c => c.classList.toggle('active', c.dataset.period === 'hari-ini'));
    el.customRange.style.display = 'none';
    el.fAkun.value = ''; el.fKategori.value = ''; el.fJenis.value = '';
    render();
  });

  el.btnToggleFilter.addEventListener('click', () => {
    el.filterPanel.classList.toggle('collapsed');
    el.btnToggleFilter.classList.toggle('active');
  });

  el.btnExportPdf.addEventListener('click', exportPdf);
  el.btnExportExcel.addEventListener('click', exportExcel);
  el.btnPrint.addEventListener('click', () => window.print());

  // ---------- Init ----------
  dvBootstrapPage(() => {
    render();
    dvOnChange(render);
  });
})();