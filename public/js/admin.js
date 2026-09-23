Auth.requireRole('admin');
setupTopbar();

// ===================== REPORTS =====================
async function loadStats() {
  const r = await api('/admin/reports');
  const wrap = document.getElementById('statsWrap');
  wrap.innerHTML = '';
  const stats = [
    ['Total users', r.totalUsers], ['Tourists', r.totalTourists], ['Guides', r.totalGuides],
    ['Packages', r.totalPackages], ['Bookings', r.totalBookings],
    ['Revenue', inr(r.totalRevenueInr)], ['Avg. rating', r.averageRating ?? '—'], ['Pending docs', r.pendingDocuments]
  ];
  stats.forEach(([label, num]) => wrap.appendChild(el('div', { class: 'stat-card' }, [
    el('div', { class: 'num' }, String(num)), el('div', { class: 'label' }, label)
  ])));
}

// ===================== PACKAGES =====================
let allGuidesCache = null;
async function getAllGuides() {
  if (!allGuidesCache) allGuidesCache = await api('/admin/users?role=guide');
  return allGuidesCache;
}

async function loadPackages() {
  const wrap = document.getElementById('packagesWrap');
  await loadInto(wrap, () => api('/admin/packages'), (pkgs) => {
    const table = el('table', {}, [
      el('thead', {}, el('tr', {}, ['Package', 'Destination', 'Price', 'Duration', 'Guides', 'Status', 'Rating', 'Actions'].map((h) => el('th', {}, h)))),
      el('tbody', {}, pkgs.map((p) => el('tr', {}, [
        el('td', { class: 'pkg-cell' }, [el('img', { src: p.image_url, onerror: (e) => { e.target.src = `https://picsum.photos/seed/${p.id}/100/100`; } }), el('span', {}, p.title)]),
        el('td', {}, `${p.destination}, ${p.state}`),
        el('td', {}, inr(p.price_inr)),
        el('td', {}, `${p.duration_days}d`),
        el('td', {}, String(p.guide_count)),
        el('td', {}, el('span', { class: `pill ${p.status}` }, p.status)),
        el('td', {}, p.avg_rating ? `${Number(p.avg_rating).toFixed(1)} ★ (${p.review_count})` : '—'),
        el('td', {}, el('div', { class: 'row-actions' }, [
          el('button', { class: 'secondary small', onclick: () => openPackageModal(p) }, 'Edit'),
          el('button', { class: p.status === 'active' ? 'danger small' : 'primary small', onclick: () => toggleStatus(p) }, p.status === 'active' ? 'Deactivate' : 'Activate')
        ]))
      ])))
    ]);
    wrap.appendChild(table);
  }, (pkgs) => pkgs.length === 0).catch(() => {});
}

async function toggleStatus(p) {
  try {
    await api(`/packages/${p.id}`, { method: 'PUT', body: { status: p.status === 'active' ? 'inactive' : 'active' } });
    toast(`${p.title} ${p.status === 'active' ? 'deactivated' : 'activated'}`);
    loadPackages();
  } catch (err) { toast(err.message, true); }
}

document.getElementById('addPackageBtn').addEventListener('click', () => openPackageModal(null));

async function openPackageModal(pkg) {
  const root = document.getElementById('modalRoot');
  const guides = await getAllGuides();
  const assignedIds = new Set((pkg?.package_guides || []).map(String));
  // fetch full detail (with itinerary) if editing
  let full = pkg;
  if (pkg) { try { full = await api(`/packages/${pkg.id}`); } catch { /* use list row as fallback */ } }

  const itineraryText = full?.itinerary
    ? full.itinerary.map((d) => `${d.day}|${d.title}|${d.details}`).join('\n')
    : '1|Arrival|Check in and explore\n2|Sightseeing|Visit local attractions';

  const fields = {
    title: el('input', { value: full?.title || '', placeholder: 'e.g. Ooty Hill Station Retreat' }),
    destination: el('input', { value: full?.destination || '', placeholder: 'e.g. Ooty' }),
    state: el('input', { value: full?.state || '', placeholder: 'e.g. Tamil Nadu' }),
    category: el('input', { value: full?.category || '', placeholder: 'e.g. Hill Station' }),
    duration_days: el('input', { type: 'number', min: 1, value: full?.duration_days || 3 }),
    price_inr: el('input', { type: 'number', min: 0, value: full?.price_inr || 9999 }),
    max_group_size: el('input', { type: 'number', min: 1, value: full?.max_group_size || 10 }),
    image_url: el('input', { value: full?.image_url || '', placeholder: 'https://...' }),
    description: el('textarea', { rows: 2 }, full?.description || ''),
    itinerary: el('textarea', { rows: 4, id: 'itineraryInput' }, itineraryText)
  };

  const guideChecks = guides.map((g) => {
    const cb = el('input', { type: 'checkbox', value: g.id, id: `gsel_${g.id}` });
    if (full?.id) {
      // will be checked below once we know current assignment
    }
    return el('label', {}, [cb, g.name]);
  });

  const modal = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === modal) root.innerHTML = ''; } }, [
    el('div', { class: 'modal', style: 'max-width:560px;max-height:88vh;overflow:auto' }, [
      el('h3', {}, full ? `Edit: ${full.title}` : 'Add new package'),
      el('div', { class: 'field-row' }, [
        el('div', {}, [el('label', {}, 'Title'), fields.title]),
        el('div', {}, [el('label', {}, 'Destination'), fields.destination])
      ]),
      el('div', { class: 'field-row' }, [
        el('div', {}, [el('label', {}, 'State'), fields.state]),
        el('div', {}, [el('label', {}, 'Category'), fields.category])
      ]),
      el('div', { class: 'field-row' }, [
        el('div', {}, [el('label', {}, 'Duration (days)'), fields.duration_days]),
        el('div', {}, [el('label', {}, 'Price per person (₹)'), fields.price_inr])
      ]),
      el('div', { class: 'field-row' }, [
        el('div', {}, [el('label', {}, 'Max group size'), fields.max_group_size]),
        el('div', {}, [el('label', {}, 'Image URL'), fields.image_url])
      ]),
      el('label', {}, 'Description'), fields.description,
      el('label', {}, 'Itinerary — one line per day: day|title|details'), fields.itinerary,
      el('label', {}, 'Assign guides'),
      el('div', { class: 'check-grid' }, guideChecks),
      el('div', { class: 'row-actions', style: 'margin-top:14px' }, [
        el('button', { class: 'primary', onclick: () => savePackage(full, fields, guideChecks) }, full ? 'Save changes' : 'Create package'),
        el('button', { class: 'secondary', onclick: () => { root.innerHTML = ''; } }, 'Cancel')
      ])
    ])
  ]);
  root.appendChild(modal);

  // pre-check assigned guides for edit mode
  if (full?.id) {
    try {
      const pkgGuides = await api(`/packages/${full.id}/guides`);
      const ids = new Set(pkgGuides.map((g) => g.id));
      guideChecks.forEach((label) => {
        const cb = label.querySelector('input');
        if (ids.has(Number(cb.value))) cb.checked = true;
      });
    } catch { /* non-critical */ }
  }
}

function parseItinerary(text) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [day, title, ...rest] = line.split('|');
    return { day: Number(day) || 1, title: (title || '').trim(), details: rest.join('|').trim() };
  });
}

async function savePackage(existing, fields, guideChecks) {
  const body = {
    title: fields.title.value.trim(),
    destination: fields.destination.value.trim(),
    state: fields.state.value.trim(),
    category: fields.category.value.trim(),
    duration_days: Number(fields.duration_days.value),
    price_inr: Number(fields.price_inr.value),
    max_group_size: Number(fields.max_group_size.value),
    image_url: fields.image_url.value.trim(),
    description: fields.description.value.trim(),
    itinerary: parseItinerary(fields.itinerary.value)
  };
  if (!body.title || !body.destination || !body.state || !body.category || !body.price_inr || !body.duration_days) {
    toast('Please fill in all required fields', true); return;
  }
  const guideIds = guideChecks.filter((l) => l.querySelector('input').checked).map((l) => Number(l.querySelector('input').value));

  try {
    let pkg;
    if (existing) {
      pkg = await api(`/packages/${existing.id}`, { method: 'PUT', body });
      await api(`/packages/${existing.id}/guides`, { method: 'PUT', body: { guideIds } });
    } else {
      pkg = await api('/packages', { method: 'POST', body: { ...body, guideIds } });
    }
    toast(existing ? 'Package updated' : 'Package created');
    document.getElementById('modalRoot').innerHTML = '';
    loadPackages();
  } catch (err) { toast(err.message, true); }
}

// ===================== DOCUMENTS =====================
async function loadDocs() {
  const wrap = document.getElementById('docsWrap');
  await loadInto(wrap, () => api('/admin/documents'), (docs) => {
    const table = el('table', {}, [
      el('thead', {}, el('tr', {}, ['Guide', 'Type', 'File', 'Uploaded', 'Status', 'Actions'].map((h) => el('th', {}, h)))),
      el('tbody', {}, docs.map((d) => el('tr', {}, [
        el('td', {}, [
          el('strong', {}, d.guide_name),
          d.guide_email ? el('div', { style: 'font-size:11.5px;color:var(--ink-soft)' }, d.guide_email) : null
        ]),
        el('td', {}, d.type),
        el('td', {}, [
          el('div', {}, d.filename),
          d.file_size ? el('div', { style: 'font-size:11.5px;color:var(--ink-faint)' }, `${(d.file_size / 1024).toFixed(1)} KB`) : null
        ]),
        el('td', {}, fmtDate(d.upload_date)),
        el('td', {}, el('span', { class: `pill ${d.status}` }, d.status)),
        el('td', {}, el('div', { class: 'row-actions' }, [
          el('button', { class: 'secondary small', onclick: () => viewDocument(d) }, 'View document'),
          d.status === 'pending'
            ? el('span', { class: 'row-actions' }, [
                el('button', { class: 'accent small', onclick: () => verifyDoc(d, 'verified') }, 'Verify'),
                el('button', { class: 'danger small', onclick: () => verifyDoc(d, 'rejected') }, 'Reject')
              ])
            : d.status === 'verified'
              ? el('button', { class: 'danger small', onclick: () => verifyDoc(d, 'rejected') }, 'Reject')
              : el('button', { class: 'accent small', onclick: () => verifyDoc(d, 'verified') }, 'Verify')
        ]))
      ])))
    ]);
    wrap.appendChild(table);
  }, (docs) => docs.length === 0).catch(() => {});
}

function viewDocument(d) {
  const root = document.getElementById('modalRoot');
  const fileUrl = `/api/admin/documents/${d.id}/file?token=${encodeURIComponent(Auth.token)}`;
  const isImage = (d.mime_type && d.mime_type.startsWith('image/')) || /\.(jpe?g|png|webp)$/i.test(d.filename);

  const previewEl = isImage
    ? el('div', { style: 'text-align:center;padding:16px;background:var(--surface-2);border-radius:10px;margin:14px 0;max-height:500px;overflow:auto;' }, [
        el('img', {
          src: fileUrl,
          alt: d.filename,
          style: 'max-width:100%;max-height:460px;object-fit:contain;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,0.1)'
        })
      ])
    : el('div', { style: 'margin:14px 0;' }, [
        el('iframe', {
          src: fileUrl,
          style: 'width:100%;height:500px;border:1px solid var(--border);border-radius:10px;background:#fff;',
          title: d.filename
        })
      ]);

  const modal = el('div', { class: 'modal-overlay', onclick: (e) => { if (e.target === modal) root.innerHTML = ''; } }, [
    el('div', { class: 'modal', style: 'max-width:760px;max-height:92vh;overflow:auto;' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px' }, [
        el('div', {}, [
          el('h3', { style: 'margin:0 0 4px' }, `Document Verification — ${d.guide_name}`),
          el('div', { class: 'sub', style: 'font-size:12.5px' }, `${d.type} · ${d.filename} · Uploaded ${fmtDate(d.upload_date)}`)
        ]),
        el('span', { class: `pill ${d.status}` }, d.status)
      ]),
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);padding:10px 14px;border-radius:8px;font-size:12.5px;margin-bottom:12px;' }, [
        el('div', {}, [
          el('strong', {}, d.guide_name),
          d.guide_email ? el('span', { style: 'color:var(--ink-soft);margin-left:6px' }, `(${d.guide_email})`) : null,
          d.file_size ? el('span', { style: 'color:var(--ink-faint);margin-left:8px' }, `· ${(d.file_size / 1024).toFixed(1)} KB`) : null
        ]),
        el('a', {
          href: fileUrl,
          target: '_blank',
          style: 'color:var(--brand);font-weight:700;text-decoration:none;font-size:12px'
        }, 'Open in new tab ↗')
      ]),
      previewEl,
      el('div', { class: 'row-actions', style: 'justify-content:flex-end;margin-top:16px;gap:10px' }, [
        d.status !== 'verified'
          ? el('button', { class: 'primary', onclick: () => verifyDoc(d, 'verified') }, 'Verify document')
          : null,
        d.status !== 'rejected'
          ? el('button', { class: 'danger', onclick: () => verifyDoc(d, 'rejected') }, 'Reject document')
          : null,
        el('button', { class: 'secondary', onclick: () => { root.innerHTML = ''; } }, 'Close')
      ])
    ])
  ]);

  root.innerHTML = '';
  root.appendChild(modal);
}

async function verifyDoc(d, status) {
  try {
    await api(`/admin/documents/${d.id}/verify`, { method: 'PUT', body: { status } });
    toast(`Document ${status}`);
    const root = document.getElementById('modalRoot');
    if (root) root.innerHTML = '';
    loadDocs();
    loadStats(); // refresh reports stat counters (e.g. pending documents count)
  } catch (err) { toast(err.message, true); }
}

// ===================== USERS =====================
async function loadUsers() {
  const wrap = document.getElementById('usersWrap');
  await loadInto(wrap, () => api('/admin/users'), (users) => {
    const table = el('table', {}, [
      el('thead', {}, el('tr', {}, ['Name', 'Email', 'Role', 'Details', 'Status', 'Actions'].map((h) => el('th', {}, h)))),
      el('tbody', {}, users.map((u) => el('tr', {}, [
        el('td', {}, u.name), el('td', {}, u.email),
        el('td', {}, el('span', { class: 'badge', style: 'margin:0' }, u.role)),
        el('td', { style: 'font-size:12px;color:var(--ink-soft)' },
          u.role === 'guide' ? `${(u.languages || []).join(', ') || '—'} · ${u.experience_years || 0}y · ${u.avg_rating ? Number(u.avg_rating).toFixed(1) + '★' : 'unrated'}` :
          u.role === 'tourist' ? (u.language_prefs || []).join(', ') || '—' : '—'),
        el('td', {}, el('span', { class: `pill ${u.status}` }, u.status)),
        el('td', {}, u.role === 'admin' ? el('span', { class: 'sub' }, '—') : el('div', { class: 'row-actions' }, [
          u.status === 'active'
            ? el('button', { class: 'danger small', onclick: () => setUserStatus(u, 'suspended') }, 'Suspend')
            : el('button', { class: 'primary small', onclick: () => setUserStatus(u, 'active') }, 'Activate')
        ]))
      ])))
    ]);
    wrap.appendChild(table);
  }, (users) => users.length === 0).catch(() => {});
}

async function setUserStatus(u, status) {
  try {
    await api(`/admin/users/${u.id}/status`, { method: 'PUT', body: { status } });
    toast(`${u.name} ${status}`);
    loadUsers();
  } catch (err) { toast(err.message, true); }
}

// ===================== BOOKINGS =====================
async function loadBookings() {
  const wrap = document.getElementById('bookingsWrap');
  await loadInto(wrap, () => api('/admin/bookings'), (bookings) => {
    const table = el('table', {}, [
      el('thead', {}, el('tr', {}, ['Package', 'Tourist', 'Guide', 'Date', 'Amount', 'Status'].map((h) => el('th', {}, h)))),
      el('tbody', {}, bookings.slice(0, 100).map((b) => el('tr', {}, [
        el('td', {}, b.package_title), el('td', {}, b.tourist_name), el('td', {}, b.guide_name || '—'),
        el('td', {}, fmtDate(b.tour_date)), el('td', {}, inr(b.total_price_inr)),
        el('td', {}, el('span', { class: `pill ${b.status}` }, b.status))
      ])))
    ]);
    wrap.appendChild(table);
  }, (bookings) => bookings.length === 0).catch(() => {});
}

loadStats();
loadPackages();
loadDocs();
loadUsers();
loadBookings();
