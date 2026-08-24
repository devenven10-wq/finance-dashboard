// ============================================================
// DVpoint — Registrasi Service Worker (pwa-register.js)
// ============================================================
// Dimuat di setiap halaman. Mendaftarkan sw.js supaya browser
// menganggap aplikasi ini installable (bisa di-"Add to Home Screen"
// dengan pengalaman standalone/fullscreen, bukan cuma bookmark biasa).
// ============================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('[DVpoint] Gagal daftar service worker:', err);
    });
  });
}