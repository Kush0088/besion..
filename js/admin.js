/* =============================================
   BESION CHEMICAL — ADMIN PANEL LOGIC
   ============================================= */

(function() {
    let editingId = null;
    let deleteId = null;
    let editingTechnicalId = null;
    let editingFormulationId = null;
    let globalDeleteId = null;
    let globalDeleteType = null;

    const FALLBACK_IMAGE = window.BESION_FALLBACK_IMAGE || 'images/placeholder.svg';
    const esc = (value) => typeof window.besionEscapeHtml === 'function'
      ? window.besionEscapeHtml(value)
      : String(value ?? '').replace(/[&<>"']/g, '');
    const escAttr = (value) => typeof window.besionEscapeAttr === 'function'
      ? window.besionEscapeAttr(value)
      : esc(value);
    const safeUrl = (value, fallback = '#') => typeof window.besionSafeUrl === 'function'
      ? window.besionSafeUrl(value, fallback)
      : (String(value ?? '').trim() || fallback);

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

    let DOMESTIC_CATEGORY_OPTIONS = [];
    let GLOBAL_CATEGORY_OPTIONS = [];

    // Polyfills/shims for missing global functions if needed
    if (typeof window.safeJsonParse !== 'function') {
      window.safeJsonParse = function (value, fallback) {
        try {
          return value ? JSON.parse(value) : fallback;
        } catch (err) {
          return fallback;
        }
      };
    }

    if (typeof window.storageGet !== 'function') {
      window.storageGet = function (key) {
        try {
          return localStorage.getItem(key);
        } catch (err) {
          return null;
        }
      };
    }

    if (typeof window.storageSet !== 'function') {
      window.storageSet = function (key, value) {
        try {
          localStorage.setItem(key, value);
          return true;
        } catch (err) {
          return false;
        }
      };
    }

    let ADMIN_CONFIG = typeof window.BESION_SYNC_CONFIG === 'object'
      ? window.BESION_SYNC_CONFIG
      : {};
    let ADMIN_ENABLED = Boolean(ADMIN_CONFIG.adminEnabled);
    let ADMIN_PASSWORD = String(ADMIN_CONFIG.adminPassword || '').trim();

    // Re-check config when it's loaded asynchronously
    document.addEventListener('besion:config-ready', (e) => {
        ADMIN_CONFIG = window.BESION_SYNC_CONFIG;
        ADMIN_ENABLED = Boolean(ADMIN_CONFIG.adminEnabled);
        ADMIN_PASSWORD = String(ADMIN_CONFIG.adminPassword || '').trim();
        // If we were already at the lock screen, refresh the UI if needed
        const lockMsg = document.querySelector('.admin-lock-msg');
        if (lockMsg && lockMsg.textContent.includes('Incorrect password')) {
             // Optional: clear error if it was just a race condition
        }
    });

    const ADMIN_UNLOCK_KEY = 'besion_admin_unlock_v1';
    const ADMIN_ATTEMPTS_KEY = 'besion_admin_attempts_v1';
    const ADMIN_LOCK_UNTIL_KEY = 'besion_admin_lock_until_v1';
    const MAX_ADMIN_ATTEMPTS = 5;
    const ADMIN_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

    // --- Admin Access Logic ---

    function parseAttemptList(value) {
      if (!value) return [];
      try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => Number.isFinite(item));
      } catch (err) {
        return [];
      }
    }

    function getAdminAttempts(now) {
      const list = parseAttemptList(window.storageGet(ADMIN_ATTEMPTS_KEY));
      return list.filter((ts) => now - ts < ADMIN_ATTEMPT_WINDOW_MS);
    }

    function setAdminAttempts(list) {
      window.storageSet(ADMIN_ATTEMPTS_KEY, JSON.stringify(list));
    }

    function getAdminLockUntil() {
      const rawValue = window.storageGet(ADMIN_LOCK_UNTIL_KEY);
      const lockUntil = Number(rawValue);
      return Number.isFinite(lockUntil) ? lockUntil : 0;
    }

    function setAdminLockUntil(timestamp) {
      try {
        if (timestamp && timestamp > 0) {
          localStorage.setItem(ADMIN_LOCK_UNTIL_KEY, String(timestamp));
        } else {
          localStorage.removeItem(ADMIN_LOCK_UNTIL_KEY);
        }
      } catch (err) { }
    }

    function formatLockDuration(ms) {
      const minutes = Math.ceil(ms / 60000);
      if (minutes <= 1) return '1 minute';
      if (minutes < 60) return `${minutes} minutes`;
      const hours = Math.ceil(minutes / 60);
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    function showAdminLockError(message) {
      const el = document.getElementById('adminLockError');
      if (!el) return;
      el.textContent = message;
      el.classList.add('show');
    }

    function hideAdminLockError() {
      const el = document.getElementById('adminLockError');
      if (!el) return;
      el.classList.remove('show');
    }

    function setAdminUnlocked(isUnlocked) {
      const shouldUnlock = ADMIN_ENABLED && isUnlocked;
      document.body.classList.toggle('admin-unlocked', shouldUnlock);
      const overlay = document.getElementById('adminLock');
      if (overlay) {
        overlay.setAttribute('aria-hidden', shouldUnlock ? 'true' : 'false');
      }
      try {
        if (ADMIN_ENABLED && shouldUnlock) {
          localStorage.setItem(ADMIN_UNLOCK_KEY, 'true');
        } else {
          localStorage.removeItem(ADMIN_UNLOCK_KEY);
        }
      } catch (err) { }
      const input = document.getElementById('adminPassword');
      if (!shouldUnlock && input) {
        input.value = '';
        input.focus();
      }
      if (shouldUnlock) refreshCategories();
    }

    function isAdminUnlocked() {
      try {
        return localStorage.getItem(ADMIN_UNLOCK_KEY) === 'true' && !!sessionStorage.getItem('admin_session');
      } catch (err) {
        return false;
      }
    }

    function lockAdmin() {
        sessionStorage.removeItem('admin_session');
        setAdminUnlocked(false);
        window.location.reload();
    }

    // --- Category Logic ---

    function slugifyCategory(label) {
      return String(label || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
    }

    function normalizeCategoryList(list, defaults) {
      const src = Array.isArray(list) ? list : defaults;
      const seen = new Set();
      const normalized = [];
      src.forEach(item => {
        if (!item) return;
        const label = String(item.label || item.value || '').trim();
        const value = String(item.value || slugifyCategory(label)).trim();
        if (!label || !value) return;
        if (seen.has(value)) return;
        seen.add(value);
        normalized.push({ value, label });
      });
      return normalized.length ? normalized : defaults.slice();
    }

    function loadCategories() {
      const storedDomestic = window.safeJsonParse(window.storageGet('besion_domestic_categories'), null);
      const storedGlobal = window.safeJsonParse(window.storageGet('besion_global_categories'), null);
      DOMESTIC_CATEGORY_OPTIONS = normalizeCategoryList(storedDomestic, DOMESTIC_CATEGORY_DEFAULTS);
      GLOBAL_CATEGORY_OPTIONS = normalizeCategoryList(storedGlobal, GLOBAL_CATEGORY_DEFAULTS);
    }

    function saveCategories(type) {
      if (type === 'domestic') {
        window.storageSet('besion_domestic_categories', JSON.stringify(DOMESTIC_CATEGORY_OPTIONS));
      } else {
        window.storageSet('besion_global_categories', JSON.stringify(GLOBAL_CATEGORY_OPTIONS));
      }
    }

    function getCategoryOptionsForMarket(market) {
      return (market === 'global') ? GLOBAL_CATEGORY_OPTIONS : DOMESTIC_CATEGORY_OPTIONS;
    }

    function getUniqueCategoryOptions() {
      const allOptions = [...DOMESTIC_CATEGORY_OPTIONS, ...GLOBAL_CATEGORY_OPTIONS];
      const unique = [];
      const seen = new Set();
      allOptions.forEach(opt => {
        if (!seen.has(opt.value)) {
          seen.add(opt.value);
          unique.push(opt);
        }
      });
      return unique;
    }

    function updateFilterCategoryOptions(marketValue) {
      const filterEl = document.getElementById('filterCategory');
      if (!filterEl) return;
      const market = marketValue || document.getElementById('filterMarket')?.value || 'all';
      const options = market === 'domestic'
        ? DOMESTIC_CATEGORY_OPTIONS
        : (market === 'global' ? GLOBAL_CATEGORY_OPTIONS : getUniqueCategoryOptions());
      const current = filterEl.value;
      filterEl.innerHTML = `<option value="">All Categories</option>` + options
        .map(opt => `<option value="${escAttr(opt.value)}">${esc(opt.label)}</option>`)
        .join('');
      if (current && options.some(opt => opt.value === current)) {
        filterEl.value = current;
      } else {
        filterEl.value = '';
      }
    }

    function updateProductCategoryOptions(keepValue = true) {
      const selectEl = document.getElementById('fCategory');
      if (!selectEl) return;
      const market = document.getElementById('fMarket')?.value || 'domestic';
      const options = getCategoryOptionsForMarket(market);
      const current = keepValue ? selectEl.value : '';
      selectEl.innerHTML = `<option value="">Select Category</option>` + options
        .map(opt => `<option value="${escAttr(opt.value)}">${esc(opt.label)}</option>`)
        .join('');
      if (current && options.some(opt => opt.value === current)) {
        selectEl.value = current;
      } else {
        selectEl.value = '';
      }
    }

    function renderCategoryOptions() {
      const globalTechnicalEl = document.getElementById('tCategory');
      const globalFormulationEl = document.getElementById('fCategoryGlobal');

      const setOptions = (el, options, placeholder) => {
        if (!el) return;
        const current = el.value;
        el.innerHTML = `<option value="">${placeholder}</option>` + options
          .map(opt => `<option value="${escAttr(opt.value)}">${esc(opt.label)}</option>`)
          .join('');
        if (current) el.value = current;
      };

      updateFilterCategoryOptions();
      setOptions(globalTechnicalEl, GLOBAL_CATEGORY_OPTIONS, 'Select Category');
      setOptions(globalFormulationEl, GLOBAL_CATEGORY_OPTIONS, 'Select Category');
      updateProductCategoryOptions(true);
    }

    function renderCategoryManagerLists() {
      const domesticList = document.getElementById('domesticCategoryList');
      const globalList = document.getElementById('globalCategoryList');
      if (!domesticList || !globalList) return;

      const renderList = (list, type) => list.map(item => `
        <div class="category-item">
          <div class="category-label">${esc(item.label)}</div>
          <div class="category-actions">
            <button class="btn btn-edit btn-sm js-edit-cat" data-type="${escAttr(type)}" data-value="${escAttr(item.value)}">Edit</button>
            <button class="btn btn-danger btn-sm js-delete-cat" data-type="${escAttr(type)}" data-value="${escAttr(item.value)}">Delete</button>
          </div>
        </div>
      `).join('') || `<div style="color:var(--text-muted);font-size:13px">No categories yet.</div>`;

      domesticList.innerHTML = renderList(DOMESTIC_CATEGORY_OPTIONS, 'domestic');
      globalList.innerHTML = renderList(GLOBAL_CATEGORY_OPTIONS, 'global');
    }

    function renderCategoryLinks() {
      const domesticEl = document.getElementById('domesticCategoryLinks');
      const globalEl = document.getElementById('globalCategoryLinks');
      if (!domesticEl || !globalEl) return;

      const domesticValues = new Set(DOMESTIC_CATEGORY_OPTIONS.map(opt => opt.value));
      const globalValues = new Set(GLOBAL_CATEGORY_OPTIONS.map(opt => opt.value));

      const linkHtml = (href, label) => `
        <a class="category-link" href="${safeUrl(href, '#')}" target="_blank" rel="noopener noreferrer">
          ${esc(label)}
        </a>
      `;

      domesticEl.innerHTML = DOMESTIC_CATEGORY_OPTIONS.length
        ? DOMESTIC_CATEGORY_OPTIONS.map(opt => {
          const label = globalValues.has(opt.value) ? `Domestic - ${opt.label}` : opt.label;
          return linkHtml(`products.html?cat=${encodeURIComponent(opt.value)}`, label);
        }).join('')
        : `<span style="color:var(--text-muted);font-size:13px">No categories yet.</span>`;

      globalEl.innerHTML = GLOBAL_CATEGORY_OPTIONS.length
        ? GLOBAL_CATEGORY_OPTIONS.map(opt => {
          const label = domesticValues.has(opt.value) ? `Global - ${opt.label}` : opt.label;
          return linkHtml(`products.html?market=global&cat=${encodeURIComponent(opt.value)}`, label);
        }).join('')
        : `<span style="color:var(--text-muted);font-size:13px">No categories yet.</span>`;
    }

    function refreshCategories(options = { renderTables: true }) {
      loadCategories();
      renderCategoryOptions();
      renderCategoryManagerLists();
      renderCategoryLinks();
      if (options.renderTables) {
        renderProductsTable();
        renderTechnicalsTable();
        renderFormulationsTable();
      }
    }

    function openCategoryModal() {
      refreshCategories({ renderTables: false });
      document.getElementById('categoryModal')?.classList.add('open');
    }

    function closeCategoryModal() {
      document.getElementById('categoryModal')?.classList.remove('open');
    }

    function addCategory(type) {
      const input = document.getElementById(type === 'domestic' ? 'newDomesticCategory' : 'newGlobalCategory');
      const label = (input?.value || '').trim();
      if (!label) { window.showToast('Please enter a category name.', 'error'); return; }
      const value = slugifyCategory(label);
      const list = type === 'domestic' ? DOMESTIC_CATEGORY_OPTIONS : GLOBAL_CATEGORY_OPTIONS;
      if (list.some(item => item.value === value || item.label.toLowerCase() === label.toLowerCase())) {
        window.showToast('Category already exists.', 'error');
        return;
      }
      list.push({ value, label });
      saveCategories(type);
      if (input) input.value = '';
      refreshCategories();
      window.showToast('Category added.', 'success');
    }

    function editCategory(type, value) {
      const list = type === 'domestic' ? DOMESTIC_CATEGORY_OPTIONS : GLOBAL_CATEGORY_OPTIONS;
      const item = list.find(c => c.value === value);
      if (!item) return;
      const next = prompt('Update category name:', item.label);
      if (next === null) return;
      const label = String(next).trim();
      if (!label) { window.showToast('Category name cannot be empty.', 'error'); return; }
      item.label = label;
      saveCategories(type);
      refreshCategories();
      window.showToast('Category updated.', 'success');
    }

    function deleteCategory(type, value) {
      const list = type === 'domestic' ? DOMESTIC_CATEGORY_OPTIONS : GLOBAL_CATEGORY_OPTIONS;
      const item = list.find(c => c.value === value);
      if (!item) return;

      let usageCount = 0;
      const products = Array.isArray(window.ADMIN_PRODUCTS) ? window.ADMIN_PRODUCTS : [];
      const technicals = Array.isArray(window.ADMIN_TECHNICALS) ? window.ADMIN_TECHNICALS : [];
      const formulations = Array.isArray(window.ADMIN_FORMULATIONS) ? window.ADMIN_FORMULATIONS : [];

      if (type === 'domestic') {
        usageCount = products.filter(p => (p.market || 'domestic') === 'domestic' && p.category === value).length;
      } else {
        usageCount = technicals.filter(t => t.category === value).length
          + formulations.filter(f => f.category === value).length;
      }

      if (usageCount > 0) {
        const ok = confirm(`This category is used by ${usageCount} item(s). Delete anyway?`);
        if (!ok) return;
      }

      const idx = list.findIndex(c => c.value === value);
      if (idx !== -1) list.splice(idx, 1);
      saveCategories(type);
      remapCategoryUsage(type, value);
      refreshCategories();
      window.showToast('Category deleted.', 'success');
    }

    function remapCategoryUsage(type, oldValue) {
      const products = Array.isArray(window.ADMIN_PRODUCTS) ? window.ADMIN_PRODUCTS : [];
      const technicals = Array.isArray(window.ADMIN_TECHNICALS) ? window.ADMIN_TECHNICALS : [];
      const formulations = Array.isArray(window.ADMIN_FORMULATIONS) ? window.ADMIN_FORMULATIONS : [];
      const pickFallback = (list) => (list.length ? list[0].value : '');
      
      if (type === 'domestic') {
        const fallback = pickFallback(DOMESTIC_CATEGORY_OPTIONS);
        let touched = false;
        products.forEach(p => {
          if ((p.market || 'domestic') === 'domestic' && p.category === oldValue) {
            p.category = fallback;
            touched = true;
          }
        });
        if (touched) window.storageSet('besion_products', JSON.stringify(products));
      } else {
        const fallback = pickFallback(GLOBAL_CATEGORY_OPTIONS);
        let touched = false;
        technicals.forEach(t => {
          if (t.category === oldValue) {
            t.category = fallback;
            touched = true;
          }
        });
        formulations.forEach(f => {
          if (f.category === oldValue) {
            f.category = fallback;
            touched = true;
          }
        });
        if (touched) {
          window.storageSet('besion_technicals', JSON.stringify(technicals));
          window.storageSet('besion_formulations', JSON.stringify(formulations));
        }
      }
    }

    // --- Product/Table Rendering Logic ---

    function getAnyCategoryLabel(value) {
      const d = DOMESTIC_CATEGORY_OPTIONS.find(opt => opt.value === value);
      if (d) return d.label;
      const g = GLOBAL_CATEGORY_OPTIONS.find(opt => opt.value === value);
      if (g) return g.label;
      return 'Uncategorized';
    }

    function getProductImage(product) {
      if (!product || !product.image) return FALLBACK_IMAGE;
      const img = String(product.image).trim();
      const resolved = typeof window.resolveImageUrl === 'function' ? window.resolveImageUrl(img) : img;
      return resolved || FALLBACK_IMAGE;
    }

    function renderProductsTable() {
      const table = document.getElementById('productsTable');
      if (!table) return;
      try {
        const catF = document.getElementById('filterCategory')?.value || '';
        const marketF = document.getElementById('filterMarket')?.value || 'all';
        const srch = (document.getElementById('productSearch')?.value || '').toLowerCase();

        const products = Array.isArray(window.ADMIN_PRODUCTS) ? window.ADMIN_PRODUCTS : [];
        const technicals = Array.isArray(window.ADMIN_TECHNICALS) ? window.ADMIN_TECHNICALS : [];
        const formulations = Array.isArray(window.ADMIN_FORMULATIONS) ? window.ADMIN_FORMULATIONS : [];

        const filtered = products.filter(p => {
          const name = (p.name || '').toLowerCase();
          const technical = (p.technical || '').toLowerCase();
          const matchSearch = !srch || name.includes(srch) || technical.includes(srch);
          const matchCat = !catF || p.category === catF;
          const market = (p.market || 'domestic');
          const matchMarket = marketF === 'all' || market === marketF;
          return matchSearch && matchCat && matchMarket;
        });

        const data = filtered
          .filter(p => (p.market || 'domestic') === 'domestic')
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const showDomestic = marketF !== 'global';
        const showGlobal = marketF !== 'domestic';
        
        const domesticCount = showDomestic ? products.filter(p => (p.market || 'domestic') === 'domestic').length : 0;
        const globalCount = showGlobal ? (technicals.length + formulations.length) : 0;
        
        const summaryEl = document.getElementById('productsSummaryRow');
        if (summaryEl) {
          summaryEl.innerHTML = `
            <div class="summary-stats">
              <span class="summary-pill">Total Products: ${domesticCount + globalCount}</span>
              <span class="summary-pill">Domestic Products: ${domesticCount}</span>
              <span class="summary-pill">Global Products: ${globalCount}</span>
            </div>`;
        }

        const domesticSection = document.getElementById('domesticProductsSection');
        if (domesticSection) domesticSection.style.display = showDomestic ? '' : 'none';
        const globalSection = document.getElementById('globalProductsSection');
        if (globalSection) globalSection.style.display = showGlobal ? '' : 'none';

        table.innerHTML = `
          <thead><tr><th>Sr No.</th><th>Image</th><th>Product Name</th><th>Technical</th><th>Category</th><th>Market</th><th>Actions</th></tr></thead>
          <tbody>${data.length === 0 ? '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No data available.</td></tr>' : data.map((p, idx) => `
            <tr>
              <td data-label="Sr No.">
                <input class="inline-order-input js-product-order" type="number" min="1" value="${escAttr(p.order || idx + 1)}" data-id="${escAttr(p.id)}" />
              </td>
              <td data-label="Image"><img class="product-table-img js-table-img" src="${escAttr(safeUrl(getProductImage(p), FALLBACK_IMAGE))}" alt="${escAttr(p.name || 'Product')}"></td>
              <td data-label="Product Name"><strong>${esc(p.name || 'Untitled Product')}</strong></td>
              <td data-label="Technical" style="font-size:12px;color:var(--text-muted);max-width:180px">${esc((p.technical || '—').substring(0, 40))}</td>
              <td data-label="Category"><span class="badge badge-active">${esc(getAnyCategoryLabel(p.category || 'uncategorized'))}</span></td>
              <td data-label="Market"><span class="badge" style="background:#e3f2fd;color:#1565c0">${esc(p.market || 'domestic')}</span></td>
              <td data-label="Actions">
                <div style="display:flex;gap:6px">
                  <button class="btn btn-edit btn-sm js-edit-product" data-id="${escAttr(p.id)}">Edit</button>
                  <button class="btn btn-danger btn-sm js-delete-product" data-id="${escAttr(p.id)}">Delete</button>
                  <a href="product-details.html?id=${encodeURIComponent(String(p.id))}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-green btn-sm">View</a>
                </div>
              </td>
            </tr>
          `).join('')}</tbody>`;
      } catch (err) {
        console.error('renderProductsTable failed', err);
      }
    }

    function normalizeDomesticProductOrders(products) {
      const domestic = products.filter(p => (p.market || 'domestic') === 'domestic');
      domestic.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      domestic.forEach((p, idx) => { p.order = idx + 1; });
    }

    function renderTechnicalsTable() {
      const table = document.getElementById('technicalsTable');
      if (!table) return;
      try {
        const catF = document.getElementById('filterCategory')?.value || '';
        const srch = (document.getElementById('productSearch')?.value || '').toLowerCase();
        const categoryOptions = catF
          ? GLOBAL_CATEGORY_OPTIONS.filter(opt => opt.value === catF)
          : GLOBAL_CATEGORY_OPTIONS;

        const rows = [];
        const technicals = Array.isArray(window.ADMIN_TECHNICALS) ? window.ADMIN_TECHNICALS : [];
        
        categoryOptions.forEach(opt => {
          const items = technicals
            .filter(t => {
              const name = (t.technical_name || '').toLowerCase();
              const brand = (t.brand_name || '').toLowerCase();
              return t.category === opt.value && (!srch || name.includes(srch) || brand.includes(srch));
            })
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

          items.forEach((t, idx) => {
            rows.push(`
              <tr>
                <td data-label="Sr No.">
                  <input class="inline-order-input js-tech-order" type="number" min="1" value="${escAttr(t.order || idx + 1)}" data-id="${escAttr(t.id)}" />
                </td>
                <td data-label="Category"><span class="badge badge-active">${esc(GLOBAL_CATEGORY_OPTIONS.find(o => o.value === t.category)?.label || t.category)}</span></td>
                <td data-label="Technical Name"><strong>${esc(t.technical_name)}</strong></td>
                <td data-label="Brand Name">${esc(t.brand_name || '—')}</td>
                <td data-label="Actions">
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-edit btn-sm js-edit-tech" data-id="${escAttr(t.id)}">Edit</button>
                    <button class="btn btn-danger btn-sm js-delete-tech" data-id="${escAttr(t.id)}">Delete</button>
                  </div>
                </td>
              </tr>
            `);
          });
        });

        table.innerHTML = `
          <thead><tr><th>Sr No.</th><th>Category</th><th>Technical Name</th><th>Brand Name</th><th>Actions</th></tr></thead>
          <tbody>${rows.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)">No technicals added yet.</td></tr>' : rows.join('')}</tbody>`;
      } catch (err) { console.error(err); }
    }

    function renderFormulationsTable() {
      const table = document.getElementById('formulationsTable');
      if (!table) return;
      try {
        const catF = document.getElementById('filterCategory')?.value || '';
        const srch = (document.getElementById('productSearch')?.value || '').toLowerCase();
        const categoryOptions = catF
          ? GLOBAL_CATEGORY_OPTIONS.filter(opt => opt.value === catF)
          : GLOBAL_CATEGORY_OPTIONS;

        const rows = [];
        const formulations = Array.isArray(window.ADMIN_FORMULATIONS) ? window.ADMIN_FORMULATIONS : [];

        categoryOptions.forEach(opt => {
          const items = formulations
            .filter(f => {
              const name = (f.formulation_name || '').toLowerCase();
              return f.category === opt.value && (!srch || name.includes(srch));
            })
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

          items.forEach((f, idx) => {
            rows.push(`
              <tr>
                <td data-label="Sr No.">
                  <input class="inline-order-input js-form-order" type="number" min="1" value="${escAttr(f.order || idx + 1)}" data-id="${escAttr(f.id)}" />
                </td>
                <td data-label="Category"><span class="badge badge-active">${esc(GLOBAL_CATEGORY_OPTIONS.find(o => o.value === f.category)?.label || f.category)}</span></td>
                <td data-label="Formulation Name"><strong>${esc(f.formulation_name)}</strong></td>
                <td data-label="Actions">
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-edit btn-sm js-edit-formulation" data-id="${escAttr(f.id)}">Edit</button>
                    <button class="btn btn-danger btn-sm js-delete-formulation" data-id="${escAttr(f.id)}">Delete</button>
                  </div>
                </td>
              </tr>
            `);
          });
        });

        table.innerHTML = `
          <thead><tr><th>Sr No.</th><th>Category</th><th>Formulation Name</th><th>Actions</th></tr></thead>
          <tbody>${rows.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted)">No formulations added yet.</td></tr>' : rows.join('')}</tbody>`;
      } catch (err) { console.error(err); }
    }

    // --- Modal Logic ---

    function openAddModal() {
      editingId = null;
      document.getElementById('modalTitle').textContent = 'Add New Product';
      document.getElementById('saveLabel').textContent = 'Add Product';
      ['fName', 'fTechnical', 'fImage', 'fPdf', 'fDesc', 'fMOA', 'fCrops', 'fPests', 'fDose', 'fPackaging'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.value = '';
      });
      const marketEl = document.getElementById('fMarket');
      if (marketEl) { marketEl.value = 'domestic'; marketEl.disabled = true; }
      const statusEl = document.getElementById('fStatus');
      if (statusEl) statusEl.value = 'active';
      updateProductCategoryOptions(false);
      updateImagePreview();
      document.getElementById('productModal')?.classList.add('open');
    }

    function openEditModal(id) {
      editingId = id;
      const products = Array.isArray(window.ADMIN_PRODUCTS) ? window.ADMIN_PRODUCTS : [];
      const p = products.find(x => x.id === id);
      if (!p) return;
      document.title = 'Edit Product — Besion Chemical';
      const mTitle = document.getElementById('modalTitle');
      const sLabel = document.getElementById('saveLabel');
      if (mTitle) mTitle.textContent = 'Edit Product';
      if (sLabel) sLabel.textContent = 'Save Changes';
      
      document.getElementById('fName').value = p.name || '';
      document.getElementById('fTechnical').value = p.technical || '';
      const marketEl = document.getElementById('fMarket');
      if (marketEl) { marketEl.disabled = false; marketEl.value = p.market || 'domestic'; }
      document.getElementById('fImage').value = p.image || '';
      document.getElementById('fPdf').value = p.pdfLink || '';
      document.getElementById('fStatus').value = p.status || 'active';
      document.getElementById('fDesc').value = p.description || '';
      document.getElementById('fMOA').value = p.modeOfAction || '';
      document.getElementById('fCrops').value = p.majorCrops || '';
      document.getElementById('fPests').value = p.targetPests || '';
      document.getElementById('fDose').value = p.dose || '';
      document.getElementById('fPackaging').value = p.packaging || '';
      
      updateProductCategoryOptions(true);
      const catEl = document.getElementById('fCategory');
      if (catEl) catEl.value = p.category || '';
      updateImagePreview();
      document.getElementById('productModal')?.classList.add('open');
    }

    function closeModal() {
      const marketEl = document.getElementById('fMarket');
      if (marketEl) marketEl.disabled = false;
      document.getElementById('productModal')?.classList.remove('open');
      const preview = document.getElementById('imagePreview');
      const previewImg = document.getElementById('imagePreviewImg');
      const previewStatus = document.getElementById('imagePreviewStatus');
      if (preview) preview.style.display = 'none';
      if (previewImg) previewImg.removeAttribute('src');
      if (previewStatus) previewStatus.textContent = '';
    }

    async function saveProduct() {
        const nameEl = document.getElementById('fName');
        const marketEl = document.getElementById('fMarket');
        const catEl = document.getElementById('fCategory');
        const imageEl = document.getElementById('fImage');
        const pdfEl = document.getElementById('fPdf');
        const statusEl = document.getElementById('fStatus');
        const descEl = document.getElementById('fDesc');
        const moaEl = document.getElementById('fMOA');
        const cropsEl = document.getElementById('fCrops');
        const pestsEl = document.getElementById('fPests');
        const doseEl = document.getElementById('fDose');
        const packEl = document.getElementById('fPackaging');
        const techEl = document.getElementById('fTechnical');

        const name = nameEl?.value?.trim() || '';
        const market = !editingId ? 'domestic' : (marketEl?.value || 'domestic');
        const cat = catEl?.value || '';

        if (!name) { window.showToast('Product name is required.', 'error'); return; }
        if (!cat) { window.showToast('Please select a category.', 'error'); return; }

        const rawImage = imageEl?.value?.trim() || '';
        if (rawImage && typeof window.pickValidImageUrl === 'function') {
            const picked = await window.pickValidImageUrl(rawImage);
            if (picked && imageEl) imageEl.value = picked;
        }

        const product = {
            id: editingId || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now(),
            name,
            technical: techEl?.value || '',
            category: cat,
            market,
            image: imageEl?.value?.trim() || FALLBACK_IMAGE,
            pdfLink: pdfEl?.value?.trim() || '',
            status: statusEl?.value || 'active',
            description: descEl?.value || '',
            modeOfAction: moaEl?.value || '',
            majorCrops: cropsEl?.value || '',
            targetPests: pestsEl?.value || '',
            dose: doseEl?.value || '',
            packaging: packEl?.value || ''
        };

        const products = Array.isArray(window.ADMIN_PRODUCTS) ? window.ADMIN_PRODUCTS : [];
        if (editingId) {
            const idx = products.findIndex(p => p.id === editingId);
            if (idx !== -1) {
              const prev = products[idx];
              product.order = prev?.order ?? (idx + 1);
              products[idx] = product;
            }
        } else {
            product.order = products.length + 1;
            products.unshift(product);
        }

        normalizeDomesticProductOrders(products);
        window.storageSet('besion_products', JSON.stringify(products));
        closeModal();
        renderProductsTable();
        window.showToast(editingId ? 'Product updated.' : 'Product added.', 'success');
    }

    function updateImagePreview() {
        const preview = document.getElementById('imagePreview');
        const previewImg = document.getElementById('imagePreviewImg');
        const previewStatus = document.getElementById('imagePreviewStatus');
        if (!preview || !previewImg || !previewStatus) return;

        const raw = document.getElementById('fImage')?.value?.trim() || '';
        if (!raw) {
            preview.style.display = 'none';
            previewImg.removeAttribute('src');
            previewStatus.textContent = '';
            return;
        }

        preview.style.display = '';
        previewStatus.textContent = 'Previewing image...';
        
        previewImg.onload = () => { previewStatus.textContent = 'Preview loaded.'; };
        previewImg.onerror = () => { previewStatus.textContent = 'Preview failed.'; };
        previewImg.src = typeof window.resolveImageUrl === 'function' ? window.resolveImageUrl(raw) : raw;
    }

    function openDeleteModal(id) {
        deleteId = id;
        const products = Array.isArray(window.ADMIN_PRODUCTS) ? window.ADMIN_PRODUCTS : [];
        const p = products.find(x => x.id === id);
        const msgEl = document.getElementById('deleteMsg');
        if (msgEl) msgEl.textContent = `Delete "${p?.name || 'this product'}"? This action cannot be undone.`;
        document.getElementById('deleteModal')?.classList.add('open');
    }

    function confirmDelete() {
        if (!deleteId) return;
        const products = Array.isArray(window.ADMIN_PRODUCTS) ? window.ADMIN_PRODUCTS : [];
        const idx = products.findIndex(p => p.id === deleteId);
        if (idx !== -1) products.splice(idx, 1);
        window.storageSet('besion_products', JSON.stringify(products));
        document.getElementById('deleteModal')?.classList.remove('open');
        renderProductsTable();
        deleteId = null;
        window.showToast('Product deleted.', 'success');
    }

    // --- Technical/Formulation Modal Logic ---

    function openTechnicalModal(id) {
        editingTechnicalId = id || null;
        const elTitle = document.getElementById('technicalModalTitle');
        const elBtn = document.getElementById('saveTechnicalLabel');
        if (elTitle) elTitle.textContent = id ? 'Edit Technical' : 'Add Technical';
        if (elBtn) elBtn.textContent = id ? 'Save Changes' : 'Add Technical';

        const technicals = Array.isArray(window.ADMIN_TECHNICALS) ? window.ADMIN_TECHNICALS : [];
        const t = id ? technicals.find(x => x.id === id) : null;
        
        document.getElementById('tCategory').value = t?.category || '';
        document.getElementById('tName').value = t?.technical_name || '';
        document.getElementById('tBrand').value = t?.brand_name || '';

        document.getElementById('technicalModal')?.classList.add('open');
    }

    function closeTechnicalModal() { document.getElementById('technicalModal')?.classList.remove('open'); }

    function saveTechnical() {
        const cat = document.getElementById('tCategory').value;
        const name = document.getElementById('tName').value.trim();
        const brand = document.getElementById('tBrand').value.trim();

        if (!cat || !name || !brand) { window.showToast('Please fill all required fields.', 'error'); return; }

        const technicals = Array.isArray(window.ADMIN_TECHNICALS) ? window.ADMIN_TECHNICALS : [];
        if (editingTechnicalId) {
            const idx = technicals.findIndex(t => t.id === editingTechnicalId);
            if (idx !== -1) technicals[idx] = { ...technicals[idx], category: cat, technical_name: name, brand_name: brand };
        } else {
            technicals.push({
                id: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
                category: cat,
                technical_name: name,
                brand_name: brand,
                order: technicals.length + 1
            });
        }
        window.storageSet('besion_technicals', JSON.stringify(technicals));
        closeTechnicalModal();
        renderTechnicalsTable();
        window.showToast('Technical saved.', 'success');
    }

    function openFormulationModal(id) {
        editingFormulationId = id || null;
        const elTitle = document.getElementById('formulationModalTitle');
        const elBtn = document.getElementById('saveFormulationLabel');
        if (elTitle) elTitle.textContent = id ? 'Edit Formulation' : 'Add Formulation';
        if (elBtn) elBtn.textContent = id ? 'Save Changes' : 'Add Formulation';

        const formulations = Array.isArray(window.ADMIN_FORMULATIONS) ? window.ADMIN_FORMULATIONS : [];
        const f = id ? formulations.find(x => x.id === id) : null;
        
        document.getElementById('fCategoryGlobal').value = f?.category || '';
        document.getElementById('fNameGlobal').value = f?.formulation_name || '';

        document.getElementById('formulationModal')?.classList.add('open');
    }

    function closeFormulationModal() { document.getElementById('formulationModal')?.classList.remove('open'); }

    function saveFormulation() {
        const cat = document.getElementById('fCategoryGlobal').value;
        const name = document.getElementById('fNameGlobal').value.trim();

        if (!cat || !name) { window.showToast('Please fill all required fields.', 'error'); return; }

        const formulations = Array.isArray(window.ADMIN_FORMULATIONS) ? window.ADMIN_FORMULATIONS : [];
        if (editingFormulationId) {
            const idx = formulations.findIndex(f => f.id === editingFormulationId);
            if (idx !== -1) formulations[idx] = { ...formulations[idx], category: cat, formulation_name: name };
        } else {
            formulations.push({
                id: name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
                category: cat,
                formulation_name: name,
                order: formulations.length + 1
            });
        }
        window.storageSet('besion_formulations', JSON.stringify(formulations));
        closeFormulationModal();
        renderFormulationsTable();
        window.showToast('Formulation saved.', 'success');
    }

    // --- Global Delete Modal Logic ---

    function openGlobalDeleteModal(type, id) {
        globalDeleteType = type;
        globalDeleteId = id;
        document.getElementById('globalDeleteTitle').textContent = `Delete ${type === 'technical' ? 'Technical' : 'Formulation'}?`;
        document.getElementById('globalDeleteModal')?.classList.add('open');
    }

    function closeGlobalDeleteModal() { document.getElementById('globalDeleteModal')?.classList.remove('open'); }

    function confirmGlobalDelete() {
        if (!globalDeleteId || !globalDeleteType) return;
        const key = globalDeleteType === 'technical' ? 'besion_technicals' : 'besion_formulations';
        const list = Array.isArray(window['ADMIN_' + globalDeleteType.toUpperCase() + 'S']) ? window['ADMIN_' + globalDeleteType.toUpperCase() + 'S'] : [];
        const idx = list.findIndex(x => x.id === globalDeleteId);
        if (idx !== -1) list.splice(idx, 1);
        window.storageSet(key, JSON.stringify(list));
        closeGlobalDeleteModal();
        globalDeleteType === 'technical' ? renderTechnicalsTable() : renderFormulationsTable();
        window.showToast('Deleted successfully.', 'success');
    }

    // --- Settings Logic ---

    function loadSettings() {
        const s = window.safeJsonParse(window.storageGet('besion_admin_settings'), {});
        if (s.whatsapp) document.getElementById('stWhatsapp').value = s.whatsapp;
        if (s.email) document.getElementById('stEmail').value = s.email;
        if (s.phone) document.getElementById('stPhone').value = s.phone;
        if (s.address) document.getElementById('stAddress').value = s.address;
    }

    async function saveSettings() {
        const s = {
            whatsapp: document.getElementById('stWhatsapp')?.value || '',
            email: document.getElementById('stEmail')?.value || '',
            phone: document.getElementById('stPhone')?.value || '',
            address: document.getElementById('stAddress')?.value || ''
        };
        window.storageSet('besion_admin_settings', JSON.stringify(s));
        window.showToast('Settings saved.', 'success');
    }

    function showSection(sectionId) {
        const target = sectionId || 'products';
        ['products', 'settings'].forEach(s => {
            const el = document.getElementById('section-' + s);
            if (el) el.style.display = s === target ? '' : 'none';
        });
        document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
        const active = document.querySelector(`.admin-nav-item[data-section="${target}"]`);
        if (active) active.classList.add('active');
        if (window.innerWidth <= 768) {
            document.getElementById('adminSidebar')?.classList.remove('open');
            document.getElementById('adminSidebarOverlay')?.classList.remove('open');
        }
        if (target === 'products') renderProductsTable();
    }

    // --- Main Initialization & Event Listeners ---

    document.addEventListener('DOMContentLoaded', () => {
        if (!ADMIN_ENABLED) {
            showAdminLockError('Admin access is disabled for this deployment.');
            return;
        }

        loadSettings();
        refreshCategories({ renderTables: false });
        
        // --- Sidebar/Nav ---
        document.querySelector('.admin-menu-btn')?.addEventListener('click', () => {
             document.getElementById('adminSidebar')?.classList.add('open');
             document.getElementById('adminSidebarOverlay')?.classList.add('open');
        });
        
        document.getElementById('adminSidebarOverlay')?.addEventListener('click', () => {
             document.getElementById('adminSidebar')?.classList.remove('open');
             document.getElementById('adminSidebarOverlay')?.classList.remove('open');
        });

        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                showSection(item.dataset.section);
            });
        });

        // --- Auth Form ---
        document.getElementById('adminLockForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const passInput = document.getElementById('adminPassword');
            const entered = passInput?.value?.trim();
            const now = Date.now();
            
            const lockUntil = getAdminLockUntil();
            if (lockUntil && lockUntil > now) {
                showAdminLockError(`Too many attempts. Try again in ${formatLockDuration(lockUntil - now)}.`);
                return;
            }

            if (entered === ADMIN_PASSWORD) {
                sessionStorage.setItem('admin_session', 'besion_' + Math.random().toString(36).substring(2));
                setAdminUnlocked(true);
            } else {
                const attempts = getAdminAttempts(now);
                attempts.push(now);
                setAdminAttempts(attempts);
                if (attempts.length >= MAX_ADMIN_ATTEMPTS) {
                    setAdminLockUntil(now + ADMIN_ATTEMPT_WINDOW_MS);
                    showAdminLockError(`Too many attempts. Try again in 1 hour.`);
                } else {
                    showAdminLockError(`Incorrect password. ${MAX_ADMIN_ATTEMPTS - attempts.length} attempts left.`);
                }
            }
        });

        document.getElementById('adminLockToggle')?.addEventListener('click', () => {
            const input = document.getElementById('adminPassword');
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            document.getElementById('adminLockToggle').textContent = isPassword ? 'Hide' : 'Show';
        });

        // --- Filters ---
        document.getElementById('productSearch')?.addEventListener('input', () => {
            renderProductsTable(); renderTechnicalsTable(); renderFormulationsTable();
        });
        document.getElementById('filterCategory')?.addEventListener('change', () => {
            renderProductsTable(); renderTechnicalsTable(); renderFormulationsTable();
        });
        document.getElementById('filterMarket')?.addEventListener('change', (e) => {
            updateFilterCategoryOptions(e.target.value);
            renderProductsTable(); renderTechnicalsTable(); renderFormulationsTable();
        });

        // --- Sync/Category Toolbar ---
        document.querySelector('[onclick="syncDatabase()"]')?.removeAttribute('onclick');
        document.querySelectorAll('button').forEach(btn => {
           if (btn.textContent.includes('Sync Database')) {
               btn.addEventListener('click', () => {
                    const pass = prompt('Enter sync password:');
                    if (pass === ADMIN_CONFIG.syncPassword) {
                        window.besionSyncAll({
                            products: window.ADMIN_PRODUCTS,
                            technicals: window.ADMIN_TECHNICALS,
                            formulations: window.ADMIN_FORMULATIONS,
                            settings: window.safeJsonParse(window.storageGet('besion_admin_settings'), {}),
                            categories: { domestic: DOMESTIC_CATEGORY_OPTIONS, global: GLOBAL_CATEGORY_OPTIONS }
                        }).then(res => {
                            if (res.ok) window.showToast('Synced successfully!', 'success');
                            else window.showToast('Sync failed.', 'error');
                        });
                    }
               });
           }
           if (btn.textContent.includes('Manage Categories')) {
               btn.addEventListener('click', openCategoryModal);
           }
           if (btn.textContent.includes('Add New Product')) {
               btn.addEventListener('click', openAddModal);
           }
           if (btn.textContent.includes('Lock Admin')) {
               btn.addEventListener('click', lockAdmin);
           }
           if (btn.textContent.includes('Save Settings')) {
               btn.addEventListener('click', saveSettings);
           }
        });

        // --- Modal Buttons ---
        document.getElementById('btnSaveProduct')?.addEventListener('click', (e) => {
            e.preventDefault();
            saveProduct();
        });
        document.getElementById('btnCancelProduct')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal();
        });
        document.getElementById('btnAddDomesticCategory')?.addEventListener('click', (e) => {
            e.preventDefault();
            addCategory('domestic');
        });
        document.getElementById('btnAddTechnical')?.addEventListener('click', (e) => {
            e.preventDefault();
            openTechnicalModal();
        });
        document.getElementById('btnAddFormulation')?.addEventListener('click', (e) => {
            e.preventDefault();
            openFormulationModal();
        });
        document.getElementById('btnAddGlobalCategory')?.addEventListener('click', (e) => {
            e.preventDefault();
            addCategory('global');
        });
        document.getElementById('btnCloseCategory')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeCategoryModal();
        });
        document.getElementById('btnConfirmDelete')?.addEventListener('click', (e) => {
            e.preventDefault();
            confirmDelete();
        });
        document.getElementById('btnCancelDelete')?.addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('deleteModal')?.classList.remove('open');
        });
        document.getElementById('btnSaveTechnical')?.addEventListener('click', (e) => {
            e.preventDefault();
            saveTechnical();
        });
        document.getElementById('btnCancelTechnical')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeTechnicalModal();
        });
        document.getElementById('btnSaveFormulation')?.addEventListener('click', (e) => {
            e.preventDefault();
            saveFormulation();
        });
        document.getElementById('btnCancelFormulation')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeFormulationModal();
        });
        document.getElementById('btnConfirmGlobalDelete')?.addEventListener('click', (e) => {
            e.preventDefault();
            confirmGlobalDelete();
        });
        document.getElementById('btnCancelGlobalDelete')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeGlobalDeleteModal();
        });

        // --- Event Delegation ---
        document.addEventListener('click', (e) => {
            const editProd = e.target.closest('.js-edit-product');
            if (editProd) openEditModal(editProd.dataset.id);

            const delProd = e.target.closest('.js-delete-product');
            if (delProd) openDeleteModal(delProd.dataset.id);

            const editCat = e.target.closest('.js-edit-cat');
            if (editCat) editCategory(editCat.dataset.type, editCat.dataset.value);

            const delCat = e.target.closest('.js-delete-cat');
            if (delCat) deleteCategory(delCat.dataset.type, delCat.dataset.value);

            const editTech = e.target.closest('.js-edit-tech');
            if (editTech) openTechnicalModal(editTech.dataset.id);

            const delTech = e.target.closest('.js-delete-tech');
            if (delTech) openGlobalDeleteModal('technical', delTech.dataset.id);

            const editForm = e.target.closest('.js-edit-formulation');
            if (editForm) openFormulationModal(editForm.dataset.id);

            const delForm = e.target.closest('.js-delete-formulation');
            if (delForm) openGlobalDeleteModal('formulation', delForm.dataset.id);
            
            // Generic modal close
            if (e.target.classList.contains('modal-close')) {
                closeModal(); closeCategoryModal(); closeTechnicalModal(); closeFormulationModal(); closeGlobalDeleteModal();
                document.getElementById('deleteModal')?.classList.remove('open');
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('js-product-order')) {
                const products = Array.isArray(window.ADMIN_PRODUCTS) ? window.ADMIN_PRODUCTS : [];
                const p = products.find(x => x.id === e.target.dataset.id);
                if (p) {
                  p.order = parseInt(e.target.value, 10) || 1;
                  normalizeDomesticProductOrders(products);
                  window.storageSet('besion_products', JSON.stringify(products));
                  renderProductsTable();
                }
            }
            if (e.target.classList.contains('js-tech-order')) {
                const technicals = Array.isArray(window.ADMIN_TECHNICALS) ? window.ADMIN_TECHNICALS : [];
                const t = technicals.find(x => x.id === e.target.dataset.id);
                if (t) { t.order = parseInt(e.target.value, 10) || 1; window.storageSet('besion_technicals', JSON.stringify(technicals)); renderTechnicalsTable(); }
            }
            if (e.target.classList.contains('js-form-order')) {
                const formulations = Array.isArray(window.ADMIN_FORMULATIONS) ? window.ADMIN_FORMULATIONS : [];
                const f = formulations.find(x => x.id === e.target.dataset.id);
                if (f) { f.order = parseInt(e.target.value, 10) || 1; window.storageSet('besion_formulations', JSON.stringify(formulations)); renderFormulationsTable(); }
            }
            if (e.target.id === 'fMarket') updateProductCategoryOptions(false);
            if (e.target.id === 'fImage') updateImagePreview();
        });

        // Error handling for dynamic images
        document.addEventListener('error', (e) => {
            if (e.target.classList.contains('js-table-img')) {
                e.target.onerror = null;
                e.target.src = FALLBACK_IMAGE;
            }
        }, true);

        // Initial setup
        setAdminUnlocked(isAdminUnlocked());
        if (isAdminUnlocked()) showSection('products');
    });

})();
