// api.js — shared helpers loaded on every page

const Auth = {
  get token() { return localStorage.getItem('tbs_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('tbs_user')); } catch { return null; } },
  set(token, user) {
    localStorage.setItem('tbs_token', token);
    localStorage.setItem('tbs_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('tbs_token');
    localStorage.removeItem('tbs_user');
  },
  requireRole(role) {
    const u = Auth.user;
    if (!Auth.token || !u || u.role !== role) {
      window.location.href = '/index.html';
      return null;
    }
    return u;
  }
};

async function api(path, { method = 'GET', body } = {}) {
  const isFormData = body instanceof FormData;
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
    });
  } catch {
    throw new Error('Network error — could not reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(message, isError = false) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'oninput') node.addEventListener('input', v);
    else if (k === 'html') node.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === undefined || c === null || c === false) return;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  });
  return node;
}

// ---- formatting helpers --------------------------------------------------

function inr(amount) {
  const n = Number(amount) || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function starString(rating) {
  const r = Math.round(Number(rating) || 0);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

function ratingBlock(rating, count) {
  if (rating === null || rating === undefined) {
    return el('span', { class: 'no-rating' }, 'No reviews yet');
  }
  return el('span', { class: 'rating-row' }, [
    el('span', { class: 'stars' }, starString(rating)),
    el('span', { class: 'rating-num' }, Number(rating).toFixed(1)),
    count !== undefined ? el('span', {}, `(${count})`) : null
  ]);
}

function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---- async render helper: shows a spinner, then content OR a retry-able error ----
async function loadInto(container, fetchFn, renderFn, emptyCheck) {
  container.innerHTML = '';
  container.appendChild(el('div', { class: 'loading-row' }, [el('div', { class: 'spinner' }), 'Loading...']));
  try {
    const data = await fetchFn();
    container.innerHTML = '';
    if (emptyCheck && emptyCheck(data)) {
      container.appendChild(el('div', { class: 'empty' }, 'Nothing here yet.'));
      return data;
    }
    renderFn(data);
    return data;
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('div', { class: 'error-banner' }, [
      el('span', {}, err.message || 'Something went wrong.'),
      el('button', { class: 'secondary small', onclick: () => loadInto(container, fetchFn, renderFn, emptyCheck) }, 'Retry')
    ]));
    throw err;
  }
}

function setupTopbar() {
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.addEventListener('click', () => { Auth.clear(); window.location.href = '/index.html'; });
  const nameEl = document.getElementById('userName');
  if (nameEl && Auth.user) nameEl.textContent = Auth.user.name;
  const path = window.location.pathname;
  document.querySelectorAll('header.topbar nav a').forEach((a) => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
}
