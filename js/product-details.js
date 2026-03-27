/* =============================================
   BESION CHEMICAL — PRODUCT DETAILS PAGE
   ============================================= */

const FALLBACK_IMAGE = window.BESION_FALLBACK_IMAGE || 'images/placeholder.svg';
const esc = (value) => typeof window.besionEscapeHtml === 'function'
  ? window.besionEscapeHtml(value)
  : String(value ?? '').replace(/[&<>"']/g, '');
const escWithBreaks = (value) => esc(value).replace(/\r?\n/g, '<br>');
const escAttr = (value) => typeof window.besionEscapeAttr === 'function'
  ? window.besionEscapeAttr(value)
  : esc(value);
const safeUrl = (value, fallback = '#') => typeof window.besionSafeUrl === 'function'
  ? window.besionSafeUrl(value, fallback)
  : (String(value ?? '').trim() || fallback);
const productHref = (id) => `product-details.html?id=${encodeURIComponent(String(id || ''))}`;

function safeJsonParseLocal(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch (err) {
    return fallback;
  }
}

function getStoredProducts() {
  try {
    const raw = localStorage.getItem('besion_products');
    const parsed = safeJsonParseLocal(raw, null);
    return Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

function resolveProducts() {
  if (typeof ADMIN_PRODUCTS !== 'undefined' && Array.isArray(ADMIN_PRODUCTS)) return ADMIN_PRODUCTS;
  if (Array.isArray(window.ADMIN_PRODUCTS)) return window.ADMIN_PRODUCTS;
  const stored = getStoredProducts();
  if (Array.isArray(stored)) return stored;
  if (typeof PRODUCTS_DB !== 'undefined' && Array.isArray(PRODUCTS_DB)) return PRODUCTS_DB;
  if (Array.isArray(window.PRODUCTS_DB)) return window.PRODUCTS_DB;
  return [];
}

function buildWhatsAppLink(productName = '') {
  let num = '919328110822';
  try {
    const raw = localStorage.getItem('besion_admin_settings');
    const parsed = safeJsonParseLocal(raw, {});
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.whatsapp) {
      num = parsed.whatsapp;
    }
  } catch (err) { }
  const cleanNum = String(num).replace(/[^\d]/g, '') || '919328110822';
  const msg = productName
    ? `Hello, I want to inquire about your product: ${productName}`
    : 'Hello, I need help with Besion Chemical products.';
  return `https://wa.me/${cleanNum}?text=${encodeURIComponent(msg)}`;
}

function setupRelatedAutoScroll(relatedGrid) {
  if (!relatedGrid || relatedGrid.dataset.autoscrollInit) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  relatedGrid.dataset.autoscrollInit = 'true';
  let intervalId = null;

  const getStep = () => {
    const card = relatedGrid.querySelector('.product-card');
    if (!card) return 0;
    const gridStyles = window.getComputedStyle(relatedGrid);
    const gap = parseFloat(gridStyles.columnGap || gridStyles.gap || '0') || 0;
    return card.getBoundingClientRect().width + gap;
  };

  const start = () => {
    if (intervalId) return;
    intervalId = window.setInterval(() => {
      const step = getStep();
      if (!step) return;
      const maxScroll = relatedGrid.scrollWidth - relatedGrid.clientWidth - 2;
      if (maxScroll <= 0) return;
      if (relatedGrid.scrollLeft >= maxScroll) {
        relatedGrid.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        relatedGrid.scrollBy({ left: step, behavior: 'smooth' });
      }
    }, 3000);
  };

  const stop = () => {
    if (!intervalId) return;
    window.clearInterval(intervalId);
    intervalId = null;
  };

  start();
  relatedGrid.addEventListener('pointerenter', stop);
  relatedGrid.addEventListener('pointerleave', start);
  relatedGrid.addEventListener('touchstart', stop, { passive: true });
  relatedGrid.addEventListener('touchend', start, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
}

function bindRelatedNav() {
  const grid = document.getElementById('relatedGrid');
  if (!grid) return;

  const goTo = (card) => {
    const href = card?.dataset?.href || '';
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

function downloadPDF(productName) {
  showToast(`PDF not available for ${productName}.`, 'error');
}

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  const backLink = document.getElementById('backToCategory');
  const referrer = document.referrer || '';
  const contentEl = document.getElementById('productContent');

  if (!productId) { window.location.href = 'products.html'; return; }

  const products = resolveProducts();
  if (!Array.isArray(products)) {
    if (contentEl) {
      contentEl.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:80px 20px">
        <p style="font-size:20px;color:var(--text-muted)">Product data failed to load.</p>
        <a href="products.html" class="btn btn-green" style="margin-top:20px">Back to Products</a>
      </div>`;
    }
    return;
  }

  const product = products.find(p => p.id === productId);
  if (!product) {
    if (contentEl) {
      contentEl.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:80px 20px">
        <p style="font-size:20px;color:var(--text-muted)">Product not found.</p>
        <a href="products.html" class="btn btn-green" style="margin-top:20px">Back to Products</a>
      </div>`;
    }
    return;
  }

  // Update page title & breadcrumb
  document.title = `${product.name} — Besion Chemical`;
  document.getElementById('breadProduct').textContent = product.name;

  // Back to category should always return to the product's category
  if (backLink) {
    const market = product.market === 'global' ? 'global' : 'domestic';
    const cat = product.category || '';
    const backParams = new URLSearchParams();
    backParams.set('market', market);
    if (cat) backParams.set('cat', cat);
    backLink.href = `products.html?${backParams.toString()}`;

    // Preserve browser history only when it already points to the same category
    let canUseHistory = false;
    try {
      if (referrer.includes('products.html')) {
        const refUrl = new URL(referrer);
        const refCat = refUrl.searchParams.get('cat') || '';
        const refMarket = refUrl.searchParams.get('market') || 'domestic';
        canUseHistory = refCat === cat && refMarket === market;
      }
    } catch (err) { }

    if (canUseHistory) {
      backLink.addEventListener('click', (event) => {
        event.preventDefault();
        window.history.back();
      });
    }
  }

  // WhatsApp link
  const waLink = (typeof getWhatsAppLink === 'function')
    ? getWhatsAppLink(product.name)
    : buildWhatsAppLink(product.name);
  const waEl = document.getElementById('waFloat');
  if (waEl) waEl.href = waLink;

  // Render product details
  const pdfLink = product.pdfLink || '';
  if (!contentEl) return;
  const safeImage = safeUrl((typeof resolveImageUrl === 'function' ? resolveImageUrl(product.image) : product.image) || FALLBACK_IMAGE, FALLBACK_IMAGE);
  const safeWaLink = safeUrl(waLink, '#');
  const safePdfLink = safeUrl(pdfLink, '#');
  contentEl.innerHTML = `
    <div class="product-img-gallery">
      <img src="${escAttr(safeImage)}" alt="${escAttr(product.name || 'Product')}"
        data-drive-raw="${escAttr(product.image || '')}" data-fallback="${escAttr(FALLBACK_IMAGE)}">
    </div>
    <div class="product-info-col">
      <h1 class="product-name">${esc(product.name || 'Product')}</h1>
      ${product.technical ? `
        <div class="technical-row">
          <span class="technical-label">Technical Name -</span>
          <span class="product-technical">${esc(product.technical)}</span>
        </div>
      ` : ''}
      <p class="product-desc">${esc(product.description || 'A high-quality agricultural chemical product from Besion Chemical.')}</p>

      <div class="product-info-grid">
        ${product.modeOfAction ? `<div class="info-card" style="grid-column:1/-1"><h5>Mode of Action</h5><p>${escWithBreaks(product.modeOfAction)}</p></div>` : ''}
        ${product.majorCrops ? `<div class="info-card"><h5>Major Crops</h5><p>${esc(product.majorCrops)}</p></div>` : ''}
        ${product.targetPests ? `<div class="info-card"><h5>Target Pests</h5><p>${esc(product.targetPests)}</p></div>` : ''}
        ${product.dose ? `<div class="info-card"><h5>Recommended Dose</h5><p>${esc(product.dose)}</p></div>` : ''}
        ${product.packaging ? `<div class="info-card"><h5>Packaging</h5><p>${esc(product.packaging)}</p></div>` : ''}
      </div>

      <div class="product-actions">
        <a href="${escAttr(safeWaLink)}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp">
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Inquire on WhatsApp
        </a>
        ${pdfLink ? `
        <a class="btn btn-outline-green" href="${escAttr(safePdfLink)}" target="_blank" rel="noopener noreferrer" download>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PDF
        </a>
        ` : `
        <button class="btn btn-outline-green" id="downloadPdfBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download PDF
        </button>
        `}
      </div>
    </div>
  `;

  const normalizeMarket = (value) => String(value || '').trim().toLowerCase();
  const normalizeCategory = (value) => {
    let v = String(value || '').trim().toLowerCase();
    // Strip "domestic -" or "global -" or "domestic →" or "global →" prefixes
    v = v.replace(/^(domestic|global)\s*[-→]\s*/i, '').trim();
    return v;
  };
  const isSameCategoryOrSub = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const separators = ['>', '/', ':', '-', '→'];
    return separators.some(sep => a.startsWith(`${b} ${sep} `) || b.startsWith(`${a} ${sep} `));
  };

  // Related products: strict same market + same category/subcategory only
  const baseMarket = normalizeMarket(product.market);
  const baseCategory = normalizeCategory(product.category);
  const related = products
    .filter(p => {
      if (p.id === product.id) return false;
      const sameMarket = normalizeMarket(p.market) === baseMarket;
      const sameCategory = isSameCategoryOrSub(normalizeCategory(p.category), baseCategory);
      return sameMarket && sameCategory;
    });
  if (related.length > 0) {
    const relatedSection = document.getElementById('relatedSection');
    const relatedGrid = document.getElementById('relatedGrid');
    if (relatedSection) relatedSection.style.display = '';
    if (relatedGrid) {
      relatedGrid.innerHTML = related.map(p => `
      <div class="product-card" role="link" tabindex="0" data-href="${escAttr(productHref(p.id))}">
        <div class="product-img-wrap">
          <img src="${escAttr(safeUrl((typeof resolveImageUrl === 'function' ? resolveImageUrl(p.image) : p.image) || FALLBACK_IMAGE, FALLBACK_IMAGE))}" alt="${escAttr(p.name || 'Product')}" loading="eager" decoding="async" data-drive-raw="${escAttr(p.image || '')}" data-fallback="${escAttr(FALLBACK_IMAGE)}">
        </div>
        <div class="product-card-info">
          <h3>${esc(p.name || 'Product')}</h3>
          <p>${esc(p.technical ? p.technical.substring(0, 50) + '...' : p.category)}</p>
        </div>
      </div>
    `).join('');
      setupRelatedAutoScroll(relatedGrid);
      bindRelatedNav();
    }
  }

  const downloadBtn = document.getElementById('downloadPdfBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => downloadPDF(product.name || 'this product'));
  }
});
