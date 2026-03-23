/* =============================================
   BESION CHEMICAL — PRODUCTS PAGE
   ============================================= */

document.addEventListener('DOMContentLoaded', () => {
  const esc = (value) => typeof window.besionEscapeHtml === 'function'
    ? window.besionEscapeHtml(value)
    : String(value ?? '').replace(/[&<>"']/g, '');
  const escAttr = (value) => typeof window.besionEscapeAttr === 'function'
    ? window.besionEscapeAttr(value)
    : esc(value);
  const safeUrl = (value, fallback = '#') => typeof window.besionSafeUrl === 'function'
    ? window.besionSafeUrl(value, fallback)
    : (String(value ?? '').trim() || fallback);
  const productHref = (id) => `product-details.html?id=${encodeURIComponent(String(id || ''))}`;

  let currentMarket = 'domestic';
  let currentCat = 'insecticides';
  let currentGlobalCat = null;
  let domesticCategories = [];
  let globalCategories = [];

  const DOMESTIC_CATEGORY_DEFAULTS = [
    { value: 'insecticides', label: 'Insecticides' },
    { value: 'herbicides', label: 'Herbicides' },
    { value: 'fungicides', label: 'Fungicides' },
    { value: 'pgr', label: 'Plant Growth Regulator' },
    { value: 'biofertilizers', label: 'Bio Fertilizers' }
  ];

  const GLOBAL_CATEGORY_DEFAULTS = [
    { value: 'insecticides', label: 'Insecticides' },
    { value: 'fungicides', label: 'Fungicides' },
    { value: 'herbicides', label: 'Herbicides' },
    { value: 'pgr', label: 'Plant Growth Regulator (PGR)' }
  ];

  function normalizeCategoryList(list, defaults) {
    const src = Array.isArray(list) ? list : defaults;
    const seen = new Set();
    const normalized = [];
    src.forEach(item => {
      if (!item) return;
      const label = String(item.label || item.value || '').trim();
      const value = String(item.value || '').trim();
      if (!label || !value) return;
      if (seen.has(value)) return;
      seen.add(value);
      normalized.push({ value, label });
    });
    return normalized.length ? normalized : defaults.slice();
  }

  function loadCategories() {
    const storedDomestic = safeJsonParse(storageGet('besion_domestic_categories'), null);
    const storedGlobal = safeJsonParse(storageGet('besion_global_categories'), null);
    domesticCategories = normalizeCategoryList(storedDomestic, DOMESTIC_CATEGORY_DEFAULTS);
    globalCategories = normalizeCategoryList(storedGlobal, GLOBAL_CATEGORY_DEFAULTS);
  }

  function getCategoryLabel(value, market) {
    const list = market === 'global' ? globalCategories : domesticCategories;
    const match = list.find(opt => opt.value === value);
    return match ? match.label : value || 'Uncategorized';
  }

  function getCategoryIconSvg(value) {
    const icons = {
      insecticides: `<svg class="cat-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2a3 3 0 0 1 3 3"/><path d="M9 5a3 3 0 0 1 3-3"/>
        <path d="M12 8c-2.5 0-4 1.5-4 4v1c0 2.5 1.5 4 4 4s4-1.5 4-4v-1c0-2.5-1.5-4-4-4Z"/>
        <path d="M8 10 4 8"/><path d="M8 13 4 13"/><path d="M8 16 5 18"/>
        <path d="M16 10l4-2"/><path d="M16 13h4"/><path d="M16 16l3 2"/>
      </svg>`,
      herbicides: `<svg class="cat-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 22V12"/>
        <path d="M12 12C12 7 17 3 22 3c0 5-4 9-10 9Z"/>
        <path d="M12 12C12 7 7 3 2 3c0 5 4 9 10 9Z"/>
        <path d="M12 12c0-3-2-7-5-9"/>
      </svg>`,
      fungicides: `<svg class="cat-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2C8 2 5 5 5 9c0 2.5 1.5 4.7 3.7 5.8L8 20h8l-.7-5.2C17.5 13.7 19 11.5 19 9c0-4-3-7-7-7Z"/>
        <path d="M9 21h6"/>
        <circle cx="9" cy="9" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="12" cy="12" r="1"/>
      </svg>`,
      pgr: `<svg class="cat-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 22v-7"/>
        <path d="M12 15C12 10 16 6 21 5c0 5-3 9-9 10Z"/>
        <path d="M12 15C12 10 8 6 3 5c0 5 3 9 9 10Z"/>
        <circle cx="12" cy="6" r="3"/>
        <path d="M12 9v6"/>
      </svg>`,
      biofertilizers: `<svg class="cat-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 20h16"/>
        <path d="M6 20V8l6-5 6 5v12"/>
        <rect x="9" y="12" width="6" height="8" rx="1"/>
        <path d="M12 8a2 2 0 0 1 2 2"/>
      </svg>`
    };
    return icons[value] || `<svg class="cat-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>`;
  }

  function getGlobalInquiryLink(productName = '') {
    const rawNum = (typeof ADMIN_SETTINGS !== 'undefined' && ADMIN_SETTINGS.whatsapp)
      ? ADMIN_SETTINGS.whatsapp
      : '919328110822';
    const num = String(rawNum).replace(/[^\d]/g, '') || '919328110822';
    const msg = productName
      ? `Hello, I want to inquire about this ${productName}.`
      : 'Hello, I want to inquire about your products.';
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }

  function renderCategoryIcons(containerId, categories, activeValue) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!categories.length) {
      container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>No categories available.</p></div>';
      return;
    }
    container.innerHTML = categories.map(cat => `
      <div class="cat-item ${cat.value === activeValue ? 'active' : ''}" data-cat="${escAttr(cat.value)}" role="button" tabindex="0">
        <div class="cat-icon-wrap">${getCategoryIconSvg(cat.value)}</div>
        <span class="cat-label">${esc(cat.label)}</span>
      </div>
    `).join('');
  }

  function refreshCategories() {
    loadCategories();
    const domesticDefault = domesticCategories[0]?.value || '';
    if (!domesticCategories.find(c => c.value === currentCat)) {
      currentCat = domesticDefault;
    }
    const globalDefault = globalCategories[0]?.value || null;
    if (currentGlobalCat && !globalCategories.find(c => c.value === currentGlobalCat)) {
      currentGlobalCat = globalDefault;
    }
    renderCategoryIcons('categoryIcons', domesticCategories, currentCat);
    renderCategoryIcons('globalCategoryIcons', globalCategories, currentGlobalCat);
  }

  function renderDomesticProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    const products = Array.isArray(ADMIN_PRODUCTS) ? ADMIN_PRODUCTS : [];
    const filtered = products
      .filter(p => p.market === 'domestic' && p.category === currentCat)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (filtered.length === 0) {
      grid.classList.remove('products-grid-2x2');
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>No products found in this category.</p></div>';
      return;
    }

    grid.classList.remove('products-grid-2x2');

    grid.innerHTML = filtered.map((p) => {
      const href = productHref(p.id);
      const imgSrc = (typeof resolveImageUrl === 'function' ? resolveImageUrl(p.image) : p.image)
        || (window.BESION_FALLBACK_IMAGE || 'images/placeholder.svg');
      const safeImg = safeUrl(imgSrc, window.BESION_FALLBACK_IMAGE || 'images/placeholder.svg');
      const safeName = esc(p.name || 'Product');
      const safeTechnical = esc(p.technical ? p.technical.substring(0, 50) + (p.technical.length > 50 ? '...' : '') : p.category);
      const safeCategory = esc(getCategoryLabel(p.category, 'domestic'));
      return `
        <div class="product-card" role="link" tabindex="0" data-id="${escAttr(p.id || '')}" data-href="${escAttr(href)}" aria-label="View details for ${escAttr(p.name || 'Product')}">
          <div class="product-img-wrap">
            <img src="${escAttr(safeImg)}" alt="${escAttr(p.name || 'Product')}" loading="eager" decoding="async" data-drive-raw="${escAttr(p.image || '')}" data-fallback="${escAttr(window.BESION_FALLBACK_IMAGE || 'images/placeholder.svg')}">
            <div class="product-quick">
              <span>View details</span>
              <span aria-hidden="true">→</span>
            </div>
          </div>
          <div class="product-card-info">
            <h3>${safeName}</h3>
            <p>${safeTechnical}</p>
            <div class="product-meta">
              <span class="product-chip">${safeCategory}</span>
              <span class="product-arrow" aria-hidden="true">→</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderGlobalProducts() {
    const prompt = document.getElementById('globalPrompt');
    const content = document.getElementById('globalContent');
    const techGrid = document.getElementById('globalTechnicalsGrid');
    const formGrid = document.getElementById('globalFormulationsGrid');
    if (!prompt || !content || !techGrid || !formGrid) return;

    if (!currentGlobalCat) {
      prompt.style.display = '';
      content.style.display = 'none';
      return;
    }

    prompt.style.display = 'none';
    content.style.display = '';

    const techs = (Array.isArray(ADMIN_TECHNICALS) ? ADMIN_TECHNICALS : [])
      .filter(t => t.category === currentGlobalCat)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const forms = (Array.isArray(ADMIN_FORMULATIONS) ? ADMIN_FORMULATIONS : [])
      .filter(f => f.category === currentGlobalCat)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    techGrid.innerHTML = techs.length === 0
      ? '<div class="empty-state" style="grid-column:1/-1"><p>No technicals found in this category.</p></div>'
      : techs.map(t => `
        <div class="technical-item" data-id="${escAttr(t.id || '')}">
          <div class="global-item-row">
            <span class="global-item-name">${esc(t.technical_name)}${t.brand_name ? ` — ${esc(t.brand_name)}` : ''}</span>
            <a href="${escAttr(safeUrl(getGlobalInquiryLink(t.technical_name), '#'))}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm">Send Inquiry</a>
          </div>
        </div>
      `).join('');

    formGrid.innerHTML = forms.length === 0
      ? '<div class="empty-state" style="grid-column:1/-1"><p>No formulations found in this category.</p></div>'
      : forms.map(f => `
        <div class="formulation-item" data-id="${escAttr(f.id || '')}">
          <div class="global-item-row">
            <span class="global-item-name">${esc(f.formulation_name)}</span>
            <a href="${escAttr(safeUrl(getGlobalInquiryLink(f.formulation_name), '#'))}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm">Send Inquiry</a>
          </div>
        </div>
      `).join('');
  }

  function bindProductGridNav() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    const goTo = (target) => {
      const href = target?.dataset?.href || '';
      if (href) window.location.href = href;
    };

    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.product-card[data-href]');
      if (!card) return;
      goTo(card);
    });

    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.product-card[data-href]');
      if (!card) return;
      e.preventDefault();
      goTo(card);
    });
  }

  // Market toggle
  const marketToggle = document.getElementById('marketToggle');
  if (marketToggle) {
    marketToggle.addEventListener('click', e => {
      const btn = e.target.closest('.toggle-btn');
      if (!btn) return;
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMarket = btn.dataset.market;
      const domesticCats = document.getElementById('categoryIcons');
      const globalCats = document.getElementById('globalCategoryIcons');
      if (currentMarket === 'domestic') {
        document.getElementById('domesticSection').style.display = '';
        document.getElementById('globalSection').style.display = 'none';
        domesticCats.style.display = '';
        globalCats.style.display = 'none';
        refreshCategories();
        renderDomesticProducts();
        applySelection();
      } else {
        document.getElementById('domesticSection').style.display = 'none';
        document.getElementById('globalSection').style.display = '';
        domesticCats.style.display = 'none';
        globalCats.style.display = '';
        refreshCategories();
        renderGlobalProducts();
        applySelection();
      }
    });
  }

  // Category icons (domestic)
  const categoryIcons = document.getElementById('categoryIcons');
  if (categoryIcons) {
    categoryIcons.addEventListener('click', e => {
      const item = e.target.closest('.cat-item');
      if (!item) return;
      document.querySelectorAll('#categoryIcons .cat-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentCat = item.dataset.cat;
      renderDomesticProducts();
      applySelection();
    });
    categoryIcons.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('.cat-item');
      if (!item) return;
      e.preventDefault();
      item.click();
    });
  }

  // Category icons (global)
  const globalIcons = document.getElementById('globalCategoryIcons');
  if (globalIcons) {
    globalIcons.addEventListener('click', e => {
      const item = e.target.closest('.cat-item');
      if (!item) return;
      document.querySelectorAll('#globalCategoryIcons .cat-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      currentGlobalCat = item.dataset.cat;
      renderGlobalProducts();
      applySelection();
    });
    globalIcons.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest('.cat-item');
      if (!item) return;
      e.preventDefault();
      item.click();
    });
  }

  // URL param for category
  const params = new URLSearchParams(window.location.search);
  const catParam = params.get('cat');
  const marketParam = params.get('market');
  const focusParam = params.get('focus');
  const selectParam = params.get('select');
  const selectTypeParam = params.get('selectType');
  let selectionApplied = false;

  const escapeSelector = (value) => {
    const raw = String(value ?? '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(raw);
    }
    return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  };

  const clearSelections = () => {
    document.querySelectorAll('.product-card.selected, .technical-item.selected, .formulation-item.selected').forEach(el => {
      el.classList.remove('selected');
      el.removeAttribute('aria-selected');
    });
  };

  const markSelected = (el) => {
    if (!el) return false;
    clearSelections();
    el.classList.add('selected');
    el.setAttribute('aria-selected', 'true');
    selectionApplied = true;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return true;
  };

  const applySelection = () => {
    if (selectionApplied || !selectParam) return;
    const safeId = escapeSelector(selectParam);
    let selectedEl = null;

    if (selectTypeParam === 'technical') {
      selectedEl = document.querySelector(`.technical-item[data-id="${safeId}"]`);
    } else if (selectTypeParam === 'formulation') {
      selectedEl = document.querySelector(`.formulation-item[data-id="${safeId}"]`);
    } else if (selectTypeParam === 'product') {
      selectedEl = document.querySelector(`.product-card[data-id="${safeId}"]`);
    } else {
      selectedEl =
        document.querySelector(`.product-card[data-id="${safeId}"]`)
        || document.querySelector(`.technical-item[data-id="${safeId}"]`)
        || document.querySelector(`.formulation-item[data-id="${safeId}"]`);
    }

    if (selectedEl) markSelected(selectedEl);
  };

  refreshCategories();

  if (marketParam === 'global') {
    currentMarket = 'global';
    document.querySelectorAll('#marketToggle .toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.market === 'global');
    });
    document.getElementById('domesticSection').style.display = 'none';
    document.getElementById('globalSection').style.display = '';
    document.getElementById('categoryIcons').style.display = 'none';
    document.getElementById('globalCategoryIcons').style.display = '';

    if (catParam) {
      currentGlobalCat = catParam;
      document.querySelectorAll('#globalCategoryIcons .cat-item').forEach(i => {
        i.classList.toggle('active', i.dataset.cat === catParam);
      });
    }

    renderGlobalProducts();

    if (focusParam === 'technicals' || focusParam === 'formulations') {
      const target = focusParam === 'technicals'
        ? document.querySelector('.technicals-section')
        : document.querySelector('.formulations-section');
      if (target) {
        requestAnimationFrame(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          requestAnimationFrame(() => applySelection());
        });
      }
    } else {
      applySelection();
    }
  }
  if (catParam && catParam !== 'all' && marketParam !== 'global') {
    currentCat = catParam;
    document.querySelectorAll('#categoryIcons .cat-item').forEach(i => {
      i.classList.toggle('active', i.dataset.cat === catParam);
    });
  }

  document.addEventListener('besion-sync:updated', () => {
    refreshCategories();
    renderDomesticProducts();
    renderGlobalProducts();
    applySelection();
  });

  bindProductGridNav();

  // Initial render
  renderDomesticProducts();
  applySelection();
});
