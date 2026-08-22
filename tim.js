// ============================================================
// DVpoint — Halaman Tim (tim.js)
// ============================================================
// Render tabel anggota (Owner + Member lokal) dan wiring modal
// tambah member. Lihat catatan di storage.js (dvGetMembers dkk)
// soal batasan fitur ini — data cuma lokal, belum sinkron ke device
// lain sampai backend (Supabase) aktif.
// ============================================================

const els = {
    tableBody: document.getElementById('timTableBody'),
    btnTambah: document.getElementById('btnTambahMember'),
    overlay: document.getElementById('timModalOverlay'),
    closeBtn: document.getElementById('timModalClose'),
    cancelBtn: document.getElementById('timModalCancel'),
    form: document.getElementById('formMember'),
    inpNama: document.getElementById('timInpNama'),
    inpEmail: document.getElementById('timInpEmail'),
    inpPassword: document.getElementById('timInpPassword'),
    inpPasswordKonfirmasi: document.getElementById('timInpPasswordKonfirmasi'),
    errorEl: document.getElementById('timModalError')
};

function getInisial(nama) {
    if (!nama) return '?';
    const parts = nama.trim().split(/\s+/);
    return parts.length > 1
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : parts[0].slice(0, 2).toUpperCase();
}

function render() {
    const profile = dvGetProfile();
    const members = dvGetMembers();
    const rows = [];

    // Baris Owner (dari profil device ini — selalu 1, tidak bisa dihapus)
    rows.push(`
        <tr>
            <td>
                <div class="tim-member-cell">
                    <div class="tim-avatar owner">${getInisial(profile.nama)}</div>
                    <div>${escapeHtml(profile.nama || '-')}</div>
                </div>
            </td>
            <td>${escapeHtml(profile.email || '-')}</td>
            <td><span class="tim-role-badge owner">${dvT('tim.role_owner')}</span></td>
            <td><span class="tim-status-pill"><span class="dot"></span>${dvT('tim.status_aktif')}</span></td>
            <td></td>
        </tr>
    `);

    // Baris Member (data lokal)
    members.forEach(m => {
        const nonaktif = m.status === 'nonaktif';
        rows.push(`
            <tr>
                <td>
                    <div class="tim-member-cell">
                        <div class="tim-avatar">${getInisial(m.nama)}</div>
                        <div>${escapeHtml(m.nama || '-')}</div>
                    </div>
                </td>
                <td>${escapeHtml(m.email || '-')}</td>
                <td><span class="tim-role-badge member">${dvT('tim.role_member')}</span></td>
                <td><span class="tim-status-pill ${nonaktif ? 'nonaktif' : ''}"><span class="dot"></span>${nonaktif ? dvT('tim.status_nonaktif') : dvT('tim.status_aktif')}</span></td>
                <td style="text-align:right;">
                    <button class="tim-row-action" data-id="${m.id}" title="${dvT('common.hapus')}">
                        <svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"></path></svg>
                    </button>
                </td>
            </tr>
        `);
    });

    els.tableBody.innerHTML = rows.join('');

    els.tableBody.querySelectorAll('.tim-row-action').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const m = members.find(x => x.id === id);
            dvShowConfirm(dvT('tim.confirm_hapus', { nama: m ? m.nama : '' }), () => {
                dvDeleteMember(id);
                dvShowGenericToast(dvT('tim.toast_dihapus'));
                render();
            }, { danger: true });
        });
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function openModal() {
    els.form.reset();
    els.errorEl.textContent = '';
    els.overlay.classList.add('open');
}
function closeModal() {
    els.overlay.classList.remove('open');
}

els.btnTambah?.addEventListener('click', openModal);
els.closeBtn?.addEventListener('click', closeModal);
els.cancelBtn?.addEventListener('click', closeModal);
els.overlay?.addEventListener('click', (e) => { if (e.target === els.overlay) closeModal(); });

els.form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nama = els.inpNama.value.trim();
    const email = els.inpEmail.value.trim();
    const password = els.inpPassword.value;
    const passwordKonfirmasi = els.inpPasswordKonfirmasi.value;

    if (!nama) { els.errorEl.textContent = dvT('tim.err_nama_wajib'); return; }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { els.errorEl.textContent = dvT('tim.err_email_invalid'); return; }

    const sudahAda = dvGetMembers().some(m => m.email.toLowerCase() === email.toLowerCase());
    if (sudahAda) { els.errorEl.textContent = dvT('tim.err_email_dipakai'); return; }

    if (password.length < 6) { els.errorEl.textContent = dvT('tim.err_password_min'); return; }
    if (password !== passwordKonfirmasi) { els.errorEl.textContent = dvT('tim.err_password_mismatch'); return; }

    els.errorEl.textContent = '';

    dvShowConfirm(dvT('tim.confirm_tambah'), () => {
        dvAddMember({ nama, email, password });
        closeModal();
        dvShowGenericToast(dvT('tim.toast_ditambahkan'));
        render();
    });
});

render();
dvOnChange(render);

// ---------- Toggle show/hide password ----------
document.querySelectorAll('.pw-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = document.getElementById(btn.getAttribute('data-target'));
        if (!target) return;
        const showing = target.type === 'text';
        target.type = showing ? 'password' : 'text';
        btn.querySelector('.icon-eye').style.display = showing ? '' : 'none';
        btn.querySelector('.icon-eye-off').style.display = showing ? 'none' : '';
    });
});