// ============================================================
// DVpoint — Auth Guard (dipakai di semua halaman selain index.html)
// ============================================================
(function () {
  const SESSION_KEY = 'dvpoint_session';
  const session = localStorage.getItem(SESSION_KEY);

  if (!session) {
    window.location.href = 'index.html';
    return;
  }

  document.addEventListener('DOMContentLoaded', () => {
    try {
      const { email } = JSON.parse(session);
      const userNameEl = document.querySelector('.user-name');
      if (userNameEl && email) userNameEl.title = email;
    } catch (e) {
      localStorage.removeItem(SESSION_KEY);
      window.location.href = 'index.html';
    }
  });

  window.dvpointLogout = function () {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
  };
})();
