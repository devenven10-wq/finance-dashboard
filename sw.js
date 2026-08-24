// ============================================================
// DVpoint — Service Worker (sw.js)
// ============================================================
// ⚠️ SENGAJA DIBUAT MINIMAL — TIDAK cache halaman/JS/CSS secara agresif.
//
// Kenapa: aplikasi ini masih aktif dikembangkan (sering ada perbaikan
// bug). Kalau service worker menyimpan cache berat, pengguna bisa
// terjebak melihat versi LAMA yang sudah diperbaiki di server —
// membingungkan ("kok masih bug yang sama?" padahal sudah di-push).
//
// Service worker ini cuma berfungsi supaya browser (terutama Chrome
// di Android) menganggap aplikasi ini "installable" (bisa di-Add to
// Home Screen dengan baik) — tanpa benar-benar menyimpan cache berat.
// Semua request tetap diteruskan langsung ke jaringan (network passthrough).
//
// Kalau nanti aplikasi sudah stabil (jarang ada perubahan lagi), boleh
// dikembangkan lebih lanjut jadi cache yang lebih agresif untuk
// dukungan offline sungguhan.
// ============================================================

const SW_VERSION = 'dvpoint-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // langsung aktifkan versi baru, tidak nunggu tab lama ditutup
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Network passthrough murni — tidak ada logic cache sama sekali.
// Fetch handler ini cuma WAJIB ADA (meski kosong secara efek) supaya
// Chrome menganggap app ini "installable" sebagai PWA.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});