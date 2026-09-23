Auth.requireRole('tourist');
setupTopbar();

const wrap = document.getElementById('packagesWrap');
const searchBox = document.getElementById('searchBox');
const categoryFilter = document.getElementById('categoryFilter');
const stateFilter = document.getElementById('stateFilter');
const sortFilter = document.getElementById('sortFilter');

// Pre-fill search box from ?q= if navigated here with a query
const params = new URLSearchParams(window.location.search);
if (params.get('q')) searchBox.value = params.get('q');

async function loadFilters() {
  try {
    const { categories, states } = await api('/packages/meta/filters');
    categories.forEach((c) => categoryFilter.appendChild(el('option', { value: c }, c)));
    states.forEach((s) => stateFilter.appendChild(el('option', { value: s }, s)));
  } catch { /* filters are non-critical; fail silently */ }
}

function packageCard(p) {
  const card = el('a', { class: 'pkg-card', href: `/package-detail.html?id=${p.id}` }, [
    el('div', { class: 'img-wrap' }, [
      el('img', { src: p.image_url, alt: p.title, loading: 'lazy', onerror: (e) => { e.target.src = `https://picsum.photos/seed/${p.id}/500/400`; } }),
      el('span', { class: 'badge-duration' }, `${p.duration_days} days`),
      el('span', { class: 'badge-category' }, p.category)
    ]),
    el('div', { class: 'body' }, [
      el('h3', {}, p.title),
      el('div', { class: 'dest' }, `${p.destination}, ${p.state}`),
      ratingBlock(p.avg_rating, p.review_count),
      el('div', { class: 'price-row' }, [
        el('div', {}, [el('div', { class: 'price' }, inr(p.price_inr)), el('small', {}, 'per person')]),
        el('button', { class: 'secondary small' }, 'View')
      ])
    ])
  ]);
  return card;
}

async function loadPackages() {
  const qs = new URLSearchParams();
  if (searchBox.value.trim()) qs.set('search', searchBox.value.trim());
  if (categoryFilter.value) qs.set('category', categoryFilter.value);
  if (stateFilter.value) qs.set('state', stateFilter.value);
  if (sortFilter.value) qs.set('sort', sortFilter.value);

  const countEl = document.getElementById('resultsCount');
  await loadInto(
    wrap,
    () => api(`/packages?${qs.toString()}`),
    (pkgs) => {
      countEl.textContent = `${pkgs.length} package${pkgs.length === 1 ? '' : 's'}`;
      pkgs.forEach((p) => wrap.appendChild(packageCard(p)));
    },
    (pkgs) => pkgs.length === 0
  );
  if (!wrap.querySelector('.error-banner')) {
    // handled inside loadInto; nothing extra needed
  }
}

document.getElementById('searchBtn').addEventListener('click', loadPackages);
document.getElementById('clearSearchBtn').addEventListener('click', () => {
  searchBox.value = '';
  loadPackages();
});
searchBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadPackages(); });
categoryFilter.addEventListener('change', loadPackages);
stateFilter.addEventListener('change', loadPackages);
sortFilter.addEventListener('change', loadPackages);
document.getElementById('clearFiltersBtn').addEventListener('click', () => {
  searchBox.value = ''; categoryFilter.value = ''; stateFilter.value = ''; sortFilter.value = '';
  loadPackages();
});

loadFilters();
loadPackages();
