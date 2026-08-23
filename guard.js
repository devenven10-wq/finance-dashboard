// ============================================================
// DVpoint — Guard halaman (guard.js)
// ============================================================
// Dimuat di semua halaman aplikasi (dashboard, transaksi, dst) SETELAH
// supabase-client.js. Mengecek apakah ada sesi login Supabase yang
// aktif — kalau tidak ada, langsung dilempar ke halaman Sign In.
//
// Supabase Auth otomatis menyimpan sesi (JWT) di localStorage dan
// memperbaruinya sendiri (refresh token) — jadi ini BUKAN pengecekan
// manual seperti dulu, tapi benar-benar tervalidasi oleh Supabase.
// ============================================================
(async function () {
  if (typeof dvSupabase === 'undefined') return; // supabase-client.js belum termuat, aman diabaikan

  const { data: { session } } = await dvSupabase.auth.getSession();

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  // Simpan info user yang sedang login supaya storage.js/settings.js
  // bisa memakainya (misal buat query data yang cuma milik dia).
  window.dvCurrentUser = session.user;

  // Kalau sesi berubah di tab lain (misal logout dari tab lain),
  // ikut redirect ke login supaya tidak "nyangkut" di halaman terkunci.
  dvSupabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.href = 'index.html';
    }
  });
})();