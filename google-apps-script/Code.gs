/**
 * Besion Chemical Sync Service (Google Apps Script)
 * Deploy as Web App and use the URL in js/config.js
 */

const BESION_SYNC = {
  // Optional: set Spreadsheet ID; leave blank to use the bound sheet
  SHEET_ID: '',
  // Password required for push/sync/login (acts as the only auth token)
  ADMIN_PASSWORD: 'Kush', // MUST be set to the desired admin password

  SHEETS: {
    products: {
      name: 'Products',
      columns: [
        'order',
        'id',
        'name',
        'technical',
        'category',
        'market',
        'image',
        'pdfLink',
        'status',
        'description',
        'modeOfAction',
        'majorCrops',
        'targetPests',
        'dose',
        'packaging',
        'featured'
      ]
    },
    technicals: {
      name: 'Technicals',
      columns: ['id', 'category', 'technical_name', 'brand_name', 'order']
    },
    formulations: {
      name: 'Formulations',
      columns: ['id', 'category', 'formulation_name', 'order']
    },
    settings: {
      name: 'Settings',
      columns: ['key', 'value']
    },
    categories: {
      name: 'Categories',
      columns: ['market', 'value', 'label']
    }
  }
};

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  const params = (e && e.parameter) || {};
  const body = (e && e.postData && e.postData.contents)
    ? safeJson_(e.postData.contents)
    : {};
  const action = String(body.action || params.action || 'pull').toLowerCase();
  const password = String(body.password || params.password || '').trim();

  // If password is required but NOT configured on the server
  if (!BESION_SYNC.ADMIN_PASSWORD) {
    return json_({ ok: false, error: 'Server misconfiguration: ADMIN_PASSWORD not set in Code.gs.' });
  }

  // Public Actions
  if (action === 'pull') {
    try {
      // Optional: client may request only specific sheets to reduce transfer size.
      // e.g. { action: 'pull', sheets: ['settings'] } for homepage
      const requestedSheets = Array.isArray(body.sheets || params.sheets)
        ? (body.sheets || params.sheets).map(s => String(s).toLowerCase())
        : null; // null = return all sheets

      const data = readScoped_(requestedSheets);
      const version = hashData_(data);
      return jsonWithVersion_({ ok: true, data: data }, version);
    } catch (err) {
      return json_({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  }

  // Protected Actions - Require exact password match
  if (password !== BESION_SYNC.ADMIN_PASSWORD) {
    // Return standard generic error to avoid leaking whether password was close
    return json_({ ok: false, error: 'Unauthorized: Incorrect password.' });
  }

  try {
    if (action === 'login') {
      // Just returning ok signifies the password was correct
      return json_({ ok: true });
    }
    
    if (action === 'sync' || action === 'push') {
      writeAll_(body.data || {});
      const data = readAll_();
      return json_({ ok: true, data: data });
    }
    
    return json_({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function safeJson_(text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch (err) {
    return {};
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Like json_() but adds Cache-Control headers for pull responses.
 * GAS ContentService does not support arbitrary response headers directly;
 * however including cache metadata in the response body lets the client
 * implement ETag-style version checking to skip unnecessary re-renders.
 */
function jsonWithVersion_(obj, version) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...obj, _v: version }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Simple non-cryptographic hash for generating a version fingerprint.
 */
function hashData_(data) {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return Math.abs(hash).toString(36);
}

function getSpreadsheet_() {
  if (BESION_SYNC.SHEET_ID) {
    return SpreadsheetApp.openById(BESION_SYNC.SHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name, columns) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (name === BESION_SYNC.SHEETS.products.name) {
    ensureProductsOrderColumn_(sheet, columns);
  }
  const maxCols = Math.max(columns.length, sheet.getLastColumn(), 1);
  const headerValues = sheet.getRange(1, 1, 1, maxCols).getValues()[0];
  const header = headerValues.map(value => String(value || '').trim());
  let needsHeader = false;
  for (let i = 0; i < columns.length; i += 1) {
    if (header[i] !== columns[i]) {
      needsHeader = true;
      break;
    }
  }
  if (needsHeader) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    if (maxCols > columns.length) {
      sheet.getRange(1, columns.length + 1, 1, maxCols - columns.length).clearContent();
    }
  }
  return sheet;
}

function ensureProductsOrderColumn_(sheet, columns) {
  const maxCols = Math.max(sheet.getLastColumn(), 1);
  const headerValues = sheet.getRange(1, 1, 1, maxCols).getValues()[0];
  const header = headerValues.map(value => String(value || '').trim());
  const orderIdx = header.indexOf('order');

  if (orderIdx === -1) {
    sheet.insertColumnBefore(1);
  } else if (orderIdx !== 0) {
    const lastRow = Math.max(sheet.getLastRow(), 1);
    const orderValues = sheet.getRange(1, orderIdx + 1, lastRow, 1).getValues();
    sheet.insertColumnBefore(1);
    sheet.getRange(1, 1, lastRow, 1).setValues(orderValues);
    sheet.deleteColumn(orderIdx + 2);
  }

  sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const orderRange = sheet.getRange(2, 1, lastRow - 1, 1);
    const values = orderRange.getValues();
    let changed = false;
    for (let i = 0; i < values.length; i += 1) {
      if (values[i][0] === '' || values[i][0] === null) {
        values[i][0] = i + 1;
        changed = true;
      }
    }
    if (changed) orderRange.setValues(values);
  }
}

function readTable_(sheet, columns) {
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const header = values[0].map(value => String(value || '').trim());
  const indexMap = {};
  columns.forEach(col => {
    indexMap[col] = header.indexOf(col);
  });

  const rows = [];
  for (let r = 1; r < values.length; r += 1) {
    const row = values[r];
    const obj = {};
    let hasValue = false;
    columns.forEach(col => {
      const idx = indexMap[col];
      const cell = idx >= 0 ? row[idx] : '';
      if (cell !== '' && cell !== null && cell !== undefined) hasValue = true;
      obj[col] = cell;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

function writeTable_(sheet, columns, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
  if (!rows.length) return;
  const values = rows.map(row => columns.map(col => row[col] !== undefined ? row[col] : ''));
  sheet.getRange(2, 1, values.length, columns.length).setValues(values);
}

function toString_(value) {
  if (value === null || value === undefined) return '';
  // Basic XSS pre-sanitization: strip potential script tags on write
  return String(value).replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '');
}

function toNumber_(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  return Number.isFinite(num) ? num : '';
}

function toBool_(value) {
  if (value === true || value === false) return value;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return false;
  return ['true', 'yes', '1', 'y'].indexOf(raw) >= 0;
}

function readAll_() {
  const productSheet = getSheet_(BESION_SYNC.SHEETS.products.name, BESION_SYNC.SHEETS.products.columns);
  const technicalSheet = getSheet_(BESION_SYNC.SHEETS.technicals.name, BESION_SYNC.SHEETS.technicals.columns);
  const formulationSheet = getSheet_(BESION_SYNC.SHEETS.formulations.name, BESION_SYNC.SHEETS.formulations.columns);
  const settingsSheet = getSheet_(BESION_SYNC.SHEETS.settings.name, BESION_SYNC.SHEETS.settings.columns);
  const categoriesSheet = getSheet_(BESION_SYNC.SHEETS.categories.name, BESION_SYNC.SHEETS.categories.columns);

  const rawProducts = readTable_(productSheet, BESION_SYNC.SHEETS.products.columns);
  const rawTechnicals = readTable_(technicalSheet, BESION_SYNC.SHEETS.technicals.columns);
  const rawFormulations = readTable_(formulationSheet, BESION_SYNC.SHEETS.formulations.columns);
  const rawSettings = readTable_(settingsSheet, BESION_SYNC.SHEETS.settings.columns);
  const rawCategories = readTable_(categoriesSheet, BESION_SYNC.SHEETS.categories.columns);

  const products = rawProducts.map((row, idx) => ({
    // Default to sheet row position when order is missing
    order: toNumber_(row.order) !== '' ? toNumber_(row.order) : (idx + 1),
    id: toString_(row.id),
    name: toString_(row.name),
    technical: toString_(row.technical),
    category: toString_(row.category),
    market: toString_(row.market),
    image: toString_(row.image),
    pdfLink: toString_(row.pdfLink),
    status: toString_(row.status),
    description: toString_(row.description),
    modeOfAction: toString_(row.modeOfAction),
    majorCrops: toString_(row.majorCrops),
    targetPests: toString_(row.targetPests),
    dose: toString_(row.dose),
    packaging: toString_(row.packaging),
    featured: toBool_(row.featured)
  }));

  const technicals = rawTechnicals.map(row => ({
    id: toString_(row.id),
    category: toString_(row.category),
    technical_name: toString_(row.technical_name),
    brand_name: toString_(row.brand_name),
    order: toNumber_(row.order)
  }));

  const formulations = rawFormulations.map(row => ({
    id: toString_(row.id),
    category: toString_(row.category),
    formulation_name: toString_(row.formulation_name),
    order: toNumber_(row.order)
  }));

  const settings = {};
  rawSettings.forEach(row => {
    const key = toString_(row.key);
    if (!key) return;
    settings[key] = toString_(row.value);
  });

  const categories = { domestic: [], global: [] };
  rawCategories.forEach(row => {
    const market = toString_(row.market).toLowerCase();
    const value = toString_(row.value);
    const label = toString_(row.label);
    if (!value || !label) return;
    if (market === 'global') {
      categories.global.push({ value: value, label: label });
    } else {
      categories.domestic.push({ value: value, label: label });
    }
  });

  return {
    products: products,
    technicals: technicals,
    formulations: formulations,
    settings: settings,
    categories: categories
  };
}

function writeAll_(data) {
  const lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try {
    if (Array.isArray(data.products)) {
      writeProducts_(data.products);
    }
    if (Array.isArray(data.technicals)) {
      writeTechnicals_(data.technicals);
    }
    if (Array.isArray(data.formulations)) {
      writeFormulations_(data.formulations);
    }
    if (data.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)) {
      writeSettings_(data.settings);
    }
    if (data.categories && typeof data.categories === 'object') {
      writeCategories_(data.categories);
    }
  } finally {
    lock.releaseLock();
  }
}

function writeProducts_(items) {
  const sheet = getSheet_(BESION_SYNC.SHEETS.products.name, BESION_SYNC.SHEETS.products.columns);
  const normalized = items.map((item, idx) => {
    const order = toNumber_(item.order);
    return { ...item, order: order !== '' ? order : (idx + 1) };
  });
  const rows = normalized
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(item => ({
      order: toNumber_(item.order),
      id: toString_(item.id),
      name: toString_(item.name),
      technical: toString_(item.technical),
      category: toString_(item.category),
      market: toString_(item.market),
      image: toString_(item.image),
      pdfLink: toString_(item.pdfLink),
      status: toString_(item.status),
      description: toString_(item.description),
      modeOfAction: toString_(item.modeOfAction),
      majorCrops: toString_(item.majorCrops),
      targetPests: toString_(item.targetPests),
      dose: toString_(item.dose),
      packaging: toString_(item.packaging),
      featured: toBool_(item.featured)
    }));
  writeTable_(sheet, BESION_SYNC.SHEETS.products.columns, rows);
}

function writeTechnicals_(items) {
  const sheet = getSheet_(BESION_SYNC.SHEETS.technicals.name, BESION_SYNC.SHEETS.technicals.columns);
  const rows = items.map(item => ({
    id: toString_(item.id),
    category: toString_(item.category),
    technical_name: toString_(item.technical_name),
    brand_name: toString_(item.brand_name),
    order: toNumber_(item.order)
  }));
  writeTable_(sheet, BESION_SYNC.SHEETS.technicals.columns, rows);
}

function writeFormulations_(items) {
  const sheet = getSheet_(BESION_SYNC.SHEETS.formulations.name, BESION_SYNC.SHEETS.formulations.columns);
  const rows = items.map(item => ({
    id: toString_(item.id),
    category: toString_(item.category),
    formulation_name: toString_(item.formulation_name),
    order: toNumber_(item.order)
  }));
  writeTable_(sheet, BESION_SYNC.SHEETS.formulations.columns, rows);
}

function writeSettings_(settings) {
  const sheet = getSheet_(BESION_SYNC.SHEETS.settings.name, BESION_SYNC.SHEETS.settings.columns);
  const orderedKeys = [
    'whatsapp',
    'email',
    'phone',
    'address',
    'homeHeroBg',
    'homeAboutImage'
  ];
  const extraKeys = Object.keys(settings).filter(key => orderedKeys.indexOf(key) === -1).sort();
  const keys = orderedKeys.concat(extraKeys);
  const rows = keys.map(key => ({ key: key, value: toString_(settings[key]) }));
  writeTable_(sheet, BESION_SYNC.SHEETS.settings.columns, rows);
}

function writeCategories_(categories) {
  const sheet = getSheet_(BESION_SYNC.SHEETS.categories.name, BESION_SYNC.SHEETS.categories.columns);
  const rows = [];
  const domestic = Array.isArray(categories.domestic) ? categories.domestic : [];
  const global = Array.isArray(categories.global) ? categories.global : [];

  domestic.forEach(item => {
    rows.push({
      market: 'domestic',
      value: toString_(item.value),
      label: toString_(item.label)
    });
  });
  global.forEach(item => {
    rows.push({
      market: 'global',
      value: toString_(item.value),
      label: toString_(item.label)
    });
  });

  writeTable_(sheet, BESION_SYNC.SHEETS.categories.columns, rows);
}
