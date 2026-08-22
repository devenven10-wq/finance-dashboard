// ============================================================
// DVpoint — Halaman Pengaturan (pengaturan.js)
// ============================================================
// Halaman ini read/write untuk data PROFIL, TEMA, dan PREFERENSI saja
// (lewat settings.js). Tidak ada logika terkait transaksi, dashboard,
// laporan, anggaran, tujuan, atau investasi di sini.
// ============================================================

(function () {
  const el = {
    navItems: document.querySelectorAll('.set-nav-item'),
    sections: document.querySelectorAll('.set-section'),

    // Profil
    avatarPreview: document.getElementById('avatarPreview'),
    inpFoto: document.getElementById('inpFoto'),
    btnAvatarCamera: document.getElementById('btnAvatarCamera'),
    btnAvatarRemove: document.getElementById('btnAvatarRemove'),
    btnEditProfil: document.getElementById('btnEditProfil'),
    inpNama: document.getElementById('inpNama'),
    inpEmail: document.getElementById('inpEmail'),
    inpTelp: document.getElementById('inpTelp'),
    inpTanggalLahir: document.getElementById('inpTanggalLahir'),
    inpAlamat: document.getElementById('inpAlamat'),
    heroName: document.getElementById('heroName'),
    heroEmail: document.getElementById('heroEmail'),
    heroPhone: document.getElementById('heroPhone'),
    heroPhoneRow: document.getElementById('heroPhoneRow'),
    heroJoined: document.getElementById('heroJoined'),
    profilError: document.getElementById('profilError'),
    btnSimpanProfil: document.getElementById('btnSimpanProfil'),

    // Tampilan
    themeGrid: document.getElementById('themeGrid'),

    // Preferensi
    prefBahasa: document.getElementById('prefBahasa'),
    prefTanggal: document.getElementById('prefTanggal'),
    prefMataUang: document.getElementById('prefMataUang'),
    prefHariAwal: document.getElementById('prefHariAwal'),
    prefSaveIndicator: document.getElementById('prefSaveIndicator'),

    // Keamanan
    btnUbahPassword: document.getElementById('btnUbahPassword'),
    btnLogout: document.getElementById('btnLogout'),
    btnSidebarLogout: document.getElementById('btnSidebarLogout'),
    logoutModal: document.getElementById('logoutModal'),
    logoutModalClose: document.getElementById('logoutModalClose'),
    logoutCancel: document.getElementById('logoutCancel'),
    logoutConfirm: document.getElementById('logoutConfirm'),
    passwordModal: document.getElementById('passwordModal'),
    passwordModalClose: document.getElementById('passwordModalClose'),
    passwordCancel: document.getElementById('passwordCancel'),
    formPassword: document.getElementById('formPassword'),
    passwordError: document.getElementById('passwordError'),

    // Tentang
    btnCekPembaruan: document.getElementById('btnCekPembaruan'),

    toast: document.getElementById('setToast')
  };

  let pendingFotoDataUrl = undefined; // undefined = tidak diubah, null = dihapus, string = foto baru

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
  // ---------- Tab switching (tanpa pindah halaman) ----------
  // ============================================================
  function activateTab(tab) {
    el.navItems.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    el.sections.forEach(sec => sec.classList.toggle('active', sec.dataset.section === tab));
    try { history.replaceState(null, '', '#' + tab); } catch (e) {}
  }

  el.navItems.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // Buka tab sesuai hash URL jika ada (opsional, memudahkan deep-link)
  const initialTab = (location.hash || '').replace('#', '');
  if (initialTab && document.querySelector(`.set-nav-item[data-tab="${initialTab}"]`)) {
    activateTab(initialTab);
  }

  // ============================================================
  // ---------- TAB: PROFIL ----------
  // ============================================================
  const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function formatJoinedDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2, '0')} ${BULAN_ID[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  }

  function renderAvatarPreview(fotoDataUrl, nama) {
    if (fotoDataUrl) {
      el.avatarPreview.innerHTML = `<img alt="Foto profil" src="${fotoDataUrl}"/>`;
      el.btnAvatarRemove.style.display = 'flex';
    } else {
      el.avatarPreview.textContent = dvGetInisial(nama);
      el.btnAvatarRemove.style.display = 'none';
    }
  }

  function renderHeroDisplay(p) {
    el.heroName.textContent = p.nama || dvT('set.pengguna_default');
    el.heroEmail.textContent = p.email || '-';
    if (p.telp) {
      el.heroPhone.textContent = p.telp;
      el.heroPhoneRow.style.display = 'flex';
    } else {
      el.heroPhoneRow.style.display = 'none';
    }
    el.heroJoined.textContent = formatJoinedDate(p.bergabungSejak);
  }

  function loadProfilForm() {
    let p = dvGetProfile();
    // Set tanggal bergabung sekali di kunjungan pertama, lalu persist.
    if (!p.bergabungSejak) {
      const todayIso = new Date().toISOString().slice(0, 10);
      p = dvSetProfile({ bergabungSejak: todayIso });
    }
    el.inpNama.value = p.nama || '';
    el.inpEmail.value = p.email || '';
    el.inpTelp.value = p.telp || '';
    el.inpTanggalLahir.value = p.tanggalLahir || '';
    el.inpAlamat.value = p.alamat || '';
    pendingFotoDataUrl = undefined;
    renderAvatarPreview(p.foto, p.nama);
    renderHeroDisplay(p);
  }

  el.btnAvatarCamera.addEventListener('click', () => el.inpFoto.click());

  el.inpFoto.addEventListener('change', () => {
    const file = el.inpFoto.files && el.inpFoto.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      el.profilError.textContent = dvT('set.err_foto_harus_gambar');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      el.profilError.textContent = dvT('set.err_foto_max_size');
      return;
    }
    el.profilError.textContent = '';
    const reader = new FileReader();
    reader.onload = () => {
      pendingFotoDataUrl = reader.result; // preview dulu, belum disimpan
      renderAvatarPreview(pendingFotoDataUrl, el.inpNama.value);
    };
    reader.readAsDataURL(file);
  });

  el.btnAvatarRemove.addEventListener('click', () => {
    pendingFotoDataUrl = null; // preview terhapus, belum disimpan
    el.inpFoto.value = '';
    renderAvatarPreview(null, el.inpNama.value);
  });

  el.inpNama.addEventListener('input', () => {
    // Update preview inisial secara live jika sedang tidak menampilkan foto
    const showingFoto = pendingFotoDataUrl !== undefined ? !!pendingFotoDataUrl : !!dvGetProfile().foto;
    if (!showingFoto) renderAvatarPreview(null, el.inpNama.value);
    el.heroName.textContent = el.inpNama.value.trim() || dvT('set.pengguna_default');
  });
  el.inpEmail.addEventListener('input', () => { el.heroEmail.textContent = el.inpEmail.value.trim() || '-'; });
  el.inpTelp.addEventListener('input', () => {
    const v = el.inpTelp.value.trim();
    el.heroPhone.textContent = v;
    el.heroPhoneRow.style.display = v ? 'flex' : 'none';
  });

  // "Edit Profil" — fokus ke field pertama supaya pengguna langsung bisa mengedit.
  el.btnEditProfil.addEventListener('click', () => {
    el.inpNama.focus();
    el.inpNama.select();
    document.querySelector('.set-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  el.btnSimpanProfil.addEventListener('click', () => {
    const nama = el.inpNama.value.trim();
    const email = el.inpEmail.value.trim();
    const telp = el.inpTelp.value.trim();
    const tanggalLahir = el.inpTanggalLahir.value.trim();
    const alamat = el.inpAlamat.value.trim();

    if (!nama) { el.profilError.textContent = dvT('set.err_nama_wajib'); return; }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { el.profilError.textContent = dvT('set.err_email_invalid'); return; }
    el.profilError.textContent = '';

    const updates = { nama, email, telp, tanggalLahir, alamat };
    if (pendingFotoDataUrl !== undefined) updates.foto = pendingFotoDataUrl;

    const saved = dvSetProfile(updates);
    pendingFotoDataUrl = undefined;
    renderHeroDisplay(saved);
    showToast(dvT('set.toast_profil_tersimpan'));
  });

  // ============================================================
  // ---------- TAB: TAMPILAN ----------
  // ============================================================
  function renderThemeSelection() {
    const current = dvGetTheme();
    el.themeGrid.querySelectorAll('.set-theme-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.themeChoice === current);
    });
  }

  el.themeGrid.querySelectorAll('.set-theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const choice = card.dataset.themeChoice;
      dvSetTheme(choice);
      renderThemeSelection();
      showToast(choice === 'light' ? dvT('set.toast_light_aktif') : dvT('set.toast_dark_aktif'));
    });
  });

  // ============================================================
  // ---------- TAB: PREFERENSI (auto-save) ----------
  // ============================================================
  function loadPreferensiForm() {
    const pref = dvGetPreferences();
    el.prefBahasa.value = pref.bahasa;
    el.prefTanggal.value = pref.formatTanggal;
    el.prefMataUang.value = pref.mataUang;
    el.prefHariAwal.value = pref.hariAwalMinggu;
  }

  let prefIndicatorTimer = null;
  function flashSaveIndicator() {
    el.prefSaveIndicator.classList.add('show');
    clearTimeout(prefIndicatorTimer);
    prefIndicatorTimer = setTimeout(() => el.prefSaveIndicator.classList.remove('show'), 1800);
  }

  [
    [el.prefBahasa, 'bahasa'],
    [el.prefTanggal, 'formatTanggal'],
    [el.prefMataUang, 'mataUang'],
    [el.prefHariAwal, 'hariAwalMinggu']
  ].forEach(([node, key]) => {
    node.addEventListener('change', () => {
      dvSetPreferences({ [key]: node.value });
      flashSaveIndicator();
    });
  });

  // ============================================================
  // ---------- TAB: KEAMANAN ----------
  // ============================================================
  function openModal(overlay) { overlay.classList.add('open'); }
  function closeModal(overlay) { overlay.classList.remove('open'); }

  el.btnUbahPassword.addEventListener('click', () => {
    el.passwordError.textContent = '';
    el.formPassword.reset();
    openModal(el.passwordModal);
  });
  el.passwordModalClose.addEventListener('click', () => closeModal(el.passwordModal));
  el.passwordCancel.addEventListener('click', () => closeModal(el.passwordModal));
  el.passwordModal.addEventListener('click', (e) => { if (e.target === el.passwordModal) closeModal(el.passwordModal); });

  el.formPassword.addEventListener('submit', (e) => {
    e.preventDefault();
    const lama = document.getElementById('pwLama').value;
    const baru = document.getElementById('pwBaru').value;
    const konfirmasi = document.getElementById('pwKonfirmasi').value;

    if (!lama || !baru || !konfirmasi) { el.passwordError.textContent = dvT('set.err_semua_kolom_wajib'); return; }
    if (baru.length < 6) { el.passwordError.textContent = dvT('set.err_password_min'); return; }
    if (baru !== konfirmasi) { el.passwordError.textContent = dvT('set.err_konfirmasi_tidak_cocok'); return; }

    el.passwordError.textContent = '';
    closeModal(el.passwordModal);
    showToast(dvT('set.toast_password_updated'));
  });

  function doLogout() {
    closeModal(el.logoutModal);
    showToast(dvT('set.toast_logout'));
    // Placeholder: arahkan ke halaman login bila tersedia di aplikasi.
    // window.location.href = 'login.html';
  }

  el.btnLogout.addEventListener('click', () => openModal(el.logoutModal));
  if (el.btnSidebarLogout) {
    el.btnSidebarLogout.addEventListener('click', () => openModal(el.logoutModal));
  }
  el.logoutModalClose.addEventListener('click', () => closeModal(el.logoutModal));
  el.logoutCancel.addEventListener('click', () => closeModal(el.logoutModal));
  el.logoutConfirm.addEventListener('click', doLogout);
  el.logoutModal.addEventListener('click', (e) => { if (e.target === el.logoutModal) closeModal(el.logoutModal); });

  // ============================================================
  // ---------- TAB: TENTANG APLIKASI ----------
  // ============================================================
  el.btnCekPembaruan.addEventListener('click', () => {
    showToast(dvT('set.toast_versi_terbaru'));
  });

  // ============================================================
  // ---------- Init ----------
  // ============================================================
  loadProfilForm();
  renderThemeSelection();
  loadPreferensiForm();

  // Jika tema berubah dari tab/tempat lain, refresh kartu terpilih.
  dvOnSettingsChange(renderThemeSelection);
})();