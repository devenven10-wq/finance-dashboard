// ============================================================
// DVpoint — Shared Data Layer (storage.js)
// ============================================================
// ⚠️ PERUBAHAN BESAR: sekarang tersambung ke Supabase (database
// sungguhan), BUKAN lagi localStorage. Pola yang dipakai:
//
// 1. Begitu halaman dimuat, dvInitData() (async) narik SEMUA data
//    milik user yang sedang login dari Supabase, lalu disimpan di
//    array in-memory (DV_AKUN, DV_TRANSAKSI) — sama seperti pola
//    DV_AKUN yang sudah ada sebelumnya, cuma sumbernya sekarang
//    Supabase, bukan localStorage.
// 2. Fungsi BACA data (dvGetAkunAll, dvGetTransaksi, dst) tetap
//    SINKRON seperti sebelumnya — cukup baca dari cache in-memory
//    itu. Jadi kode di halaman lain (dashboard.js, akun.js, dst)
//    yang cuma BACA data tidak perlu diubah sama sekali.
// 3. Fungsi TULIS data (dvAddTransaksi, dvUpdateAkunAccount, dst)
//    sekarang ASYNC (harus dipanggil pakai `await`) karena perlu
//    kirim ke server Supabase lewat internet, tidak bisa instan.
//
// Setiap tabel di Supabase sudah dilindungi Row Level Security —
// query otomatis cuma kembalikan data milik user yang sedang login,
// tidak perlu filter user_id manual di sisi sini (tapi tetap kita
// sertakan saat INSERT, karena RLS mewajibkan itu).
// ============================================================

const DVPOINT_EVENT = 'dvpoint:datachanged';

// Daftar kategori & metode yang konsisten dipakai di seluruh app
const DV_KATEGORI = {
  masuk: ['Gaji', 'Bonus', 'Investasi', 'Hadiah', 'Freelance', 'Lainnya'],
  keluar: ['Makanan & Minuman', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Lainnya']
};
const DV_METODE = ['Cash', 'Transfer Bank', 'E-Wallet', 'Kartu Debit', 'Kartu Kredit'];
const DV_STATUS = ['Berhasil', 'Pending', 'Gagal'];

// Cache in-memory — diisi oleh dvInitData() saat halaman dimuat.
// Array yang SAMA (mutate-in-place) supaya kode lama yang langsung
// pakai `DV_AKUN.find(...)` / `.map(...)` tetap jalan tanpa ubah.
const DV_AKUN = [];
const DV_TRANSAKSI = [];
const DV_TUJUAN = [];
const DV_ANGGARAN = [];
const DV_INVESTASI = [];

let dvDataReady = false;
let dvDataReadyPromise = null;

// Ambil ID user yang sedang login. guard.js sudah men-set
// window.dvCurrentUser di awal load halaman; ini fallback kalau
// dipanggil sebelum guard.js sempat jalan.
async function dvGetUserId() {
  if (window.dvCurrentUser) return window.dvCurrentUser.id;
  const { data } = await dvSupabase.auth.getUser();
  window.dvCurrentUser = data?.user || null;
  return data?.user?.id || null;
}

// ---------- Konversi baris Supabase (snake_case) <-> format app (camelCase) ----------
function dvAccountRowToApp(row) {
  return {
    id: row.id,
    nama: row.nama,
    jenis: row.jenis,
    bank: row.bank,
    noRekening: row.no_rekening || '',
    warna: row.warna,
    icon: row.icon,
    saldoAwal: Number(row.saldo_awal) || 0,
    catatan: row.catatan || '',
    status: row.status,
    createdAt: row.created_at
  };
}

function dvTrxRowToApp(row) {
  return {
    id: row.id,
    tanggal: row.tanggal,
    deskripsi: row.deskripsi || '',
    kategori: row.kategori,
    metode: row.metode,
    akun: row.akun_id,
    akunAsal: row.akun_asal_id,
    akunTujuan: row.akun_tujuan_id,
    tipe: row.tipe,
    jumlah: Number(row.jumlah) || 0,
    catatan: row.catatan || '',
    status: row.status
  };
}

function dvGoalRowToApp(row) {
  return {
    id: row.id,
    nama: row.nama,
    kategori: row.kategori,
    target: Number(row.target) || 0,
    terkumpul: Number(row.terkumpul) || 0,
    targetTanggal: row.target_tanggal || '',
    prioritas: row.prioritas,
    warna: row.warna,
    icon: row.icon,
    catatan: row.catatan || '',
    status: row.status,
    arsip: !!row.arsip,
    createdAt: row.created_at,
    riwayat: (row.goal_progress || [])
      .map(r => ({ id: r.id, nominal: Number(r.nominal) || 0, tanggal: r.tanggal, catatan: r.catatan || '' }))
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
  };
}

function dvBudgetRowToApp(row) {
  return {
    id: row.id,
    nama: row.nama,
    kategori: row.kategori,
    nominal: Number(row.nominal) || 0,
    periode: row.periode,
    tanggalMulai: row.tanggal_mulai || '',
    tanggalSelesai: row.tanggal_selesai || '',
    status: row.status,
    catatan: row.catatan || '',
    arsip: !!row.arsip,
    createdAt: row.created_at
  };
}

function dvInvestRowToApp(row) {
  return {
    id: row.id,
    nama: row.nama,
    jenis: row.jenis,
    modalAwal: Number(row.modal_awal) || 0,
    nilaiSaatIni: Number(row.nilai_saat_ini) || 0,
    tanggalInvestasi: row.tanggal_investasi,
    platform: row.platform || '',
    status: row.status,
    catatan: row.catatan || '',
    arsip: !!row.arsip,
    createdAt: row.created_at,
    riwayat: (row.investment_history || [])
      .map(r => ({ id: r.id, nilai: Number(r.nilai) || 0, tanggal: r.tanggal, catatan: r.catatan || '' }))
      .sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1))
  };
}

// ---------- Bootstrap: narik semua data user dari Supabase ----------
// Dipanggil sekali di awal tiap halaman (lihat dvBootstrapPage di bawah).
// Kalau dipanggil berkali-kali, cukup nunggu promise yang sama (tidak
// fetch ulang berkali-kali).
function dvInitData() {
  if (dvDataReadyPromise) return dvDataReadyPromise;

  dvDataReadyPromise = (async () => {
    const userId = await dvGetUserId();
    if (!userId) return; // guard.js semestinya sudah redirect kalau belum login

    const [akunRes, trxRes, goalRes, budgetRes, investRes] = await Promise.all([
      dvSupabase.from('accounts').select('*').order('created_at', { ascending: false }),
      dvSupabase.from('transactions').select('*').order('tanggal', { ascending: false }).order('created_at', { ascending: false }),
      dvSupabase.from('goals').select('*, goal_progress(*)').order('created_at', { ascending: false }),
      dvSupabase.from('budgets').select('*').order('created_at', { ascending: false }),
      dvSupabase.from('investments').select('*, investment_history(*)').order('created_at', { ascending: false })
    ]);

    if (akunRes.error) console.error('[DVpoint] Gagal ambil data akun:', akunRes.error.message);
    if (trxRes.error) console.error('[DVpoint] Gagal ambil data transaksi:', trxRes.error.message);
    if (goalRes.error) console.error('[DVpoint] Gagal ambil data tujuan:', goalRes.error.message);
    if (budgetRes.error) console.error('[DVpoint] Gagal ambil data anggaran:', budgetRes.error.message);
    if (investRes.error) console.error('[DVpoint] Gagal ambil data investasi:', investRes.error.message);

    DV_AKUN.length = 0;
    (akunRes.data || []).forEach(row => DV_AKUN.push(dvAccountRowToApp(row)));

    DV_TRANSAKSI.length = 0;
    (trxRes.data || []).forEach(row => DV_TRANSAKSI.push(dvTrxRowToApp(row)));

    DV_TUJUAN.length = 0;
    (goalRes.data || []).forEach(row => DV_TUJUAN.push(dvGoalRowToApp(row)));

    DV_ANGGARAN.length = 0;
    (budgetRes.data || []).forEach(row => DV_ANGGARAN.push(dvBudgetRowToApp(row)));

    DV_INVESTASI.length = 0;
    (investRes.data || []).forEach(row => DV_INVESTASI.push(dvInvestRowToApp(row)));

    dvDataReady = true;
  })();

  return dvDataReadyPromise;
}

// ---------- CRUD Akun & Kartu ----------
function dvGetAkunAll() {
  return DV_AKUN.slice();
}

function dvAkunHasTransaksi(id) {
  return dvGetTransaksi().some(t => t.akun === id || t.akunAsal === id || t.akunTujuan === id);
}

async function dvAddAkunAccount(data) {
  const userId = await dvGetUserId();
  const payload = {
    user_id: userId,
    nama: data.nama,
    jenis: data.jenis || 'Bank',
    bank: data.bank || data.nama,
    no_rekening: data.noRekening || '',
    warna: data.warna || '#4f7dff',
    icon: data.icon || 'bank',
    saldo_awal: Number(data.saldoAwal) || 0,
    catatan: data.catatan || '',
    status: 'aktif'
  };
  const { data: row, error } = await dvSupabase.from('accounts').insert(payload).select().single();
  if (error) { console.error('[DVpoint] Gagal tambah akun:', error.message); throw error; }

  const finalAkun = dvAccountRowToApp(row);
  DV_AKUN.unshift(finalAkun);
  dvNotifyChange();
  return finalAkun;
}

async function dvUpdateAkunAccount(id, updates) {
  const payload = {};
  if (updates.nama !== undefined) payload.nama = updates.nama;
  if (updates.jenis !== undefined) payload.jenis = updates.jenis;
  if (updates.bank !== undefined) payload.bank = updates.bank;
  if (updates.noRekening !== undefined) payload.no_rekening = updates.noRekening;
  if (updates.warna !== undefined) payload.warna = updates.warna;
  if (updates.icon !== undefined) payload.icon = updates.icon;
  if (updates.saldoAwal !== undefined) payload.saldo_awal = Number(updates.saldoAwal) || 0;
  if (updates.catatan !== undefined) payload.catatan = updates.catatan;
  if (updates.status !== undefined) payload.status = updates.status;

  const { data: row, error } = await dvSupabase.from('accounts').update(payload).eq('id', id).select().single();
  if (error) { console.error('[DVpoint] Gagal ubah akun:', error.message); throw error; }

  const updated = dvAccountRowToApp(row);
  const idx = DV_AKUN.findIndex(a => a.id === id);
  if (idx !== -1) DV_AKUN[idx] = updated;
  dvNotifyChange();
  return updated;
}

function dvSetAkunStatus(id, status) {
  return dvUpdateAkunAccount(id, { status });
}

// Menghapus akun hanya diperbolehkan jika belum pernah dipakai di transaksi manapun.
async function dvDeleteAkunAccount(id) {
  if (dvAkunHasTransaksi(id)) {
    return { success: false, reason: 'has_transactions' };
  }
  const { error } = await dvSupabase.from('accounts').delete().eq('id', id);
  if (error) { console.error('[DVpoint] Gagal hapus akun:', error.message); return { success: false, reason: 'error' }; }

  const idx = DV_AKUN.findIndex(a => a.id === id);
  if (idx !== -1) DV_AKUN.splice(idx, 1);
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

// Panggil callback setiap kali data berubah — di tab ini (custom event).
// (Sinkron lintas-tab lewat 'storage' event bawaan browser tidak relevan
// lagi sekarang karena datanya di Supabase, bukan localStorage.)
function dvOnChange(callback) {
  window.addEventListener(DVPOINT_EVENT, callback);
}

// ---------- Transaksi ----------
function dvGetTransaksi() {
  return DV_TRANSAKSI.slice();
}

async function dvAddTransaksi(trx) {
  const userId = await dvGetUserId();
  const payload = {
    user_id: userId,
    tanggal: trx.tanggal,
    deskripsi: trx.deskripsi || trx.kategori,
    kategori: trx.kategori,
    metode: trx.metode || 'Cash',
    akun_id: trx.akun || null,
    tipe: trx.tipe, // 'masuk' | 'keluar'
    jumlah: Number(trx.jumlah) || 0,
    catatan: trx.catatan || '',
    status: trx.status || 'Berhasil'
  };
  const { data: row, error } = await dvSupabase.from('transactions').insert(payload).select().single();
  if (error) { console.error('[DVpoint] Gagal tambah transaksi:', error.message); throw error; }

  const finalTrx = dvTrxRowToApp(row);
  DV_TRANSAKSI.unshift(finalTrx);
  dvNotifyChange();
  return finalTrx;
}

async function dvDeleteTransaksi(id) {
  const { error } = await dvSupabase.from('transactions').delete().eq('id', id);
  if (error) { console.error('[DVpoint] Gagal hapus transaksi:', error.message); throw error; }

  const idx = DV_TRANSAKSI.findIndex(t => t.id === id);
  if (idx !== -1) DV_TRANSAKSI.splice(idx, 1);
  dvNotifyChange();
}

async function dvUpdateTransaksi(id, updates) {
  const payload = {};
  if (updates.tanggal !== undefined) payload.tanggal = updates.tanggal;
  if (updates.deskripsi !== undefined) payload.deskripsi = updates.deskripsi;
  if (updates.kategori !== undefined) payload.kategori = updates.kategori;
  if (updates.metode !== undefined) payload.metode = updates.metode;
  if (updates.akun !== undefined) payload.akun_id = updates.akun;
  if (updates.akunAsal !== undefined) payload.akun_asal_id = updates.akunAsal;
  if (updates.akunTujuan !== undefined) payload.akun_tujuan_id = updates.akunTujuan;
  if (updates.tipe !== undefined) payload.tipe = updates.tipe;
  if (updates.jumlah !== undefined) payload.jumlah = Number(updates.jumlah) || 0;
  if (updates.catatan !== undefined) payload.catatan = updates.catatan;
  if (updates.status !== undefined) payload.status = updates.status;

  const { data: row, error } = await dvSupabase.from('transactions').update(payload).eq('id', id).select().single();
  if (error) { console.error('[DVpoint] Gagal ubah transaksi:', error.message); throw error; }

  const updated = dvTrxRowToApp(row);
  const idx = DV_TRANSAKSI.findIndex(t => t.id === id);
  if (idx !== -1) DV_TRANSAKSI[idx] = updated;
  dvNotifyChange();
  return updated;
}

async function dvDuplicateTransaksi(id) {
  const src = DV_TRANSAKSI.find(t => t.id === id);
  if (!src) return null;
  return dvAddTransaksi({ ...src, tanggal: dvTodayISO() });
}

// ---------- Transfer antar akun ----------
// Transfer disimpan sebagai satu baris transaksi dengan tipe:'transfer' dan
// dua akun (akunAsal, akunTujuan). Tidak memengaruhi total pemasukan/pengeluaran,
// tapi memindahkan saldo antar akun (lihat dvHitungSaldoAkun).
async function dvAddTransfer(trf) {
  const userId = await dvGetUserId();
  const asal = DV_AKUN.find(a => a.id === trf.akunAsal);
  const tujuan = DV_AKUN.find(a => a.id === trf.akunTujuan);
  const payload = {
    user_id: userId,
    tanggal: trf.tanggal || dvTodayISO(),
    deskripsi: trf.catatan || `Transfer ${asal ? asal.nama : trf.akunAsal} → ${tujuan ? tujuan.nama : trf.akunTujuan}`,
    kategori: 'Transfer',
    metode: 'Transfer Antar Akun',
    akun_id: trf.akunAsal,
    akun_asal_id: trf.akunAsal,
    akun_tujuan_id: trf.akunTujuan,
    tipe: 'transfer',
    jumlah: Number(trf.jumlah) || 0,
    catatan: trf.catatan || '',
    status: trf.status || 'Berhasil'
  };
  const { data: row, error } = await dvSupabase.from('transactions').insert(payload).select().single();
  if (error) { console.error('[DVpoint] Gagal transfer:', error.message); throw error; }

  const finalTrf = dvTrxRowToApp(row);
  DV_TRANSAKSI.unshift(finalTrf);
  dvNotifyChange();
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
  return DV_TUJUAN.slice();
}

async function dvAddTujuan(goal) {
  const userId = await dvGetUserId();
  const danaAwal = Number(goal.terkumpul || goal.danaAwal) || 0;
  const target = Number(goal.target) || 0;
  const payload = {
    user_id: userId,
    nama: goal.nama,
    kategori: DV_TUJUAN_KATEGORI.includes(goal.kategori) ? goal.kategori : 'Lainnya',
    target,
    terkumpul: danaAwal,
    target_tanggal: goal.targetTanggal || null,
    prioritas: DV_TUJUAN_PRIORITAS.includes(goal.prioritas) ? goal.prioritas : 'Sedang',
    warna: goal.warna || '#4f7dff',
    icon: goal.icon || 'target',
    catatan: goal.catatan || '',
    status: dvHitungStatusTujuan(danaAwal, target, 'Aktif'),
    arsip: false
  };
  const { data: row, error } = await dvSupabase.from('goals').insert(payload).select().single();
  if (error) { console.error('[DVpoint] Gagal tambah tujuan:', error.message); throw error; }

  // Kalau ada dana awal, catat juga sebagai baris pertama riwayat progress.
  if (danaAwal > 0) {
    await dvSupabase.from('goal_progress').insert({
      goal_id: row.id, user_id: userId, nominal: danaAwal, tanggal: dvTodayISO(), catatan: 'Dana awal'
    });
  }

  const finalGoal = dvGoalRowToApp({ ...row, goal_progress: danaAwal > 0 ? [{ nominal: danaAwal, tanggal: dvTodayISO(), catatan: 'Dana awal' }] : [] });
  DV_TUJUAN.unshift(finalGoal);
  dvNotifyChange();
  return finalGoal;
}

async function dvUpdateTujuan(id, updates) {
  const payload = {};
  if (updates.nama !== undefined) payload.nama = updates.nama;
  if (updates.kategori !== undefined && DV_TUJUAN_KATEGORI.includes(updates.kategori)) payload.kategori = updates.kategori;
  if (updates.target !== undefined) payload.target = Number(updates.target) || 0;
  if (updates.terkumpul !== undefined) payload.terkumpul = Number(updates.terkumpul) || 0;
  if (updates.targetTanggal !== undefined) payload.target_tanggal = updates.targetTanggal || null;
  if (updates.prioritas !== undefined && DV_TUJUAN_PRIORITAS.includes(updates.prioritas)) payload.prioritas = updates.prioritas;
  if (updates.warna !== undefined) payload.warna = updates.warna;
  if (updates.icon !== undefined) payload.icon = updates.icon;
  if (updates.catatan !== undefined) payload.catatan = updates.catatan;
  if (updates.status !== undefined && DV_TUJUAN_STATUS.includes(updates.status)) payload.status = updates.status;
  if (updates.arsip !== undefined) payload.arsip = !!updates.arsip;

  const { data: row, error } = await dvSupabase.from('goals').update(payload).eq('id', id).select('*, goal_progress(*)').single();
  if (error) { console.error('[DVpoint] Gagal ubah tujuan:', error.message); throw error; }

  const updated = dvGoalRowToApp(row);
  const idx = DV_TUJUAN.findIndex(g => g.id === id);
  if (idx !== -1) DV_TUJUAN[idx] = updated;
  dvNotifyChange();
  return updated;
}

// Arsipkan / kembalikan dari arsip — hanya menyembunyikan dari daftar utama,
// bukan penghapusan, dan tidak mengubah field `status`.
function dvSetTujuanArsip(id, arsip) {
  return dvUpdateTujuan(id, { arsip: !!arsip });
}

async function dvDeleteTujuan(id) {
  const { error } = await dvSupabase.from('goals').delete().eq('id', id);
  if (error) { console.error('[DVpoint] Gagal hapus tujuan:', error.message); throw error; }
  const idx = DV_TUJUAN.findIndex(g => g.id === id);
  if (idx !== -1) DV_TUJUAN.splice(idx, 1);
  dvNotifyChange();
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
async function dvAddTujuanProgress(id, entry) {
  const userId = await dvGetUserId();
  const goal = DV_TUJUAN.find(g => g.id === id);
  if (!goal) return null;
  const nominal = Number(entry.nominal) || 0;

  const { error: progError } = await dvSupabase.from('goal_progress').insert({
    goal_id: id, user_id: userId, nominal, tanggal: entry.tanggal || dvTodayISO(), catatan: entry.catatan || ''
  });
  if (progError) { console.error('[DVpoint] Gagal tambah progress:', progError.message); throw progError; }

  const terkumpulBaru = (Number(goal.terkumpul) || 0) + nominal;
  const statusBaru = dvHitungStatusTujuan(terkumpulBaru, Number(goal.target) || 0, goal.status);

  return dvUpdateTujuan(id, { terkumpul: terkumpulBaru, status: statusBaru });
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
  return DV_ANGGARAN.slice();
}

async function dvAddAnggaran(data) {
  const userId = await dvGetUserId();
  const payload = {
    user_id: userId,
    nama: data.nama,
    kategori: data.kategori,
    nominal: Number(data.nominal) || 0,
    periode: data.periode === 'tahunan' ? 'tahunan' : 'bulanan',
    tanggal_mulai: data.tanggalMulai || null,
    tanggal_selesai: data.tanggalSelesai || null,
    status: DV_ANGGARAN_STATUS.includes(data.status) ? data.status : 'Aktif',
    catatan: data.catatan || '',
    arsip: false
  };
  const { data: row, error } = await dvSupabase.from('budgets').insert(payload).select().single();
  if (error) { console.error('[DVpoint] Gagal tambah anggaran:', error.message); throw error; }

  const finalAnggaran = dvBudgetRowToApp(row);
  DV_ANGGARAN.unshift(finalAnggaran);
  dvNotifyChange();
  return finalAnggaran;
}

async function dvUpdateAnggaran(id, updates) {
  const payload = {};
  if (updates.nama !== undefined) payload.nama = updates.nama;
  if (updates.kategori !== undefined) payload.kategori = updates.kategori;
  if (updates.nominal !== undefined) payload.nominal = Number(updates.nominal) || 0;
  if (updates.periode !== undefined) payload.periode = updates.periode === 'tahunan' ? 'tahunan' : 'bulanan';
  if (updates.tanggalMulai !== undefined) payload.tanggal_mulai = updates.tanggalMulai || null;
  if (updates.tanggalSelesai !== undefined) payload.tanggal_selesai = updates.tanggalSelesai || null;
  if (updates.status !== undefined && DV_ANGGARAN_STATUS.includes(updates.status)) payload.status = updates.status;
  if (updates.catatan !== undefined) payload.catatan = updates.catatan;
  if (updates.arsip !== undefined) payload.arsip = !!updates.arsip;

  const { data: row, error } = await dvSupabase.from('budgets').update(payload).eq('id', id).select().single();
  if (error) { console.error('[DVpoint] Gagal ubah anggaran:', error.message); throw error; }

  const updated = dvBudgetRowToApp(row);
  const idx = DV_ANGGARAN.findIndex(a => a.id === id);
  if (idx !== -1) DV_ANGGARAN[idx] = updated;
  dvNotifyChange();
  return updated;
}

// Arsipkan / kembalikan dari arsip. Hanya menyembunyikan dari tampilan utama
// secara default — bukan penghapusan, dan tidak mengubah field `status`.
function dvSetAnggaranArsip(id, arsip) {
  return dvUpdateAnggaran(id, { arsip: !!arsip });
}

async function dvDeleteAnggaran(id) {
  const { error } = await dvSupabase.from('budgets').delete().eq('id', id);
  if (error) { console.error('[DVpoint] Gagal hapus anggaran:', error.message); throw error; }
  const idx = DV_ANGGARAN.findIndex(a => a.id === id);
  if (idx !== -1) DV_ANGGARAN.splice(idx, 1);
  dvNotifyChange();
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
  return DV_INVESTASI.slice();
}

async function dvAddInvestasi(data) {
  const userId = await dvGetUserId();
  const modalAwal = Number(data.modalAwal) || 0;
  const nilaiSaatIni = data.nilaiSaatIni != null && data.nilaiSaatIni !== '' ? Number(data.nilaiSaatIni) || 0 : modalAwal;
  const tanggalInvestasi = data.tanggalInvestasi || dvTodayISO();
  const payload = {
    user_id: userId,
    nama: data.nama,
    jenis: DV_INVEST_JENIS.includes(data.jenis) ? data.jenis : 'Lainnya',
    modal_awal: modalAwal,
    nilai_saat_ini: nilaiSaatIni,
    tanggal_investasi: tanggalInvestasi,
    platform: data.platform || '',
    status: DV_INVEST_STATUS.includes(data.status) ? data.status : 'Aktif',
    catatan: data.catatan || '',
    arsip: false
  };
  const { data: row, error } = await dvSupabase.from('investments').insert(payload).select().single();
  if (error) { console.error('[DVpoint] Gagal tambah investasi:', error.message); throw error; }

  await dvSupabase.from('investment_history').insert({
    investment_id: row.id, user_id: userId, nilai: nilaiSaatIni, tanggal: tanggalInvestasi, catatan: 'Nilai awal saat investasi dibuat'
  });

  const finalInvest = dvInvestRowToApp({ ...row, investment_history: [{ nilai: nilaiSaatIni, tanggal: tanggalInvestasi, catatan: 'Nilai awal saat investasi dibuat' }] });
  DV_INVESTASI.unshift(finalInvest);
  dvNotifyChange();
  return finalInvest;
}

async function dvUpdateInvestasi(id, updates) {
  const payload = {};
  if (updates.nama !== undefined) payload.nama = updates.nama;
  if (updates.jenis !== undefined && DV_INVEST_JENIS.includes(updates.jenis)) payload.jenis = updates.jenis;
  if (updates.modalAwal !== undefined) payload.modal_awal = Number(updates.modalAwal) || 0;
  if (updates.nilaiSaatIni !== undefined) payload.nilai_saat_ini = Number(updates.nilaiSaatIni) || 0;
  if (updates.tanggalInvestasi !== undefined) payload.tanggal_investasi = updates.tanggalInvestasi;
  if (updates.platform !== undefined) payload.platform = updates.platform;
  if (updates.status !== undefined && DV_INVEST_STATUS.includes(updates.status)) payload.status = updates.status;
  if (updates.catatan !== undefined) payload.catatan = updates.catatan;
  if (updates.arsip !== undefined) payload.arsip = !!updates.arsip;

  const { data: row, error } = await dvSupabase.from('investments').update(payload).eq('id', id).select('*, investment_history(*)').single();
  if (error) { console.error('[DVpoint] Gagal ubah investasi:', error.message); throw error; }

  const updated = dvInvestRowToApp(row);
  const idx = DV_INVESTASI.findIndex(i => i.id === id);
  if (idx !== -1) DV_INVESTASI[idx] = updated;
  dvNotifyChange();
  return updated;
}

// Update Nilai: mencatat nilai terbaru + menyimpan ke riwayat perubahan nilai.
// Hanya berlaku pada modul Investasi — tidak menyentuh saldo akun/transaksi.
async function dvUpdateInvestasiNilai(id, entry) {
  const userId = await dvGetUserId();
  const nilai = Number(entry.nilai) || 0;

  const { error: histError } = await dvSupabase.from('investment_history').insert({
    investment_id: id, user_id: userId, nilai, tanggal: entry.tanggal || dvTodayISO(), catatan: entry.catatan || ''
  });
  if (histError) { console.error('[DVpoint] Gagal tambah riwayat nilai:', histError.message); throw histError; }

  return dvUpdateInvestasi(id, { nilaiSaatIni: nilai });
}

function dvSetInvestasiArsip(id, arsip) {
  return dvUpdateInvestasi(id, { arsip: !!arsip, status: arsip ? 'Arsip' : 'Aktif' });
}

async function dvDeleteInvestasi(id) {
  const { error } = await dvSupabase.from('investments').delete().eq('id', id);
  if (error) { console.error('[DVpoint] Gagal hapus investasi:', error.message); throw error; }
  const idx = DV_INVESTASI.findIndex(i => i.id === id);
  if (idx !== -1) DV_INVESTASI.splice(idx, 1);
  dvNotifyChange();
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
// ---------- Bootstrap tiap halaman ----------
// Dipanggil oleh setiap file JS halaman (dashboard.js, akun.js, dst)
// SEBELUM render pertama, supaya data dari Supabase (dvInitData)
// sudah siap. Contoh pakai:
//
//   dvBootstrapPage(() => {
//     render();
//     dvOnChange(render);
//   });
//
// ============================================================
async function dvBootstrapPage(callback) {
  try {
    await dvInitData();
  } catch (e) {
    console.error('[DVpoint] Gagal memuat data awal:', e);
  }
  callback();
}