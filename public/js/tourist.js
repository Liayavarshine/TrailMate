Auth.requireRole('tourist');
setupTopbar();

const wrap = document.getElementById('bookingsWrap');

function bookingCard(b) {
  return el('div', { class: 'pkg-card', style: 'flex-direction:row;cursor:default' }, [
    el('div', { class: 'img-wrap', style: 'width:150px;aspect-ratio:auto;flex-shrink:0' }, [
      el('img', { src: b.image_url, alt: b.package_title, onerror: (e) => { e.target.src = `https://picsum.photos/seed/${b.package_id}/300/300`; } })
    ]),
    el('div', { class: 'body', style: 'flex:1' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:10px' }, [
        el('h3', {}, b.package_title),
        el('span', { class: `pill ${b.status}` }, b.status)
      ]),
      el('div', { class: 'dest' }, `${b.destination} · ${b.duration_days} days`),
      el('div', { class: 'sub', style: 'margin:4px 0' }, [
        `📅 ${fmtDate(b.tour_date)} · 👥 ${b.num_tourists} traveller${b.num_tourists > 1 ? 's' : ''}`,
        b.guide_name ? el('div', {}, `Guide: ${b.guide_name}`) : null
      ]),
      el('div', { class: 'price-row' }, [
        el('div', { class: 'price' }, inr(b.total_price_inr)),
        el('div', { class: 'row-actions' }, bookingActions(b))
      ])
    ])
  ]);
}

function bookingActions(b) {
  const actions = [];
  if (['pending', 'confirmed'].includes(b.status)) {
    actions.push(el('button', { class: 'danger small', onclick: () => cancelBooking(b) }, 'Cancel'));
  }
  if (b.status === 'completed' && !b.hasReview) {
    actions.push(el('button', { class: 'accent small', onclick: () => openReviewModal(b) }, 'Rate & review'));
  }
  if (b.status === 'completed' && b.hasReview) {
    actions.push(el('span', { class: 'sub', style: 'align-self:center' }, '✓ Reviewed'));
  }
  actions.push(el('a', { href: `/package-detail.html?id=${b.package_id}` }, el('button', { class: 'secondary small', type: 'button' }, 'View package')));
  return actions;
}

async function cancelBooking(b) {
  if (!confirm(`Cancel your booking for ${b.package_title}?`)) return;
  try {
    await api(`/bookings/${b.id}/status`, { method: 'PUT', body: { status: 'cancelled' } });
    toast('Booking cancelled');
    loadBookings();
  } catch (err) { toast(err.message, true); }
}

function loadBookings() {
  loadInto(
    wrap,
    () => api('/bookings/mine'),
    (bookings) => bookings.slice().reverse().forEach((b) => wrap.appendChild(bookingCard(b))),
    (bookings) => bookings.length === 0
  ).catch(() => {});
  wrap.querySelectorAll('.empty').forEach((e) => {
    e.textContent = '';
    e.appendChild(el('div', {}, "You haven't booked a trip yet."));
    e.appendChild(el('a', { href: '/packages.html' }, el('button', { class: 'primary small', style: 'margin-top:10px' }, 'Browse packages')));
  });
}

// ---- Review modal ----
function openReviewModal(booking) {
  let rating = 0;
  const root = document.getElementById('reviewModalRoot');
  const starsRow = el('div', { class: 'star-picker' });
  for (let i = 1; i <= 5; i++) {
    const starBtn = el('button', { type: 'button', class: 'icon-star', onclick: () => setRating(i) }, '★');
    starsRow.appendChild(starBtn);
  }
  function setRating(n) {
    rating = n;
    [...starsRow.children].forEach((s, idx) => s.classList.toggle('filled', idx < n));
  }
  const comment = el('textarea', { rows: 3, placeholder: `How was your trip with ${booking.guide_name}?` });

  const modal = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === modal) close(); } }, [
    el('div', { class: 'modal' }, [
      el('h3', {}, `Rate ${booking.guide_name}`),
      el('p', { class: 'sub' }, booking.package_title),
      starsRow,
      comment,
      el('div', { class: 'row-actions' }, [
        el('button', { class: 'primary', onclick: () => submit() }, 'Submit review'),
        el('button', { class: 'secondary', onclick: () => close() }, 'Cancel')
      ])
    ])
  ]);

  function close() { root.innerHTML = ''; }
  async function submit() {
    if (!rating) { toast('Please select a star rating', true); return; }
    try {
      await api('/reviews', { method: 'POST', body: { bookingId: booking.id, rating, comment: comment.value.trim() } });
      toast('Thanks for your review!');
      close();
      loadBookings();
    } catch (err) { toast(err.message, true); }
  }

  root.appendChild(modal);
}

loadBookings();
