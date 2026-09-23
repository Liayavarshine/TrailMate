const me = Auth.requireRole('guide');
setupTopbar();

const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Malayalam', 'Telugu', 'Kannada', 'Bengali', 'Marathi', 'Gujarati', 'Punjabi', 'Konkani', 'Nepali'];
const langGrid = document.getElementById('langGrid');
LANGUAGES.forEach((lang, i) => {
  langGrid.appendChild(el('label', {}, [el('input', { type: 'checkbox', id: `lang_${i}`, value: lang }), lang]));
});

async function loadProfile() {
  const g = await api(`/guides/${me.id}`);
  document.getElementById('pBio').value = g.bio || '';
  document.getElementById('pExperience').value = g.experience_years || 0;
  document.getElementById('pAvailability').checked = !!g.availability;
  const myLangs = (g.languages || []).map((l) => l.toLowerCase());
  langGrid.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.checked = myLangs.includes(cb.value.toLowerCase());
  });

  renderStats(g);
  renderPackages(g.packages);
  renderReviews(g.reviews);
}

function renderStats(g) {
  const wrap = document.getElementById('statsWrap');
  wrap.innerHTML = '';
  const stats = [
    ['Rating', g.avg_rating ? Number(g.avg_rating).toFixed(1) + ' ★' : '—'],
    ['Reviews', g.review_count],
    ['Tours completed', g.completed_tours],
    ['Packages assigned', g.packages.length]
  ];
  stats.forEach(([label, num]) => wrap.appendChild(el('div', { class: 'stat-card' }, [
    el('div', { class: 'num' }, String(num)), el('div', { class: 'label' }, label)
  ])));
}

function renderPackages(packages) {
  const wrap = document.getElementById('packagesWrap');
  wrap.innerHTML = '';
  if (!packages.length) { wrap.appendChild(el('div', { class: 'empty' }, "You haven't been assigned to any packages yet. Contact an admin to get listed.")); return; }
  packages.forEach((p) => wrap.appendChild(el('a', { class: 'pkg-card', href: `/package-detail.html?id=${p.id}`, style: 'pointer-events:none' }, [
    el('div', { class: 'img-wrap' }, el('img', { src: p.image_url, alt: p.title, onerror: (e) => { e.target.src = `https://picsum.photos/seed/${p.id}/400/300`; } })),
    el('div', { class: 'body' }, [el('h3', {}, p.title), el('div', { class: 'dest' }, p.destination)])
  ])));
}

function renderReviews(reviews) {
  const wrap = document.getElementById('reviewsWrap');
  wrap.innerHTML = '';
  if (!reviews.length) { wrap.appendChild(el('div', { class: 'empty' }, 'No reviews yet.')); return; }
  reviews.forEach((r) => wrap.appendChild(el('div', { class: 'card', style: 'background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px' }, [
    el('div', { style: 'display:flex;justify-content:space-between' }, [
      el('strong', { style: 'font-size:13px' }, `${r.tourist_name} · ${r.package_title}`),
      el('span', { class: 'stars' }, starString(r.rating))
    ]),
    el('div', { class: 'sub', style: 'margin:4px 0' }, fmtDate(r.created_at)),
    r.comment ? el('p', { style: 'margin:0;font-size:13px' }, r.comment) : null
  ])));
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const languages = [...langGrid.querySelectorAll('input:checked')].map((c) => c.value);
    await api('/guides/me', {
      method: 'PUT',
      body: { bio: pBio.value, languages, experience_years: Number(pExperience.value) || 0, availability: pAvailability.checked }
    });
    toast('Profile updated');
  } catch (err) { toast(err.message, true); }
});

async function loadDocs() {
  const wrap = document.getElementById('docsWrap');
  await loadInto(wrap, () => api('/documents/mine'), (docs) => {
    const table = el('table', {}, [
      el('thead', {}, el('tr', {}, ['Type', 'File', 'Size', 'Status', 'Action'].map((h) => el('th', {}, h)))),
      el('tbody', {}, docs.map((d) => el('tr', {}, [
        el('td', {}, d.type),
        el('td', {}, d.filename),
        el('td', { style: 'font-size:12px;color:var(--ink-soft)' }, d.file_size ? `${(d.file_size / 1024).toFixed(1)} KB` : '—'),
        el('td', {}, el('span', { class: `pill ${d.status}` }, d.status)),
        el('td', {}, el('button', {
          class: 'secondary small',
          onclick: () => window.open(`/api/documents/${d.id}/file?token=${encodeURIComponent(Auth.token)}`, '_blank')
        }, 'View'))
      ])))
    ]);
    wrap.appendChild(table);
  }, (docs) => docs.length === 0).catch(() => {});
}

document.getElementById('docForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const file = dFile.files[0];
    if (!file) throw new Error('Please choose a document or image file');
    const validExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    const hasValidExt = validExts.some((ext) => file.name.toLowerCase().endsWith(ext));
    const isImageOrPdf = file.type === 'application/pdf' || file.type.startsWith('image/');
    if (!hasValidExt && !isImageOrPdf) {
      throw new Error('Only PDF documents and image files (JPG, PNG, WebP) are allowed');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size exceeds the 10 MB limit');
    }
    const body = new FormData();
    body.append('type', dType.value.trim());
    body.append('document', file);
    await api('/documents', { method: 'POST', body });
    toast('Document submitted for verification');
    e.target.reset();
    loadDocs();
  } catch (err) { toast(err.message, true); }
});

function bookingRow(b) {
  return el('tr', {}, [
    el('td', { class: 'pkg-cell' }, [
      el('img', { src: b.image_url, onerror: (e) => { e.target.src = `https://picsum.photos/seed/${b.package_id}/100/100`; } }),
      el('span', {}, b.package_title)
    ]),
    el('td', {}, b.tourist_name),
    el('td', {}, fmtDate(b.tour_date)),
    el('td', {}, String(b.num_tourists)),
    el('td', {}, inr(b.guide_payout_inr)),
    el('td', {}, el('span', { class: `pill ${b.status}` }, b.status)),
    el('td', {}, b.status === 'confirmed'
      ? el('button', { class: 'primary small', onclick: () => markCompleted(b) }, 'Mark completed')
      : b.status === 'completed'
        ? el('span', { class: `pill ${b.payout_claimed ? 'verified' : 'pending'}` }, b.payout_claimed ? 'Claimed' : 'Not claimed')
        : el('span', { class: 'sub' }, '—'))
  ]);
}

async function markCompleted(b) {
  if (!confirm(`Mark the tour for ${b.tourist_name} as completed?`)) return;
  try {
    await api(`/bookings/${b.id}/status`, { method: 'PUT', body: { status: 'completed' } });
    toast('Marked as completed');
    loadBookings();
    loadProfile(); // refresh completed_tours count
  } catch (err) { toast(err.message, true); }
}

function loadBookings() {
  const wrap = document.getElementById('bookingsWrap');
  loadInto(wrap, () => api('/bookings/received'), (bookings) => {
    const table = el('table', {}, [
      el('thead', {}, el('tr', {}, ['Package', 'Tourist', 'Date', 'Travellers', 'Your pay', 'Status', 'Actions'].map((h) => el('th', {}, h)))),
      el('tbody', {}, bookings.slice().reverse().map(bookingRow))
    ]);
    wrap.appendChild(table);
  }, (bookings) => bookings.length === 0).catch(() => {});
}

document.getElementById('claimPayoutBtn').addEventListener('click', async (e) => {
  e.target.disabled = true;
  try {
    const result = await api('/payouts/claim', { method: 'POST' });
    toast(`${result.message} ${inr(result.amountInr)} credited. Transaction: ${result.transactionId}`);
    loadBookings();
  } catch (err) {
    toast(err.message, true);
  } finally {
    e.target.disabled = false;
  }
});

loadProfile();
loadDocs();
loadBookings();
