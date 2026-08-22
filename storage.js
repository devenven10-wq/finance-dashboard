// ============================================================
// DVpoint — Shared Data Layer (storage.js)
// ============================================================
// Semua transaksi, akun, dan tujuan keuangan disimpan di localStorage.
// Setiap halaman (Dashboard, Pemasukan, Pengeluaran, Semua Transaksi, dst)
// membaca/menulis dari sini, sehingga selalu satu sumber kebenaran (single
// source of truth). Setiap kali data berubah, dvNotifyChange() dipanggil
// supaya halaman yang sedang terbuka bisa langsung re-render tanpa refresh,
// dan tab/halaman lain ikut sinkron lewat event `storage` bawaan browser.
// ============================================================

const DVPOINT_TX_KEY = 'dvpoint_transaksi';
const DVPOINT_GOALS_KEY = 'dvpoint_tujuan';
const DVPOINT_AKUN_KEY = 'dvpoint_akun';
const DVPOINT_BUDGET_KEY = 'dvpoint_anggaran';
const DVPOINT_EVENT = 'dvpoint:datachanged';

// Daftar kategori & metode yang konsisten dipakai di seluruh app
const DV_KATEGORI = {
  masuk: ['Gaji', 'Bonus', 'Investasi', 'Hadiah', 'Freelance', 'Lainnya'],
  keluar: ['Makanan & Minuman', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Lainnya']
};
const DV_METODE = ['Cash', 'Transfer Bank', 'E-Wallet', 'Kartu Debit', 'Kartu Kredit'];
const DV_STATUS = ['Berhasil', 'Pending', 'Gagal'];

// Akun tempat transaksi tercatat (dipakai di dropdown "Akun", panel "Akun Saya",
// dan halaman "Akun & Kartu"). Sebelumnya statis, sekarang disimpan di
// localStorage supaya bisa ditambah/diedit/dihapus dari halaman Akun & Kartu.
// DV_AKUN tetap berupa array yang sama (mutate-in-place) agar semua kode lama
// yang memakai `DV_AKUN.find(...)` / `DV_AKUN.map(...)` tetap jalan tanpa ubah.
const DV_AKUN_DEFAULTS = [
  { id: 'cash', nama: 'Cash', jenis: 'Cash', bank: 'Cash', noRekening: '', warna: '#f5b342', icon: 'wallet', saldoAwal: 0, catatan: '', status: 'aktif' },
  { id: 'bca', nama: 'BCA', jenis: 'Bank', bank: 'BCA', noRekening: '', warna: '#4f7dff', icon: 'bank', saldoAwal: 0, catatan: '', status: 'aktif' },
  { id: 'dana', nama: 'DANA', jenis: 'E-Wallet', bank: 'DANA', noRekening: '', warna: '#2dd9a8', icon: 'wallet', saldoAwal: 0, catatan: '', status: 'aktif' },
  { id: 'ovo', nama: 'OVO', jenis: 'E-Wallet', bank: 'OVO', noRekening: '', warna: '#9f4dff', icon: 'wallet', saldoAwal: 0, catatan: '', status: 'aktif' }
];

const DV_AKUN = [];

function dvReadAkunRaw() {
  try {
    const list = JSON.parse(localStorage.getItem(DVPOINT_AKUN_KEY) || 'null');
    return Array.isArray(list) ? list : null;
  } catch (e) {
    return null;
  }
}

function dvWriteAkunRaw(list) {
  localStorage.setItem(DVPOINT_AKUN_KEY, JSON.stringify(list));
}

// Sinkronkan isi array DV_AKUN (in-memory) dengan yang tersimpan di localStorage.
// Dipanggil saat load pertama kali dan setiap kali data akun berubah.
function dvRefreshAkunMemory() {
  let list = dvReadAkunRaw();
  if (!list) {
    list = DV_AKUN_DEFAULTS.map(a => ({ ...a, createdAt: new Date().toISOString() }));
    dvWriteAkunRaw(list);
  }
  DV_AKUN.length = 0;
  list.forEach(a => DV_AKUN.push(a));
  return DV_AKUN;
}

dvRefreshAkunMemory();

// ---------- CRUD Akun & Kartu ----------
function dvGetAkunAll() {
  dvRefreshAkunMemory();
  return DV_AKUN.slice();
}

function dvAkunHasTransaksi(id) {
  return dvGetTransaksi().some(t => t.akun === id || t.akunAsal === id || t.akunTujuan === id);
}

function dvAddAkunAccount(data) {
  const list = dvReadAkunRaw() || [];
  const finalAkun = {
    id: 'akun_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    nama: data.nama,
    jenis: data.jenis || 'Bank',
    bank: data.bank || data.nama,
    noRekening: data.noRekening || '',
    warna: data.warna || '#4f7dff',
    icon: data.icon || 'bank',
    saldoAwal: Number(data.saldoAwal) || 0,
    catatan: data.catatan || '',
    status: 'aktif',
    createdAt: new Date().toISOString()
  };
  list.unshift(finalAkun);
  dvWriteAkunRaw(list);
  dvRefreshAkunMemory();
  dvNotifyChange();
  return finalAkun;
}

function dvUpdateAkunAccount(id, updates) {
  const list = dvReadAkunRaw() || [];
  const idx = list.findIndex(a => a.id === id);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    ...updates,
    saldoAwal: Number(updates.saldoAwal != null ? updates.saldoAwal : list[idx].saldoAwal) || 0
  };
  dvWriteAkunRaw(list);
  dvRefreshAkunMemory();
  dvNotifyChange();
  return list[idx];
}

function dvSetAkunStatus(id, status) {
  return dvUpdateAkunAccount(id, { status });
}

// Menghapus akun hanya diperbolehkan jika belum pernah dipakai di transaksi manapun.
function dvDeleteAkunAccount(id) {
  if (dvAkunHasTransaksi(id)) {
    return { success: false, reason: 'has_transactions' };
  }
  const list = (dvReadAkunRaw() || []).filter(a => a.id !== id);
  dvWriteAkunRaw(list);
  dvRefreshAkunMemory();
  dvNotifyChange();
  return { success: true };
}

// Total saldo awal seluruh akun (dipakai sebagai baseline saldo/total asset)
function dvGetTotalSaldoAwal() {
  return dvGetAkunAll().reduce((sum, a) => sum + (Number(a.saldoAwal) || 0), 0);
}

// Hitung saldo berjalan untuk satu akun: saldo awal + seluruh mutasi transaksi
function dvHitungSaldoAkun(akunId, list) {
  list = list || dvGetTransaksi();
  const akun = dvGetAkunAll().find(a => a.id === akunId);
  let saldo = akun ? (Number(akun.saldoAwal) || 0) : 0;
  list.forEach(t => {
    if (t.tipe === 'transfer') {
      if (t.akunAsal === akunId) saldo -= Number(t.jumlah) || 0;
      if (t.akunTujuan === akunId) saldo += Number(t.jumlah) || 0;
      return;
    }
    if (t.akun !== akunId) return;
    saldo += (t.tipe === 'masuk' ? 1 : -1) * (Number(t.jumlah) || 0);
  });
  return saldo;
}

// Ringkasan lengkap untuk satu akun (dipakai drawer detail di halaman Akun & Kartu)
function dvGetAkunDetail(akunId) {
  const akun = dvGetAkunAll().find(a => a.id === akunId);
  if (!akun) return null;
  const list = dvGetTransaksi();
  let masuk = 0, keluar = 0, transferMasuk = 0, transferKeluar = 0, jumlahTransaksi = 0;
  const riwayat = [];
  list.forEach(t => {
    if (t.tipe === 'transfer') {
      if (t.akunAsal === akunId) { transferKeluar += Number(t.jumlah) || 0; jumlahTransaksi++; riwayat.push(t); }
      else if (t.akunTujuan === akunId) { transferMasuk += Number(t.jumlah) || 0; jumlahTransaksi++; riwayat.push(t); }
      return;
    }
    if (t.akun !== akunId) return;
    jumlahTransaksi++;
    riwayat.push(t);
    if (t.tipe === 'masuk') masuk += Number(t.jumlah) || 0;
    else keluar += Number(t.jumlah) || 0;
  });
  return {
    akun,
    saldo: dvHitungSaldoAkun(akunId, list),
    totalMasuk: masuk,
    totalKeluar: keluar,
    totalTransferMasuk: transferMasuk,
    totalTransferKeluar: transferKeluar,
    jumlahTransaksi,
    riwayat: riwayat.sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
  };
}

const DV_KATEGORI_WARNA = {
  'Makanan & Minuman': '#4f7dff',
  'Transportasi': '#2dd9a8',
  'Belanja': '#9f4dff',
  'Tagihan': '#f5b342',
  'Hiburan': '#ef4d8f',
  'Gaji': '#2dd9a8',
  'Bonus': '#4f7dff',
  'Investasi': '#9f4dff',
  'Hadiah': '#f5b342',
  'Freelance': '#ef4d8f',
  'Lainnya': '#8a86a8'
};

// ---------- Notifikasi perubahan data (sinkronisasi real-time) ----------
function dvNotifyChange() {
  window.dispatchEvent(new CustomEvent(DVPOINT_EVENT));
}

// Panggil callback setiap kali data berubah — baik di tab ini (custom event)
// maupun di tab lain (storage event bawaan browser).
function dvOnChange(callback) {
  window.addEventListener(DVPOINT_EVENT, callback);
  window.addEventListener('storage', (e) => {
    if (e.key === DVPOINT_TX_KEY || e.key === DVPOINT_GOALS_KEY || e.key === DVPOINT_AKUN_KEY || e.key === DVPOINT_BUDGET_KEY) callback();
  });
}

// ---------- Transaksi ----------
function dvGetTransaksi() {
  try {
    const list = JSON.parse(localStorage.getItem(DVPOINT_TX_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function dvSaveTransaksi(list) {
  localStorage.setItem(DVPOINT_TX_KEY, JSON.stringify(list));
  dvNotifyChange();
}

function dvAddTransaksi(trx) {
  const list = dvGetTransaksi();
  const finalTrx = {
    id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    tanggal: trx.tanggal,
    deskripsi: trx.deskripsi || trx.kategori,
    kategori: trx.kategori,
    metode: trx.metode || 'Cash',
    akun: trx.akun || 'cash',
    tipe: trx.tipe, // 'masuk' | 'keluar'
    jumlah: Number(trx.jumlah) || 0,
    catatan: trx.catatan || '',
    status: trx.status || 'Berhasil'
  };
  list.unshift(finalTrx);
  dvSaveTransaksi(list);
  return finalTrx;
}

function dvDeleteTransaksi(id) {
  const list = dvGetTransaksi().filter(t => t.id !== id);
  dvSaveTransaksi(list);
}

function dvUpdateTransaksi(id, updates) {
  const list = dvGetTransaksi();
  const idx = list.findIndex(t => t.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates, jumlah: Number(updates.jumlah != null ? updates.jumlah : list[idx].jumlah) || 0 };
  dvSaveTransaksi(list);
  return list[idx];
}

function dvDuplicateTransaksi(id) {
  const list = dvGetTransaksi();
  const src = list.find(t => t.id === id);
  if (!src) return null;
  const copy = { ...src, id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), tanggal: dvTodayISO() };
  list.unshift(copy);
  dvSaveTransaksi(list);
  return copy;
}

// ---------- Transfer antar akun ----------
// Transfer disimpan sebagai satu entri transaksi dengan tipe:'transfer' dan
// dua akun (akunAsal, akunTujuan). Tidak memengaruhi total pemasukan/pengeluaran,
// tapi memindahkan saldo antar akun (lihat dvGetAkunList).
function dvAddTransfer(trf) {
  const list = dvGetTransaksi();
  const asal = DV_AKUN.find(a => a.id === trf.akunAsal);
  const tujuan = DV_AKUN.find(a => a.id === trf.akunTujuan);
  const finalTrf = {
    id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    tanggal: trf.tanggal || dvTodayISO(),
    deskripsi: trf.catatan || `Transfer ${asal ? asal.nama : trf.akunAsal} → ${tujuan ? tujuan.nama : trf.akunTujuan}`,
    kategori: 'Transfer',
    metode: 'Transfer Antar Akun',
    akun: trf.akunAsal,
    akunAsal: trf.akunAsal,
    akunTujuan: trf.akunTujuan,
    tipe: 'transfer',
    jumlah: Number(trf.jumlah) || 0,
    catatan: trf.catatan || '',
    status: trf.status || 'Berhasil'
  };
  list.unshift(finalTrf);
  dvSaveTransaksi(list);
  return finalTrf;
}

// ---------- Format helper ----------
function dvFormatRupiah(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  return sign + 'Rp' + Math.abs(Math.round(num)).toLocaleString('id-ID');
}

// ---------- Format nominal saat input (live thousand-separator "5.000.000") ----------
// Dipakai pada field nominal bertipe text (bukan number) supaya pengguna langsung
// melihat format Rupiah saat mengetik, tanpa mengubah nilai aslinya (angka murni).
// Dipakai bersama di semua halaman: Akun, Anggaran, Tujuan, Pemasukan/Pengeluaran,
// Semua Transaksi, Transfer, dan Investasi.
function dvFormatRibuan(value) {
  const digits = String(value == null ? '' : value).replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('id-ID');
}

function dvParseRibuan(str) {
  const digits = String(str == null ? '' : str).replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

// Pasang live-formatting ke satu <input type="text">: setiap kali pengguna
// mengetik, tampilan otomatis dirapikan jadi "5.000.000" (titik tiap ribuan).
function dvAttachRibuanInput(el) {
  if (!el || el.dataset.ribuanAttached) return;
  el.dataset.ribuanAttached = '1';
  el.addEventListener('input', () => {
    el.value = dvFormatRibuan(el.value);
  });
}

function dvFormatTanggal(iso) {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function dvTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ---------- Ringkasan total: saldo, uang masuk, uang keluar, profit ----------
function dvGetSummary(list) {
  list = list || dvGetTransaksi();
  let masuk = 0, keluar = 0, transfer = 0, transferCount = 0;
  list.forEach(t => {
    if (t.tipe === 'masuk') masuk += Number(t.jumlah) || 0;
    else if (t.tipe === 'transfer') { transfer += Number(t.jumlah) || 0; transferCount++; }
    else keluar += Number(t.jumlah) || 0;
  });
  const saldoAwalTotal = dvGetTotalSaldoAwal();
  return {
    totalMasuk: masuk,
    totalKeluar: keluar,
    totalTransfer: transfer,
    transferCount: transferCount,
    saldo: masuk - keluar + saldoAwalTotal,
    profit: masuk - keluar,
    jumlahTransaksi: list.length,
    rataRata: list.length ? (masuk + keluar) / list.length : 0
  };
}

// ---------- Cash flow 6 bulan terakhir (chart utama dashboard) ----------
function dvGetCashflow6Bulan(list) {
  list = list || dvGetTransaksi();
  const bulanLabel = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const now = new Date();
  const buckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), label: bulanLabel[d.getMonth()], masuk: 0, keluar: 0 });
  }
  list.forEach(t => {
    const d = new Date(t.tanggal + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    const b = buckets.find(x => x.year === d.getFullYear() && x.month === d.getMonth());
    if (!b) return;
    if (t.tipe === 'masuk') b.masuk += Number(t.jumlah) || 0;
    else if (t.tipe === 'keluar') b.keluar += Number(t.jumlah) || 0;
    // transfer antar akun tidak memengaruhi cashflow masuk/keluar
  });
  return buckets.map(b => ({
    label: b.label,
    masuk: b.masuk,
    keluar: b.keluar,
    profit: b.masuk - b.keluar
  }));
}

// ---------- Statistik bulanan gabungan (jumlah transaksi & transfer, 6 bulan) ----------
// Dipakai oleh halaman Semua Transaksi untuk sparkline & persentase perubahan
// pada card "Total Transaksi" dan "Total Transfer".
function dvGetMonthlyStats(list) {
  list = list || dvGetTransaksi();
  const bulanLabel = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const now = new Date();
  const buckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth(), label: bulanLabel[d.getMonth()], count: 0, masuk: 0, keluar: 0, transfer: 0, transferCount: 0 });
  }
  list.forEach(t => {
    const d = new Date(t.tanggal + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    const b = buckets.find(x => x.year === d.getFullYear() && x.month === d.getMonth());
    if (!b) return;
    b.count++;
    if (t.tipe === 'masuk') b.masuk += Number(t.jumlah) || 0;
    else if (t.tipe === 'keluar') b.keluar += Number(t.jumlah) || 0;
    else if (t.tipe === 'transfer') { b.transfer += Number(t.jumlah) || 0; b.transferCount++; }
  });
  return buckets;
}

// ---------- Perubahan bulan-ke-bulan untuk 4 KPI card ----------
// Mengembalikan { value, pct, trend:'up'|'down'|'flat' } untuk masing-masing KPI,
// dibandingkan dengan bulan sebelumnya (dipakai untuk label "X% dari bulan lalu").
function dvGetKpiChanges(list) {
  list = list || dvGetTransaksi();
  const cf = dvGetCashflow6Bulan(list);
  const thisMonth = cf[cf.length - 1];
  const lastMonth = cf[cf.length - 2] || { masuk: 0, keluar: 0, profit: 0 };

  function pctOf(now, prev) {
    if (!prev) return now > 0 ? 100 : (now < 0 ? -100 : 0);
    return ((now - prev) / Math.abs(prev)) * 100;
  }

  const summary = dvGetSummary(list);
  const saldoAwalBulan = summary.saldo - thisMonth.profit;

  return {
    saldo: { pct: pctOf(summary.saldo, saldoAwalBulan) },
    masuk: { pct: pctOf(thisMonth.masuk, lastMonth.masuk) },
    keluar: { pct: pctOf(thisMonth.keluar, lastMonth.keluar) },
    profit: { pct: pctOf(thisMonth.profit, lastMonth.profit) }
  };
}

// ---------- Data seri mini sparkline (6 titik, satu per bulan) ----------
function dvGetSparklines(list) {
  list = list || dvGetTransaksi();
  const cf = dvGetCashflow6Bulan(list);
  const summary = dvGetSummary(list);

  // Saldo kumulatif: mundur dari saldo saat ini, dikurangi profit tiap bulan
  const saldoSeries = new Array(cf.length);
  saldoSeries[cf.length - 1] = summary.saldo;
  for (let i = cf.length - 2; i >= 0; i--) {
    saldoSeries[i] = saldoSeries[i + 1] - cf[i + 1].profit;
  }

  return {
    saldo: saldoSeries,
    masuk: cf.map(b => b.masuk),
    keluar: cf.map(b => b.keluar),
    profit: cf.map(b => b.profit)
  };
}

// ---------- Pengeluaran per kategori untuk bulan berjalan (donut chart) ----------
function dvGetPengeluaranPerKategori(list) {
  list = list || dvGetTransaksi();
  const now = new Date();
  const map = {};
  let total = 0;
  list.forEach(t => {
    if (t.tipe !== 'keluar') return;
    const d = new Date(t.tanggal + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return;
    map[t.kategori] = (map[t.kategori] || 0) + (Number(t.jumlah) || 0);
    total += Number(t.jumlah) || 0;
  });
  const rows = Object.keys(map).map(k => ({
    kategori: k,
    jumlah: map[k],
    pct: total ? Math.round((map[k] / total) * 100) : 0,
    warna: DV_KATEGORI_WARNA[k] || '#8a86a8'
  })).sort((a, b) => b.jumlah - a.jumlah);
  return { total, rows };
}

// ---------- Akun Saya: saldo per akun dihitung dari saldo awal + seluruh transaksi ----------
function dvGetAkunList(list) {
  list = list || dvGetTransaksi();
  return dvGetAkunAll()
    .filter(a => a.status !== 'nonaktif')
    .filter(a => (Number(a.saldoAwal) || 0) !== 0 || list.some(t => t.akun === a.id || t.akunAsal === a.id || t.akunTujuan === a.id))
    .map(a => ({ ...a, saldo: dvHitungSaldoAkun(a.id, list) }));
}

// ---------- Ringkasan Hari Ini / Bulan Ini untuk halaman Pemasukan & Pengeluaran ----------
function dvGetRingkasanTipe(tipe, list) {
  list = (list || dvGetTransaksi()).filter(t => t.tipe === tipe);
  const todayISO = dvTodayISO();
  const now = new Date();
  let totalHariIni = 0, totalBulanIni = 0;
  list.forEach(t => {
    const d = new Date(t.tanggal + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    if (t.tanggal === todayISO) totalHariIni += Number(t.jumlah) || 0;
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) totalBulanIni += Number(t.jumlah) || 0;
  });
  return { totalHariIni, totalBulanIni, jumlahTransaksi: list.length, list };
}

// ============================================================
// ---------- Tujuan Keuangan (Financial Goals) ----------
// Modul MANDIRI: target keuangan yang diinput & diperbarui manual oleh
// pengguna (mis. beli laptop, dana darurat, liburan). TIDAK ada perhitungan
// otomatis dari transaksi Pemasukan/Pengeluaran/Transfer, dan TIDAK
// memengaruhi Dashboard, saldo akun, atau laporan. "Dana Terkumpul" hanya
// bertambah lewat aksi "Tambah Progress" yang dicatat pengguna sendiri.
// ============================================================
const DV_TUJUAN_STATUS = ['Aktif', 'Hampir Tercapai', 'Selesai', 'Dibatalkan'];
const DV_TUJUAN_KATEGORI = ['Elektronik', 'Kendaraan', 'Rumah', 'Liburan', 'Dana Darurat', 'Pendidikan', 'Pernikahan', 'Lainnya'];
const DV_TUJUAN_PRIORITAS = ['Tinggi', 'Sedang', 'Rendah'];

function dvGetTujuan() {
  try {
    const list = JSON.parse(localStorage.getItem(DVPOINT_GOALS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function dvSaveTujuan(list) {
  localStorage.setItem(DVPOINT_GOALS_KEY, JSON.stringify(list));
  dvNotifyChange();
}

function dvAddTujuan(goal) {
  const list = dvGetTujuan();
  const danaAwal = Number(goal.terkumpul || goal.danaAwal) || 0;
  const target = Number(goal.target) || 0;
  const finalGoal = {
    id: 'goal_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    nama: goal.nama,
    kategori: DV_TUJUAN_KATEGORI.includes(goal.kategori) ? goal.kategori : 'Lainnya',
    target: target,
    terkumpul: danaAwal,
    targetTanggal: goal.targetTanggal || '',
    prioritas: DV_TUJUAN_PRIORITAS.includes(goal.prioritas) ? goal.prioritas : 'Sedang',
    warna: goal.warna || '#4f7dff',
    icon: goal.icon || 'target',
    catatan: goal.catatan || '',
    status: dvHitungStatusTujuan(danaAwal, target, 'Aktif'),
    arsip: false,
    createdAt: new Date().toISOString(),
    riwayat: danaAwal > 0 ? [{
      id: 'prog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      nominal: danaAwal,
      tanggal: dvTodayISO(),
      catatan: 'Dana awal'
    }] : []
  };
  list.unshift(finalGoal);
  dvSaveTujuan(list);
  return finalGoal;
}

function dvUpdateTujuan(id, updates) {
  const list = dvGetTujuan();
  const idx = list.findIndex(g => g.id === id);
  if (idx === -1) return null;
  const merged = { ...list[idx], ...updates };
  if (updates.target != null) merged.target = Number(updates.target) || 0;
  if (updates.terkumpul != null) merged.terkumpul = Number(updates.terkumpul) || 0;
  if (updates.kategori && !DV_TUJUAN_KATEGORI.includes(updates.kategori)) merged.kategori = list[idx].kategori;
  if (updates.prioritas && !DV_TUJUAN_PRIORITAS.includes(updates.prioritas)) merged.prioritas = list[idx].prioritas;
  if (updates.status && !DV_TUJUAN_STATUS.includes(updates.status)) merged.status = list[idx].status;
  list[idx] = merged;
  dvSaveTujuan(list);
  return list[idx];
}

// Arsipkan / kembalikan dari arsip — hanya menyembunyikan dari daftar utama,
// bukan penghapusan, dan tidak mengubah field `status`.
function dvSetTujuanArsip(id, arsip) {
  return dvUpdateTujuan(id, { arsip: !!arsip });
}

function dvDeleteTujuan(id) {
  const list = dvGetTujuan().filter(g => g.id !== id);
  dvSaveTujuan(list);
}

// Tentukan status otomatis berdasarkan progress, tapi tidak pernah menimpa
// status manual 'Dibatalkan' yang sudah dipilih pengguna.
function dvHitungStatusTujuan(terkumpul, target, statusSaatIni) {
  if (statusSaatIni === 'Dibatalkan') return 'Dibatalkan';
  if (target > 0 && terkumpul >= target) return 'Selesai';
  if (target > 0 && terkumpul / target >= 0.8) return 'Hampir Tercapai';
  return 'Aktif';
}

// Tambah Progress: menambah dana terkumpul + mencatat riwayat + auto-update status.
// Efeknya murni lokal pada satu tujuan — tidak menyentuh transaksi/akun/dashboard.
function dvAddTujuanProgress(id, entry) {
  const list = dvGetTujuan();
  const idx = list.findIndex(g => g.id === id);
  if (idx === -1) return null;
  const goal = list[idx];
  const nominal = Number(entry.nominal) || 0;
  const progressEntry = {
    id: 'prog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    nominal,
    tanggal: entry.tanggal || dvTodayISO(),
    catatan: entry.catatan || ''
  };
  goal.riwayat = Array.isArray(goal.riwayat) ? goal.riwayat : [];
  goal.riwayat.unshift(progressEntry);
  goal.terkumpul = (Number(goal.terkumpul) || 0) + nominal;
  goal.status = dvHitungStatusTujuan(goal.terkumpul, Number(goal.target) || 0, goal.status);
  list[idx] = goal;
  dvSaveTujuan(list);
  return goal;
}

// Ringkasan 4 KPI di puncak halaman Tujuan Keuangan — murni data modul ini,
// tidak berasal dari transaksi/saldo akun.
function dvGetTujuanSummary() {
  const list = dvGetTujuan().filter(g => !g.arsip);
  const totalTarget = list.reduce((sum, g) => sum + (Number(g.target) || 0), 0);
  const totalTerkumpul = list.reduce((sum, g) => sum + (Number(g.terkumpul) || 0), 0);
  const targetAktif = list.filter(g => g.status === 'Aktif' || g.status === 'Hampir Tercapai').length;
  const targetSelesai = list.filter(g => g.status === 'Selesai').length;
  return { totalTarget, totalTerkumpul, targetAktif, targetSelesai, jumlahTujuan: list.length };
}

// ============================================================
// ---------- Anggaran (Financial Planning) ----------
// Modul MANDIRI: murni rencana anggaran yang diinput manual oleh pengguna.
// TIDAK ada perhitungan otomatis dari transaksi Pengeluaran/Pemasukan/Transfer,
// dan TIDAK memengaruhi ringkasan Dashboard sama sekali. Anggaran di sini
// hanya menyimpan & menampilkan data yang dimasukkan sendiri oleh pengguna
// (nama, kategori, nominal, periode, tanggal mulai/selesai, status, catatan).
// ============================================================
const DV_ANGGARAN_STATUS = ['Aktif', 'Selesai', 'Ditunda', 'Dibatalkan'];

function dvGetAnggaranAll() {
  try {
    const list = JSON.parse(localStorage.getItem(DVPOINT_BUDGET_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function dvSaveAnggaranAll(list) {
  localStorage.setItem(DVPOINT_BUDGET_KEY, JSON.stringify(list));
  dvNotifyChange();
}

function dvAddAnggaran(data) {
  const list = dvGetAnggaranAll();
  const finalAnggaran = {
    id: 'ang_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    nama: data.nama,
    kategori: data.kategori,
    nominal: Number(data.nominal) || 0,
    periode: data.periode === 'tahunan' ? 'tahunan' : 'bulanan',
    tanggalMulai: data.tanggalMulai || '',
    tanggalSelesai: data.tanggalSelesai || '',
    status: DV_ANGGARAN_STATUS.includes(data.status) ? data.status : 'Aktif',
    catatan: data.catatan || '',
    arsip: false,
    createdAt: new Date().toISOString()
  };
  list.unshift(finalAnggaran);
  dvSaveAnggaranAll(list);
  return finalAnggaran;
}

function dvUpdateAnggaran(id, updates) {
  const list = dvGetAnggaranAll();
  const idx = list.findIndex(a => a.id === id);
  if (idx === -1) return null;
  const merged = { ...list[idx], ...updates };
  merged.nominal = Number(updates.nominal != null ? updates.nominal : list[idx].nominal) || 0;
  merged.periode = (updates.periode || list[idx].periode) === 'tahunan' ? 'tahunan' : 'bulanan';
  if (updates.status && !DV_ANGGARAN_STATUS.includes(updates.status)) merged.status = list[idx].status;
  list[idx] = merged;
  dvSaveAnggaranAll(list);
  return list[idx];
}

// Arsipkan / kembalikan dari arsip. Hanya menyembunyikan dari tampilan utama
// secara default — bukan penghapusan, dan tidak mengubah field `status`.
function dvSetAnggaranArsip(id, arsip) {
  return dvUpdateAnggaran(id, { arsip: !!arsip });
}

function dvDeleteAnggaran(id) {
  const list = dvGetAnggaranAll().filter(a => a.id !== id);
  dvSaveAnggaranAll(list);
}

// Ringkasan 4 KPI di puncak halaman Anggaran — murni menghitung data
// Anggaran itu sendiri (bukan transaksi): Total Anggaran (jumlah nominal
// seluruh rencana), Total Rencana Aktif, Total Rencana Selesai, Jumlah Anggaran.
function dvGetAnggaranSummary() {
  const list = dvGetAnggaranAll();
  const totalNominal = list.reduce((sum, a) => sum + (Number(a.nominal) || 0), 0);
  const totalAktif = list.filter(a => a.status === 'Aktif').length;
  const totalSelesai = list.filter(a => a.status === 'Selesai').length;
  return {
    totalNominal,
    totalAktif,
    totalSelesai,
    jumlahAnggaran: list.length
  };
}

// ============================================================
// ---------- Investasi (Investment Portfolio) ----------
// Modul MANDIRI SEPENUHNYA: seluruh data (nama aset, jenis, modal awal,
// nilai saat ini, riwayat update nilai, status) diinput & diperbarui manual
// oleh pengguna. TIDAK ada perhitungan otomatis dari transaksi Pemasukan/
// Pengeluaran/Transfer, TIDAK mengubah saldo akun, dan TIDAK memengaruhi
// Dashboard, Anggaran, Tujuan Keuangan, maupun Laporan.
// ============================================================
const DVPOINT_INVEST_KEY = 'dvpoint_investasi';
const DV_INVEST_JENIS = ['Saham', 'Reksa Dana', 'Obligasi', 'Crypto', 'Emas', 'Properti', 'Deposito', 'Lainnya'];
const DV_INVEST_STATUS = ['Aktif', 'Dijual', 'Ditutup', 'Arsip'];
const DV_INVEST_ICON = {
  'Saham': 'trending-up',
  'Reksa Dana': 'pie-chart',
  'Obligasi': 'file-text',
  'Crypto': 'bitcoin',
  'Emas': 'gem',
  'Properti': 'home',
  'Deposito': 'landmark',
  'Lainnya': 'briefcase'
};
const DV_INVEST_WARNA = {
  'Saham': '#4f7dff',
  'Reksa Dana': '#2dd9a8',
  'Obligasi': '#f5b342',
  'Crypto': '#9f4dff',
  'Emas': '#f5b342',
  'Properti': '#ef4d8f',
  'Deposito': '#2dd9a8',
  'Lainnya': '#8a86a8'
};

function dvGetInvestasiAll() {
  try {
    const list = JSON.parse(localStorage.getItem(DVPOINT_INVEST_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function dvSaveInvestasiAll(list) {
  localStorage.setItem(DVPOINT_INVEST_KEY, JSON.stringify(list));
  dvNotifyChange();
}

function dvAddInvestasi(data) {
  const list = dvGetInvestasiAll();
  const modalAwal = Number(data.modalAwal) || 0;
  const nilaiSaatIni = data.nilaiSaatIni != null && data.nilaiSaatIni !== '' ? Number(data.nilaiSaatIni) || 0 : modalAwal;
  const finalInvest = {
    id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    nama: data.nama,
    jenis: DV_INVEST_JENIS.includes(data.jenis) ? data.jenis : 'Lainnya',
    modalAwal,
    nilaiSaatIni,
    tanggalInvestasi: data.tanggalInvestasi || dvTodayISO(),
    platform: data.platform || '',
    status: DV_INVEST_STATUS.includes(data.status) ? data.status : 'Aktif',
    catatan: data.catatan || '',
    arsip: false,
    createdAt: new Date().toISOString(),
    riwayat: [{
      id: 'rh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      nilai: nilaiSaatIni,
      tanggal: data.tanggalInvestasi || dvTodayISO(),
      catatan: 'Nilai awal saat investasi dibuat'
    }]
  };
  list.unshift(finalInvest);
  dvSaveInvestasiAll(list);
  return finalInvest;
}

function dvUpdateInvestasi(id, updates) {
  const list = dvGetInvestasiAll();
  const idx = list.findIndex(i => i.id === id);
  if (idx === -1) return null;
  const merged = { ...list[idx], ...updates };
  if (updates.modalAwal != null) merged.modalAwal = Number(updates.modalAwal) || 0;
  if (updates.nilaiSaatIni != null) merged.nilaiSaatIni = Number(updates.nilaiSaatIni) || 0;
  if (updates.jenis && !DV_INVEST_JENIS.includes(updates.jenis)) merged.jenis = list[idx].jenis;
  if (updates.status && !DV_INVEST_STATUS.includes(updates.status)) merged.status = list[idx].status;
  list[idx] = merged;
  dvSaveInvestasiAll(list);
  return list[idx];
}

// Update Nilai: mencatat nilai terbaru + menyimpan ke riwayat perubahan nilai.
// Hanya berlaku pada modul Investasi — tidak menyentuh saldo akun/transaksi.
function dvUpdateInvestasiNilai(id, entry) {
  const list = dvGetInvestasiAll();
  const idx = list.findIndex(i => i.id === id);
  if (idx === -1) return null;
  const inv = list[idx];
  const nilai = Number(entry.nilai) || 0;
  const riwayatEntry = {
    id: 'rh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    nilai,
    tanggal: entry.tanggal || dvTodayISO(),
    catatan: entry.catatan || ''
  };
  inv.riwayat = Array.isArray(inv.riwayat) ? inv.riwayat : [];
  inv.riwayat.unshift(riwayatEntry);
  inv.nilaiSaatIni = nilai;
  list[idx] = inv;
  dvSaveInvestasiAll(list);
  return inv;
}

function dvSetInvestasiArsip(id, arsip) {
  return dvUpdateInvestasi(id, { arsip: !!arsip, status: arsip ? 'Arsip' : 'Aktif' });
}

function dvDeleteInvestasi(id) {
  const list = dvGetInvestasiAll().filter(i => i.id !== id);
  dvSaveInvestasiAll(list);
}

// Ringkasan 4 KPI di puncak halaman Investasi — murni data modul ini.
function dvGetInvestasiSummary() {
  const list = dvGetInvestasiAll();
  const totalModal = list.reduce((sum, i) => sum + (Number(i.modalAwal) || 0), 0);
  const totalNilai = list.reduce((sum, i) => sum + (Number(i.nilaiSaatIni) || 0), 0);
  const investasiAktif = list.filter(i => i.status === 'Aktif').length;
  return {
    totalModal,
    totalNilai,
    jumlahAset: list.length,
    investasiAktif
  };
}
// ============================================================
// ---------- Toast generik (untuk halaman yang belum punya
// toast sendiri: Pemasukan, Pengeluaran, Transfer, Semua Transaksi) ----------
// ============================================================
let dvGenericToastTimer = null;
function dvShowGenericToast(msg, isError) {
  const toast = document.getElementById('dvGenericToast');
  const msgEl = document.getElementById('dvGenericToastMsg');
  if (!toast || !msgEl) return;
  msgEl.textContent = msg;
  toast.classList.toggle('error', !!isError);
  toast.classList.add('show');
  clearTimeout(dvGenericToastTimer);
  dvGenericToastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ============================================================
// ---------- Modal konfirmasi generik (pengganti confirm() bawaan
// browser) — dibuat & di-inject otomatis, tidak perlu markup HTML
// per halaman. Dipakai lewat: dvShowConfirm(pesan, onConfirm, opts)
// opts.danger = true untuk aksi berbahaya (hapus), styling jadi merah.
// ============================================================
function dvShowConfirm(message, onConfirm, opts) {
  opts = opts || {};
  const danger = !!opts.danger;

  let overlay = document.getElementById('dvConfirmOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'dv-confirm-overlay';
    overlay.id = 'dvConfirmOverlay';
    overlay.innerHTML =
      '<div class="dv-confirm-box" id="dvConfirmBox">' +
        '<div class="dv-confirm-icon" id="dvConfirmIcon"></div>' +
        '<div class="dv-confirm-title" id="dvConfirmTitle"></div>' +
        '<div class="dv-confirm-text" id="dvConfirmText"></div>' +
        '<div class="dv-confirm-actions">' +
          '<button class="dv-confirm-cancel" id="dvConfirmCancelBtn" type="button"></button>' +
          '<button class="dv-confirm-ok" id="dvConfirmOkBtn" type="button"></button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  const box = document.getElementById('dvConfirmBox');
  const iconEl = document.getElementById('dvConfirmIcon');
  const titleEl = document.getElementById('dvConfirmTitle');
  const textEl = document.getElementById('dvConfirmText');

  box.classList.toggle('danger', danger);
  titleEl.textContent = opts.title || dvT(danger ? 'common.konfirmasi_hapus_title' : 'common.konfirmasi_title');
  textEl.textContent = message;
  iconEl.innerHTML = danger
    ? '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"></path></svg>'
    : '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>';

  function close() {
    overlay.classList.remove('open');
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  // Ganti tombol dengan clone supaya event listener lama tidak menumpuk
  // setiap kali dvShowConfirm dipanggil ulang.
  const oldOk = document.getElementById('dvConfirmOkBtn');
  const oldCancel = document.getElementById('dvConfirmCancelBtn');
  const okBtn = oldOk.cloneNode(true);
  const cancelBtn = oldCancel.cloneNode(true);
  oldOk.parentNode.replaceChild(okBtn, oldOk);
  oldCancel.parentNode.replaceChild(cancelBtn, oldCancel);

  okBtn.textContent = opts.okLabel || dvT(danger ? 'common.ya_hapus' : 'common.ya_lanjutkan');
  cancelBtn.textContent = opts.cancelLabel || dvT('common.batal');

  okBtn.addEventListener('click', () => { close(); onConfirm(); });
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  requestAnimationFrame(() => overlay.classList.add('open'));
}

// ============================================================
// ---------- Tim & Role (dvGetMembers, dll) ----------
// ⚠️ CATATAN PENTING: Ini BARU implementasi UI/struktur data lokal
// (localStorage), BUKAN sistem akun multi-user yang sesungguhnya.
// Member yang "ditambahkan" di sini hanya tersimpan di browser
// perangkat ini — orang yang bersangkutan TIDAK BISA login dari
// device-nya sendiri sampai aplikasi ini terhubung ke backend
// beneran (rencana: migrasi ke Supabase). Struktur data & UI di sini
// sengaja dibuat supaya nanti tinggal diganti sumber datanya dari
// localStorage ke API call, tanpa perlu desain ulang.
// ============================================================
const DVPOINT_MEMBERS_KEY = 'dvpoint_members';

function dvGetMembers() {
  try {
    const raw = JSON.parse(localStorage.getItem(DVPOINT_MEMBERS_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function dvAddMember(data) {
  const list = dvGetMembers();
  const member = {
    id: 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    nama: data.nama || '',
    email: data.email || '',
    // ⚠️ PERINGATAN KEAMANAN: password di sini TERSIMPAN POLOS (plaintext) di
    // localStorage — ini HANYA placeholder struktur data untuk sekarang, BUKAN
    // cara penyimpanan password yang aman/layak produksi. Kolom ini hanya
    // dikumpulkan supaya bentuk formnya sudah pas dengan alur signup Supabase
    // Auth nanti (email + password), yang akan meng-hash password dengan
    // benar di sisi server. JANGAN PERNAH menganggap password di sini aman
    // atau menyimpan password asli/penting pengguna di sini.
    passwordPlaceholder: data.password || '',
    role: 'member', // hanya 'member' — role 'owner' cuma satu, dari profil pemilik device
    status: 'aktif',
    ditambahkanPada: new Date().toISOString()
  };
  list.push(member);
  localStorage.setItem(DVPOINT_MEMBERS_KEY, JSON.stringify(list));
  dvNotifyChange();
  return member;
}

function dvDeleteMember(id) {
  const list = dvGetMembers().filter(m => m.id !== id);
  localStorage.setItem(DVPOINT_MEMBERS_KEY, JSON.stringify(list));
  dvNotifyChange();
}

function dvToggleMemberStatus(id) {
  const list = dvGetMembers();
  const m = list.find(x => x.id === id);
  if (!m) return;
  m.status = m.status === 'aktif' ? 'nonaktif' : 'aktif';
  localStorage.setItem(DVPOINT_MEMBERS_KEY, JSON.stringify(list));
  dvNotifyChange();
}

// Apakah pengguna device ini adalah Owner? Dipakai buat gating menu Tim.
function dvIsOwner() {
  const p = dvGetProfile();
  return !p.role || p.role === 'owner'; // default owner kalau field belum ada (kompatibel data lama)
}