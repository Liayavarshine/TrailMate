const me = Auth.requireRole('tourist');
setupTopbar();

const pageWrap = document.getElementById('pageWrap');
const packageId = new URLSearchParams(window.location.search).get('id');

let currentPackage = null;
let selectedGuideId = null;
let guideList = [];

if (!packageId) {
  pageWrap.innerHTML = '';
  pageWrap.appendChild(el('div', { class: 'error-banner' }, [
    el('span', {}, 'No package specified.'),
    el('a', { href: '/packages.html' }, el('button', { class: 'secondary small' }, 'Browse packages'))
  ]));
} else {
  init();
}

async function init() {
  try {
    currentPackage = await api(`/packages/${packageId}`);
    render();
    loadGuides();
  } catch (err) {
    pageWrap.innerHTML = '';
    pageWrap.appendChild(el('div', { class: 'error-banner' }, [
      el('span', {}, err.message),
      el('button', { class: 'secondary small', onclick: init }, 'Retry')
    ]));
  }
}

function render() {
  const p = currentPackage;
  pageWrap.innerHTML = '';

  pageWrap.appendChild(el('div', { class: 'detail-hero' }, [
    el('img', { src: p.image_url, alt: p.title, onerror: (e) => { e.target.src = `https://picsum.photos/seed/${p.id}/1200/500`; } }),
    el('div', { class: 'overlay' }, [
      el('div', {}, [
        el('h1', {}, p.title),
        el('div', { class: 'meta' }, [
          el('span', {}, `📍 ${p.destination}, ${p.state}`),
          el('span', {}, `🗓 ${p.duration_days} days`),
          el('span', {}, `👥 Up to ${p.max_group_size} people`),
          p.avg_rating ? el('span', {}, `${starString(p.avg_rating)} ${Number(p.avg_rating).toFixed(1)} (${p.review_count})`) : el('span', {}, 'No reviews yet')
        ])
      ])
    ])
  ]));

  const grid = el('div', { class: 'detail-grid' });
  pageWrap.appendChild(grid);

  const leftCol = el('div', { class: 'detail-col' });
  grid.appendChild(leftCol);

  leftCol.appendChild(el('div', { class: 'block' }, [
    el('h3', {}, 'About this trip'),
    el('p', { style: 'font-size:13.5px;color:var(--ink-soft);margin:0' }, p.description)
  ]));

  leftCol.appendChild(el('div', { class: 'block' }, [
    el('h3', {}, `Itinerary (${p.itinerary.length} days)`),
    el('div', { class: 'itinerary' }, p.itinerary.map((day) =>
      el('div', { class: 'itin-day' }, [
        el('div', { class: 'num' }, day.day),
        el('div', { class: 'content' }, [
          el('h4', {}, day.title),
          el('p', {}, day.details)
        ])
      ])
    ))
  ]));

  const guidesBlock = el('div', { class: 'block' }, [
    el('h3', {}, 'Available guides'),
    el('p', { class: 'sub', style: 'margin:-8px 0 14px' }, 'Recommended based on your language preferences, ratings, and experience — but you can pick any guide.'),
    el('div', { class: 'card-grid guides', id: 'guideGrid' }, el('div', { class: 'loading-row' }, [el('div', { class: 'spinner' }), 'Finding guides...']))
  ]);
  leftCol.appendChild(guidesBlock);

  leftCol.appendChild(el('div', { class: 'block' }, [
    el('h3', {}, `Reviews (${p.reviews.length})`),
    p.reviews.length
      ? el('div', {}, p.reviews.map((r) => el('div', { style: 'padding:10px 0;border-bottom:1px solid var(--border-soft)' }, [
          el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
            el('strong', { style: 'font-size:13px' }, r.tourist_name),
            el('span', { class: 'stars' }, starString(r.rating))
          ]),
          el('div', { style: 'font-size:12px;color:var(--ink-faint);margin:2px 0 4px' }, `Guided by ${r.guide_name} · ${fmtDate(r.created_at)}`),
          r.comment ? el('p', { style: 'font-size:13px;margin:0' }, r.comment) : null
        ])))
      : el('div', { class: 'empty' }, 'No reviews yet — be the first to complete this tour!')
  ]));

  // ---- Booking panel ----
  const rightCol = el('div', {});
  grid.appendChild(rightCol);

  const today = new Date(); today.setDate(today.getDate() + 3);
  const minDate = today.toISOString().slice(0, 10);

  const panel = el('div', { class: 'booking-panel' }, [
    el('div', { class: 'price-big' }, [inr(p.price_inr), el('small', {}, ' / person')]),
    el('form', { id: 'bookingForm' }, [
      el('label', {}, 'Tour date'),
      el('input', { type: 'date', id: 'tourDate', min: minDate, required: true }),
      el('label', {}, 'Number of tourists'),
      el('input', { type: 'number', id: 'numTourists', min: 1, max: p.max_group_size, value: 1, required: true }),
      el('label', {}, 'Selected guide'),
      el('div', { id: 'selectedGuideLabel', class: 'sub', style: 'margin-bottom:10px' }, 'Pick a guide below ↓'),
      el('div', { class: 'price-summary' }, [
        el('div', { class: 'row' }, [el('span', {}, 'Price per person'), el('span', { id: 'sumPerPerson' }, inr(p.price_inr))]),
        el('div', { class: 'row' }, [el('span', {}, 'Tourists'), el('span', { id: 'sumTourists' }, '1')]),
        el('div', { class: 'row total' }, [el('span', {}, 'Total'), el('span', { id: 'sumTotal' }, inr(p.price_inr))])
      ]),
      el('button', { type: 'submit', class: 'primary full', id: 'confirmBtn' }, 'Confirm booking')
    ])
  ]);
  rightCol.appendChild(panel);

  document.getElementById('numTourists').addEventListener('input', updatePriceSummary);
  document.getElementById('bookingForm').addEventListener('submit', submitBooking);
  updatePriceSummary();
}

function updatePriceSummary() {
  const n = Math.max(1, Number(document.getElementById('numTourists').value) || 1);
  document.getElementById('sumTourists').textContent = n;
  document.getElementById('sumTotal').textContent = inr(currentPackage.price_inr * n);
}

async function loadGuides() {
  const grid = document.getElementById('guideGrid');
  const langs = (me.language_prefs || []).join(',');
  await loadInto(
    grid,
    () => api(`/packages/${packageId}/guides${langs ? `?lang=${encodeURIComponent(langs)}` : ''}`),
    (guides) => {
      guideList = guides;
      guides.forEach((g) => grid.appendChild(guideCard(g)));
    },
    (guides) => guides.length === 0
  );
}

function guideCard(g) {
  const myLangs = (me.language_prefs || []).map((l) => l.toLowerCase());
  const card = el('div', { class: 'guide-card', id: `guide-${g.id}`, onclick: () => selectGuide(g.id) }, [
    g.recommended ? el('span', { class: 'recommended-badge' }, '★ Recommended') : null,
    el('div', { class: 'head' }, [
      el('div', { class: 'avatar' }, initials(g.name)),
      el('div', {}, [
        el('h4', {}, g.name),
        el('div', { class: 'exp' }, `${g.experience_years} yrs experience · ${g.completed_tours} tours completed`)
      ])
    ]),
    g.bio ? el('p', { class: 'bio' }, g.bio) : null,
    el('div', { class: 'lang-tags' }, (g.languages || []).map((l) =>
      el('span', { class: `lang-tag${myLangs.includes(l.toLowerCase()) ? ' match' : ''}` }, l)
    )),
    el('div', { class: 'foot' }, [
      ratingBlock(g.avg_rating, g.review_count),
      el('button', { class: 'secondary small', type: 'button' }, g.id === selectedGuideId ? 'Selected ✓' : 'Select')
    ])
  ]);
  if (!g.availability) {
    card.style.opacity = '0.55';
    card.style.pointerEvents = 'none';
    card.querySelector('.foot button').textContent = 'Unavailable';
  }
  return card;
}

function selectGuide(id) {
  selectedGuideId = id;
  document.querySelectorAll('.guide-card').forEach((c) => {
    c.classList.remove('selected');
    const button = c.querySelector('.foot button');
    if (button && button.textContent !== 'Unavailable') button.textContent = 'Select';
  });
  const chosen = document.getElementById(`guide-${id}`);
  if (chosen) {
    chosen.classList.add('selected');
    chosen.querySelector('.foot button').textContent = 'Selected ✓';
  }
  const g = guideList.find((x) => x.id === id);
  document.getElementById('selectedGuideLabel').textContent = g ? `${g.name}${g.recommended ? ' (Recommended)' : ''}` : 'Pick a guide below ↓';
}

async function submitBooking(e) {
  e.preventDefault();
  if (!selectedGuideId) { toast('Please select a guide before confirming', true); return; }
  const tourDate = document.getElementById('tourDate').value;
  const numTourists = Number(document.getElementById('numTourists').value);
  if (!tourDate) { toast('Please choose a tour date', true); return; }

  const btn = document.getElementById('confirmBtn');
  btn.disabled = true; btn.textContent = 'Booking...';
  try {
    const booking = await api('/bookings', {
      method: 'POST',
      body: { packageId: Number(packageId), tourDate, numTourists, guideId: selectedGuideId }
    });
    // Immediately settle payment (mock gateway) so the booking is confirmed end-to-end
    btn.textContent = 'Processing payment...';
    await api('/payments', { method: 'POST', body: { bookingId: booking.id, method: 'upi' } });
    toast('Booking confirmed! Redirecting to My Bookings...');
    setTimeout(() => { window.location.href = '/tourist.html'; }, 900);
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false; btn.textContent = 'Confirm booking';
  }
}
