const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzt0MhVz1yUNLTEFNrCDJ6rbqH9RQ1uyd5t_1-n6kBBStqsKSQVPunYqQZgXvRc_PN1qw/exec";

let mainData = [];
let otherData = {};
let currentFilteredData = [];
let currentPage = 1;
let currentModule = null; 
const RESULTS_PER_PAGE = 10;
const MAIN_MODULE_NAMES = ['PSO', 'TRS', 'MNR', 'TES'];

document.addEventListener('DOMContentLoaded', () => {
  initApp();
  
  document.getElementById('mainSearch').addEventListener('input', executeSearch);
  document.getElementById('clearBtn').addEventListener('click', () => {
    document.getElementById('mainSearch').value = '';
    executeSearch();
  });
  document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('catFilter').addEventListener('change', () => handleFilterChange('category'));
  document.getElementById('countryFilter').addEventListener('change', () => handleFilterChange('country'));
  document.getElementById('vendorFilter').addEventListener('change', () => handleFilterChange('vendor'));

  document.body.addEventListener('click', (e) => {
    if (e.target.closest('#btn-browse-main')) openDataView('MAIN');
    if (e.target.closest('#btn-back-menu')) closeDataView();
    
    const secondaryBtn = e.target.closest('.secondary-btn');
    if (secondaryBtn) openDataView(secondaryBtn.dataset.module);

    // CHANGED: Listen for clicks on the entire card instead of just the title
    const resultCard = e.target.closest('.result-item');
    if (resultCard) openModal(resultCard.dataset.id);
    
    const pageBtn = e.target.closest('.page-btn');
    if (pageBtn && !pageBtn.disabled && !pageBtn.classList.contains('active')) {
      const pageText = pageBtn.textContent;
      if (pageText === 'Prev') changePage(currentPage - 1);
      else if (pageText === 'Next') changePage(currentPage + 1);
      else changePage(parseInt(pageText));
    }
    
    if (e.target.id === 'detailModal') closeModal();
  });

  // Manual Sync / Refresh
  const refreshBtn = document.getElementById('btn-force-refresh');
  if (refreshBtn) {
    const actionsMenu = document.getElementById('home-actions-menu');
    const syncError = document.getElementById('sync-error');

    function showSyncError(message) {
      syncError.textContent = `Unable to refresh data: ${message || 'Please try again.'}`;
      syncError.hidden = false;
      actionsMenu.hidden = false;
      document.getElementById('home-actions-btn').setAttribute('aria-expanded', 'true');
    }

    refreshBtn.addEventListener('click', () => {
      const heroScreen = document.getElementById('screen-home');
      const heroSyncStatus = document.getElementById('hero-sync-status');
      refreshBtn.classList.add('spinning');
      heroScreen.classList.add('syncing');
      heroSyncStatus.setAttribute('aria-hidden', 'false');
      syncError.hidden = true;
      const allBtns = document.querySelectorAll('button');
      allBtns.forEach(b => b.disabled = true); // Lock UI

      // Send to background to guarantee completion even if UI is closed
      chrome.runtime.sendMessage({ action: 'forceSync' }, (response) => {
        refreshBtn.classList.remove('spinning');
        heroScreen.classList.remove('syncing');
        heroSyncStatus.setAttribute('aria-hidden', 'true');
        allBtns.forEach(b => b.disabled = false); // Unlock UI
        if (response && response.status === 'error') {
          console.error("Force sync failed:", response.error);
          showSyncError(response.error);
        } else if (chrome.runtime.lastError) {
          console.error("Force sync failed:", chrome.runtime.lastError.message);
          showSyncError(chrome.runtime.lastError.message);
        }
      });
    });
  }

  // --- SYNC & TIME FORMATTING LOGIC ---
  function formatSyncTime(ts) {
    if (!ts) return 'Last refreshed: Never';
    const date = new Date(ts);
    return 'Last refreshed: ' + date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + 
           ' at ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  async function updateSyncTimeDisplay() {
    const storage = await chrome.storage.local.get(['lastSynced']);
    const el = document.getElementById('last-sync-time');
    if (el) el.innerText = formatSyncTime(storage.lastSynced);
  }

  updateSyncTimeDisplay(); // Initial load
  
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.lastSynced) {
      updateSyncTimeDisplay();
    }
  });
});

async function initApp() {
  try {
    const storage = await chrome.storage.local.get(['rulesData']);
    if (storage.rulesData) {
      processData(storage.rulesData);
    } else {
      document.getElementById('loader-text').innerHTML = 'INITIALIZING DATABASE...<br><span style="font-size:9px; font-weight:normal;">This may take a few seconds on first launch.</span>';
    }
    
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.rulesData) {
        processData(changes.rulesData.newValue);
      }
    });
  } catch (err) {
    document.getElementById('loader-text').innerHTML = `<span style="color:red;">Data Load Error</span>`;
    document.querySelector('.modern-loader').style.display = 'none';
  }
}

function processData(rawData) {
  mainData = [];
  otherData = {};
  let idCounter = 0;

  for (const [sheetName, sheetContent] of Object.entries(rawData)) {
    if (!Array.isArray(sheetContent)) continue;
    if (sheetName.toLowerCase().includes('instruction')) continue;

    if (MAIN_MODULE_NAMES.includes(sheetName)) {
      sheetContent.forEach(r => {
        mainData.push({
          id: 'main_' + idCounter++,
          ruleId: String(r['#'] || 'N/A').trim(),
          category: sheetName,
          country: String(r['Country'] || r['Country\n2 Letter code'] || r['Column_3'] || 'N/A').trim(),
          vendor: String(r['Specific Vendors related\n(please use vendor code where possible)'] || r['Specifics Vendor Related'] || r['Column_4'] || '').trim(),
          solution: String(r['Solution and step by step guide'] || r['Step-by-Step Guide'] || r['Column_6'] || '').trim(),
          escalation: String(r['Requires escalation to onshore  '] || r['Requires escalation to onshore'] || 'no').trim().toLowerCase(),
          raw: r
        });
      });
    } else {
      otherData[sheetName] = sheetContent.map(r => ({
        id: 'other_' + idCounter++,
        category: sheetName,
        raw: r
      }));
    }
  }
  renderWelcomeMenu();
}

function renderWelcomeMenu() {
  document.getElementById('loader').style.display = 'none';
  document.getElementById('rulebook-welcome-view').style.display = 'block';
  document.getElementById('rulebook-data-view').style.display = 'none';

  const secList = document.getElementById('secondary-modules-list');
  const resourceCount = document.getElementById('resource-count');
  if (resourceCount) resourceCount.textContent = Object.keys(otherData).length ? `${Object.keys(otherData).length} resources` : '';
  secList.innerHTML = Object.keys(otherData).map(name => `
    <button class="secondary-btn" data-module="${name}">
      <span class="resource-icon">&#10022;</span><span class="resource-name">${name}</span><span class="resource-arrow">&rarr;</span>
    </button>
  `).join('');
}

function openDataView(moduleName) {
  currentModule = moduleName;
  document.getElementById('rulebook-welcome-view').style.display = 'none';
  document.getElementById('rulebook-data-view').style.display = 'block';
  document.getElementById('mainSearch').value = '';
  document.getElementById('clearBtn').style.display = 'none';

  if (moduleName === 'MAIN') {
    document.getElementById('data-view-title').innerText = 'Main Rulebook';
    document.getElementById('filter-section').style.display = 'grid'; // Changed to grid
    populateDropdown('catFilter', getUniqueValues(mainData, 'category'), 'Category');
    populateDropdown('countryFilter', getUniqueValues(mainData, 'country'), 'Country');
    populateDropdown('vendorFilter', getUniqueValues(mainData, 'vendor'), 'Vendor');
  } else {
    document.getElementById('data-view-title').innerText = moduleName;
    document.getElementById('filter-section').style.display = 'none';
  }
  
  currentPage = 1;
  executeSearch();
}

function closeDataView() {
  currentModule = null;
  document.getElementById('rulebook-data-view').style.display = 'none';
  document.getElementById('rulebook-welcome-view').style.display = 'block';
}

window.goToHome = function() { closeDataView(); };

function getUniqueValues(dataArr, key) {
  return [...new Set(dataArr.map(item => item[key]))].filter(val => val && val !== 'N/A').sort();
}

function populateDropdown(elementId, values) {
  const el = document.getElementById(elementId);
  const currentVal = el.value;
  const MAX_CHARS = 25;
  el.innerHTML = `<option value="">All</option>` + values.map(v => {
    const displayValue = v.length > MAX_CHARS ? v.substring(0, MAX_CHARS) + '...' : v;
    return `<option value="${v}" title="${v}">${displayValue}</option>`;
  }).join('');
  if (values.includes(currentVal)) el.value = currentVal;
  else el.value = "";
}

function resetFilters() {
  document.getElementById('catFilter').value = '';
  document.getElementById('countryFilter').value = '';
  document.getElementById('vendorFilter').value = '';
  populateDropdown('countryFilter', getUniqueValues(mainData, 'country'));
  populateDropdown('vendorFilter', getUniqueValues(mainData, 'vendor'));
  executeSearch();
}

function handleFilterChange(changedFilter) {
  const selectedCat = document.getElementById('catFilter').value;
  const selectedCountry = document.getElementById('countryFilter').value;
  
  let tempCountryData = mainData;
  if (selectedCat) tempCountryData = mainData.filter(d => d.category === selectedCat);
  
  let tempVendorData = tempCountryData;
  if (selectedCountry) tempVendorData = tempCountryData.filter(d => d.country === selectedCountry);

  if (changedFilter === 'category') {
    populateDropdown('countryFilter', getUniqueValues(tempCountryData, 'country'));
    populateDropdown('vendorFilter', getUniqueValues(tempVendorData, 'vendor'));
  } else if (changedFilter === 'country') {
    populateDropdown('vendorFilter', getUniqueValues(tempVendorData, 'vendor'));
  }
  executeSearch();
}

function executeSearch() {
  const query = document.getElementById('mainSearch').value.toLowerCase().trim();
  document.getElementById('clearBtn').style.display = query.length > 0 ? 'flex' : 'none';
  
  let results = currentModule === 'MAIN' ? mainData : otherData[currentModule];

  if (currentModule === 'MAIN') {
    const cat = document.getElementById('catFilter').value;
    const country = document.getElementById('countryFilter').value;
    const vendor = document.getElementById('vendorFilter').value;
    
    results = results.filter(r => {
      if (cat && r.category !== cat) return false;
      if (country && r.country !== country) return false;
      if (vendor && r.vendor !== vendor) return false;
      return true;
    });
  }

  if (query) {
    const terms = query.split(/\s+/);
    results = results.filter(row => {
      const searchableText = Object.values(row.raw).join(' ').toLowerCase();
      return terms.every(term => searchableText.includes(term));
    });
  }
  
  currentFilteredData = results;
  currentPage = 1;
  renderResults();
}

function renderResults() {
  const listEl = document.getElementById('resultsList');
  const statsEl = document.getElementById('resultStats');
  statsEl.innerText = `${currentFilteredData.length} ${currentFilteredData.length === 1 ? 'entry' : 'entries'}`;

  if (currentFilteredData.length === 0) {
    listEl.innerHTML = '<div class="empty-results"><span>&#8981;</span><strong>No entries found</strong><p>Try a different keyword or clear the filters.</p></div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }

  const startIndex = (currentPage - 1) * RESULTS_PER_PAGE;
  const endIndex = startIndex + RESULTS_PER_PAGE;
  const pageData = currentFilteredData.slice(startIndex, endIndex);

  let html = '';
  pageData.forEach(row => {
    // CHANGED: data-id is now on the root result-item, making the whole card clickable
    if (currentModule === 'MAIN') {
      const snippet = row.solution ? row.solution.substring(0, 160) + '...' : 'No step-by-step guide provided.';
      const vendorDisplay = row.vendor && row.vendor !== 'N/A' ? `&bull; ${row.vendor}` : '';
      html += `
        <div class="result-item" data-id="${row.id}">
          <div class="result-copy">
            <div class="result-breadcrumbs"><span class="category-label">${row.category}</span><span>${row.country} ${vendorDisplay}</span></div>
            <div class="result-title">Rule #${row.ruleId}</div>
            <div class="result-snippet">${snippet}</div>
          </div>
          <span class="result-open">&rsaquo;</span>
        </div>
      `;
    } else {
      const keys = Object.keys(row.raw).filter(k => k && !k.startsWith('Column_') && String(row.raw[k]).trim() !== '');
      const titleKey = keys[0] || 'Entry';
      const subtitleKey = keys[1] || '';
      
      const title = row.raw[titleKey] || 'N/A';
      const subtitle = subtitleKey ? `${subtitleKey}: ${row.raw[subtitleKey]}` : '';
      const snippetText = keys.slice(2, 5).map(k => `<b>${k}:</b> ${row.raw[k]}`).join(' &nbsp;|&nbsp; ');

      html += `
        <div class="result-item" data-id="${row.id}">
          <div class="result-copy">
            <div class="result-breadcrumbs"><span class="category-label">${row.category}</span></div>
            <div class="result-title">${title}</div>
            <div class="dynamic-subtitle">${subtitle}</div>
            <div class="result-snippet">${snippetText}</div>
          </div>
          <span class="result-open">&rsaquo;</span>
        </div>
      `;
    }
  });

  listEl.innerHTML = html;
  renderPagination();
}

function renderPagination() {
  const totalPages = Math.ceil(currentFilteredData.length / RESULTS_PER_PAGE);
  const pagEl = document.getElementById('pagination');
  if (totalPages <= 1) { pagEl.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}">${i}</button>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += `<span style="color: #ccc; padding: 6px;">...</span>`;
    }
  }
  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
  pagEl.innerHTML = html;
}

function changePage(newPage) {
  const totalPages = Math.ceil(currentFilteredData.length / RESULTS_PER_PAGE);
  if (newPage < 1 || newPage > totalPages) return;
  currentPage = newPage;
  renderResults();
  document.getElementById('rulebook-app-container').scrollTo({ top: 0, behavior: 'smooth' });
}

function openModal(id) {
  const data = currentModule === 'MAIN' 
    ? mainData.find(d => d.id === id)
    : otherData[currentModule].find(d => d.id === id);
    
  if (!data) return;

  const formatText = text => {
    if (!text || String(text).trim() === '') return '<span class="empty-field">N/A</span>';
    let str = String(text);
    // Cleanup any lingering ISO dates locally if GAS wasn't updated
    if (str.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) str = str.split('T')[0];
    return str.replace(/\n/g, '<br>');
  };

  let modalHtml = `<div class="modal-grid">`;

  if (currentModule === 'MAIN') {
    const getValue = keyName => formatText(data.raw[keyName]);
    
    let escStatus = getValue('Requires escalation to onshore  ');
    if (escStatus.toLowerCase().includes('yes')) escStatus = `<span style="color:var(--blue); font-weight:bold;">YES</span>`;
    else if (escStatus.toLowerCase().includes('no') && !escStatus.includes('N/A')) escStatus = `<span style="color:var(--success); font-weight:bold;">NO</span>`;

    let approvalStatus = getValue('Approved status');
    if (approvalStatus.toLowerCase().includes('yes')) approvalStatus = `<span style="color:var(--success); font-weight:bold;">${approvalStatus}</span>`;
    else if (approvalStatus.toLowerCase().includes('no') && !approvalStatus.includes('N/A')) approvalStatus = `<span style="color:var(--blue); font-weight:bold;">${approvalStatus}</span>`;

    modalHtml += `
      <div class="modal-row-full" style="display: flex; flex-direction: column; gap: 15px;">
        <div>
          <div class="modal-label">Category</div>
          <div class="modal-value" style="background:var(--surface); border-color:var(--blue); font-weight:bold; color:var(--blue);">${formatText(data.raw._sheetCategory || data.category)}</div>
        </div>
        <div><div class="modal-label">Approved Status</div><div class="modal-value" style="background:var(--surface);">${approvalStatus}</div></div>
      </div>
      <div><div class="modal-label">Rule ID (#)</div><div class="modal-value">${formatText(data.raw['#'])}</div></div>
      <div><div class="modal-label">Country Code</div><div class="modal-value" style="font-weight:bold;">${formatText(data.raw['Country\n2 Letter code'])}</div></div>
      <div class="modal-row-full"><div class="modal-label">Category / Reason in AP</div><div class="modal-value">${getValue('Category/Reason in AP')}</div></div>
      <div><div class="modal-label">Specific Vendors Related</div><div class="modal-value">${getValue('Specific Vendors related\n(please use vendor code where possible)')}</div></div>
      <div><div class="modal-label">Specific Other Elements</div><div class="modal-value">${getValue('Specific other element if applicible')}</div></div>
      <div class="modal-row-full"><div class="modal-label">SOP Step</div><div class="modal-value">${getValue('SOP Step')}</div></div>
      <div class="modal-row-full"><div class="modal-label">Solution & Step-by-Step Guide</div><div class="modal-value highlight-solution">${getValue('Solution and step by step guide')}</div></div>
      <div><div class="modal-label">Requires Escalation?</div><div class="modal-value">${escStatus}</div></div>
      <div><div class="modal-label">Escalation Department</div><div class="modal-value">${getValue('department for escalation ')}</div></div>
    `;
  } else {
    Object.entries(data.raw).forEach(([key, val]) => {
      if (!key.startsWith('Column_') && String(val).trim() !== '') {
        modalHtml += `
          <div class="modal-row-full">
            <div class="modal-label">${key}</div>
            <div class="modal-value">${formatText(val)}</div>
          </div>
        `;
      }
    });
  }

  modalHtml += `</div>`;
  document.getElementById('modalBody').innerHTML = modalHtml;
  document.getElementById('detailModal').style.display = 'flex';
}

function closeModal() { document.getElementById('detailModal').style.display = 'none'; }