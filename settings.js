// ============================================================
// DVpoint — Shared Settings Layer (settings.js)
// ============================================================
// Menyimpan & menerapkan preferensi global aplikasi: tema (dark/light),
// profil pengguna (foto/nama/email/telp), dan preferensi (bahasa, format
// tanggal, format mata uang, hari awal minggu). Mengikuti pola yang sama
// dengan storage.js: localStorage sebagai single source of truth, dan
// dvNotifySettingsChange()/dvOnSettingsChange() untuk sinkronisasi
// real-time di tab yang sama (custom event) maupun tab lain (storage
// event bawaan browser) — sehingga tema/profil berubah di semua halaman
// tanpa perlu reload.
//
// File ini di-load di SETIAP halaman (setelah storage.js, sebelum
// guard.js / script halaman) agar sidebar & tema selalu konsisten.
// ============================================================

const DVPOINT_THEME_KEY = 'dvpoint_theme';
const DVPOINT_PROFILE_KEY = 'dvpoint_profile';
const DVPOINT_PREF_KEY = 'dvpoint_preferences';
const DVPOINT_SETTINGS_EVENT = 'dvpoint:settingschanged';

const DV_PROFILE_DEFAULT = {
  nama: '...', // placeholder netral selama profil masih dimuat dari Supabase —
               // BUKAN nama orang tertentu, supaya tidak ada "kedipan nama salah"
               // waktu pindah halaman (dulu 'Dicky Ade', ketinggalan dari versi
               // sebelum migrasi Supabase).
  email: '',
  telp: '',
  tanggalLahir: '',
  alamat: '',
  bergabungSejak: null, // ISO date string, di-set sekali otomatis saat profil pertama kali dibuka
  foto: null // base64 data URL, atau null -> pakai inisial
};

const DV_PREF_DEFAULT = {
  bahasa: 'id',
  formatTanggal: 'DD/MM/YYYY',
  hariAwalMinggu: 'senin'
};

// ---------- Notifikasi perubahan (sinkronisasi real-time) ----------
function dvNotifySettingsChange() {
  window.dispatchEvent(new CustomEvent(DVPOINT_SETTINGS_EVENT));
}

function dvOnSettingsChange(callback) {
  window.addEventListener(DVPOINT_SETTINGS_EVENT, callback);
  window.addEventListener('storage', (e) => {
    if (e.key === DVPOINT_THEME_KEY || e.key === DVPOINT_PREF_KEY) callback();
  });
}

// ============================================================
// ---------- Tema (Dark / Light) ----------
// ============================================================
function dvGetTheme() {
  try {
    const t = localStorage.getItem(DVPOINT_THEME_KEY);
    return t === 'light' ? 'light' : 'dark';
  } catch (e) {
    return 'dark';
  }
}

// Menerapkan tema ke DOM. Dipanggil sedini mungkin (inline script di
// <head>) supaya tidak ada flash warna yang salah saat halaman dimuat.
function dvApplyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  dvUpdateThemeToggleIcons(t);
}

function dvSetTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  try { localStorage.setItem(DVPOINT_THEME_KEY, t); } catch (e) {}
  dvApplyTheme(t);
  dvNotifySettingsChange();
}

function dvToggleTheme() {
  dvSetTheme(dvGetTheme() === 'light' ? 'dark' : 'light');
}

// Beberapa halaman (Dashboard, Transfer) sudah punya tombol ikon
// bulan/matahari di topbar (.icon-btn.dark) yang tadinya statis —
// dijadikan tombol quick-toggle tema di sini.
function dvUpdateThemeToggleIcons(theme) {
  document.querySelectorAll('.icon-btn.dark').forEach((btn) => {
    btn.setAttribute('title', theme === 'light' ? 'Mode Gelap' : 'Mode Terang');
    btn.innerHTML = theme === 'light'
      ? '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>'
      : '<svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path></svg>';
  });
}

function dvBindThemeToggleButtons() {
  document.querySelectorAll('.icon-btn.dark').forEach((btn) => {
    if (btn.dataset.dvBound) return;
    btn.dataset.dvBound = '1';
    btn.addEventListener('click', dvToggleTheme);
  });
}

// ============================================================
// ---------- Profil Pengguna ----------
// ============================================================
// ⚠️ Profil sekarang tersambung ke tabel 'profiles' di Supabase
// (bukan localStorage lagi) — data personal harus ikut akun, bukan
// device. Pola sama seperti storage.js: dvGetProfile() tetap SINKRON
// (baca dari cache in-memory), diisi oleh dvFetchProfile() (async,
// dipanggil sekali di awal tiap halaman). dvSetProfile() jadi ASYNC
// karena perlu kirim ke server.
let DV_PROFILE_CACHE = Object.assign({}, DV_PROFILE_DEFAULT);
let dvProfileReadyPromise = null;

function dvProfileRowToApp(row) {
  if (!row) return Object.assign({}, DV_PROFILE_DEFAULT);
  return {
    nama: row.nama || DV_PROFILE_DEFAULT.nama,
    email: row.email || '',
    telp: row.telp || '',
    tanggalLahir: row.tanggal_lahir || '',
    alamat: row.alamat || '',
    bergabungSejak: row.bergabung_sejak || null,
    foto: row.foto_url || null
  };
}

// Dipanggil sekali di awal tiap halaman (lihat applyAll di bawah).
function dvFetchProfile() {
  if (dvProfileReadyPromise) return dvProfileReadyPromise;

  dvProfileReadyPromise = (async () => {
    try {
      const userId = await dvGetUserId();
      if (!userId) return;
      // Tanpa .single() — kalau baris belum ada, cukup diamkan (DV_PROFILE_CACHE
      // tetap default), bukan crash. dvSetProfile() yang nanti akan buatkan
      // barisnya otomatis begitu user pertama kali simpan sesuatu.
      const { data, error } = await dvSupabase.from('profiles').select('*').eq('id', userId);
      if (error) { console.error('[DVpoint] Gagal ambil profil:', error.message); return; }
      if (data && data.length > 0) {
        DV_PROFILE_CACHE = dvProfileRowToApp(data[0]);
      }
    } catch (e) {
      console.error('[DVpoint] Gagal ambil profil:', e);
    }
  })();

  return dvProfileReadyPromise;
}

// Tetap SINKRON — baca dari cache yang sudah diisi dvFetchProfile().
function dvGetProfile() {
  return Object.assign({}, DV_PROFILE_CACHE);
}

async function dvSetProfile(updates) {
  const userId = await dvGetUserId();
  if (!userId) {
    throw new Error('Sesi login tidak ditemukan. Coba logout, lalu login ulang.');
  }
  const payload = {};
  if (updates.nama !== undefined) payload.nama = updates.nama;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.telp !== undefined) payload.telp = updates.telp;
  if (updates.tanggalLahir !== undefined) payload.tanggal_lahir = updates.tanggalLahir || null;
  if (updates.alamat !== undefined) payload.alamat = updates.alamat;
  if (updates.foto !== undefined) payload.foto_url = updates.foto;

  // ⚠️ Sengaja TIDAK pakai .single() di sini — kalau baris profil ternyata
  // belum ada (misal trigger pembuatan profil gagal jalan waktu akun ini
  // dibuat), .single() akan crash keras dengan error PostgREST yang
  // membingungkan ("Cannot coerce..."). Di sini dicek manual, dan kalau
  // memang belum ada baris, langsung dibuatkan sebagai jaring pengaman —
  // supaya user tidak macet tidak bisa simpan profil selamanya.
  const { data, error } = await dvSupabase.from('profiles').update(payload).eq('id', userId).select();
  if (error) { console.error('[DVpoint] Gagal simpan profil:', error.message); throw error; }

  let finalRow;
  if (!data || data.length === 0) {
    const { data: inserted, error: insertError } = await dvSupabase
      .from('profiles')
      .insert({ id: userId, ...payload })
      .select();
    if (insertError || !inserted || !inserted.length) {
      console.error('[DVpoint] Gagal buat baris profil (fallback):', insertError?.message);
      throw new Error('Baris profil tidak ditemukan & gagal dibuat otomatis. Coba logout lalu login ulang.');
    }
    finalRow = inserted[0];
  } else {
    finalRow = data[0];
  }

  DV_PROFILE_CACHE = dvProfileRowToApp(finalRow);
  dvApplyProfileToDOM(DV_PROFILE_CACHE);
  dvNotifySettingsChange();
  return DV_PROFILE_CACHE;
}

function dvGetInisial(nama) {
  if (!nama) return '?';
  const parts = nama.trim().split(/\s+/);
  const first = parts[0] ? parts[0][0] : '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '?';
}

// Menerapkan foto/nama profil ke seluruh elemen `.avatar` + `.user-name`
// di sidebar (dan header/topbar bila ada) pada halaman yang sedang aktif.
function dvApplyProfileToDOM(profile) {
  const p = profile || dvGetProfile();
  document.querySelectorAll('.avatar').forEach((av) => {
    if (p.foto) {
      av.style.background = 'none';
      av.innerHTML = `<img src="${p.foto}" alt="Foto profil" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    } else {
      av.style.background = '';
      av.textContent = dvGetInisial(p.nama);
    }
  });
  document.querySelectorAll('.user-name').forEach((el) => { el.textContent = p.nama || 'Pengguna'; });
}

// ============================================================
// ---------- Preferensi Aplikasi ----------
// ============================================================
function dvGetPreferences() {
  try {
    const raw = JSON.parse(localStorage.getItem(DVPOINT_PREF_KEY) || 'null');
    return raw && typeof raw === 'object' ? Object.assign({}, DV_PREF_DEFAULT, raw) : Object.assign({}, DV_PREF_DEFAULT);
  } catch (e) {
    return Object.assign({}, DV_PREF_DEFAULT);
  }
}

function dvSetPreferences(updates) {
  const merged = Object.assign({}, dvGetPreferences(), updates);
  localStorage.setItem(DVPOINT_PREF_KEY, JSON.stringify(merged));
  dvNotifySettingsChange();
  return merged;
}

// ============================================================
// ---------- Navigasi mobile: hamburger + drawer sidebar ----------
// ============================================================
// Sidebar aslinya (dashboard.css) di layar sempit hanya di-hide total
// tanpa pengganti navigasi apa pun — dibuat otomatis di sini via JS
// sekali per halaman, supaya semua 15+ halaman langsung dapat tombol
// hamburger + drawer sidebar tanpa perlu edit markup satu-satu.
function dvSetupMobileNav() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || document.querySelector('.mobile-menu-btn')) return; // sudah ada / tidak ada sidebar di halaman ini

  // Beri tiap nav-item nomor urut (dipakai CSS untuk stagger fade-in saat drawer dibuka)
  sidebar.querySelectorAll('.nav-item').forEach((item, i) => {
    item.style.setProperty('--nav-i', i);
  });

  // Tombol hamburger (fixed, pojok kiri atas) — ikonnya berubah jadi X saat drawer terbuka
  const btn = document.createElement('button');
  btn.className = 'mobile-menu-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Buka menu navigasi');
  btn.innerHTML = `
    <svg class="icon-open" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"></path></svg>
    <svg class="icon-close" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"></path></svg>`;
  document.body.appendChild(btn);

  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop';
  document.body.appendChild(backdrop);

  // Tombol close (X) di dalam drawer, disandingkan dengan logo brand
  const brand = sidebar.querySelector('.brand');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'sidebar-mobile-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Tutup menu navigasi');
  closeBtn.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7"></path></svg>';
  if (brand) brand.appendChild(closeBtn); else sidebar.prepend(closeBtn);

  function closeSidebar() {
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('open');
    btn.classList.remove('active');
    btn.setAttribute('aria-label', 'Buka menu navigasi');
  }
  function openSidebar() {
    sidebar.classList.add('mobile-open');
    backdrop.classList.add('open');
    btn.classList.add('active');
    btn.setAttribute('aria-label', 'Tutup menu navigasi');
  }

  btn.addEventListener('click', () => {
    if (sidebar.classList.contains('mobile-open')) closeSidebar(); else openSidebar();
  });
  closeBtn.addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);

  // UX standar mobile: tutup drawer otomatis begitu satu menu diklik,
  // supaya tidak perlu tap dua kali (tap link, lalu tap lagi buat nutup).
  sidebar.querySelectorAll('.nav-item a').forEach((a) => {
    a.addEventListener('click', closeSidebar);
  });

  // Tutup juga dengan tombol Escape di keyboard (aksesibilitas)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('mobile-open')) closeSidebar();
  });

  // Kalau layar dilebarkan balik ke ukuran desktop, pastikan drawer
  // tidak "nyangkut" dalam kondisi terbuka.
  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) closeSidebar();
  });
}

// ============================================================
// ---------- Init otomatis di setiap halaman ----------
// ============================================================
(function dvSettingsInit() {
  dvApplyTheme(dvGetTheme());

  async function applyAll() {
    dvBindThemeToggleButtons();
    dvUpdateThemeToggleIcons(dvGetTheme());
    dvSetupMobileNav();
    if (typeof dvApplyLanguage === 'function') dvApplyLanguage();

    // Profil butuh nunggu jaringan (Supabase), jadi diterapkan
    // belakangan — setelah itu baru avatar/nama di sidebar terisi benar.
    await dvFetchProfile();
    dvApplyProfileToDOM(dvGetProfile());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAll);
  } else {
    applyAll();
  }

  // Sinkron lintas-tab & lintas-halaman: jika tema/profil/bahasa berubah
  // di tempat lain, halaman ini ikut memperbarui tanpa perlu refresh.
  dvOnSettingsChange(() => {
    dvApplyTheme(dvGetTheme());
    dvApplyProfileToDOM(dvGetProfile());
    if (typeof dvApplyLanguage === 'function') dvApplyLanguage();
  });
})();
// ============================================================
// ---------- Logout global (dipakai tombol logout di sidebar
// setiap halaman lewat onclick="dvpointLogout()") ----------
// ============================================================
async function dvpointLogout() {
  if (typeof dvSupabase !== 'undefined') {
    await dvSupabase.auth.signOut();
  }
  if (typeof dvShowGenericToast === 'function') {
    dvShowGenericToast(typeof dvT === 'function' ? dvT('set.toast_logout') : 'Anda telah keluar dari akun.');
  }
  setTimeout(() => { window.location.href = 'index.html'; }, 500);
}