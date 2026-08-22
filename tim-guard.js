// ============================================================
// DVpoint — Guard halaman Tim (tim-guard.js)
// ============================================================
// Halaman tim.html cuma boleh diakses Owner. Guard ini jalan
// SEBELUM tim.js supaya kalau ada Member yang coba buka lewat
// URL langsung (bukan klik menu sidebar yang sudah disembunyikan),
// mereka otomatis dilempar balik ke Dashboard.
//
// ⚠️ CATATAN: karena ini murni cek client-side (localStorage),
// ini BUKAN proteksi keamanan sesungguhnya — baru proteksi UX.
// Proteksi akses yang benar-benar aman baru bisa ditegakkan setelah
// backend (rencana: Supabase) aktif dengan Row Level Security.
// ============================================================
(function () {
  if (typeof dvIsOwner === 'function' && !dvIsOwner()) {
    window.location.href = 'dashboard.html';
  }
})();