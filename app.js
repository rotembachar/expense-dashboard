const fileInput = document.getElementById("fileInput");
const statusEl = document.getElementById("status");
const errEl = document.getElementById("err");

const mainEl = document.getElementById("main");
const filtersCard = document.getElementById("filtersCard");
const viewTabsCard = document.getElementById("viewTabsCard");
const mainViewBtn = document.getElementById("mainViewBtn");
const jointOriginalViewBtn = document.getElementById("jointOriginalViewBtn");

const kpisEl = document.getElementById("kpis");
const kpiTotal = document.getElementById("kpiTotal");
const kpiLargest = document.getElementById("kpiLargest");
const kpiCount = document.getElementById("kpiCount");
const kpiTotalLabel = document.getElementById("kpiTotalLabel");

const accountFilter = document.getElementById("accountFilter");
const categoryFilter = document.getElementById("categoryFilter");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const clearFiltersBtn = document.getElementById("clearFiltersBtn");

const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportXlsxBtn = document.getElementById("exportXlsxBtn");

const summaryTableWrap = document.getElementById("summaryTableWrap");
const txTableWrap = document.getElementById("txTableWrap");
const categorySelect = document.getElementById("categorySelect");
const categoryTxWrap = document.getElementById("categoryTxWrap");

const REQUIRED = ["Date", "Merchant", "Category", "FinalAmount", "AccountType"];

let allRows = [];
let filteredRows = [];
let currentView = "main";

function resetUI() {
  errEl.textContent = "";
  statusEl.textContent = "";
  mainEl.style.display = "none";
  filtersCard.style.display = "none";
  kpisEl.style.display = "none";
  viewTabsCard.style.display = "none";
  currentView = "main";
  allRows = [];
  filteredRows = [];
  categoryFilter.innerHTML = "";
  categorySelect.innerHTML = "";
  summaryTableWrap.innerHTML = "";
  txTableWrap.innerHTML = "";
  categoryTxWrap.innerHTML = "";
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err),
    });
  });
}

function toNumber(x) {
  const v = Number(String(x ?? "").replace(/,/g, "").trim());
  return isNaN(v) ? 0 : v;
}

function parseDateFlexible(s) {
  // returns a Date or null
  const str = String(s ?? "").trim();
  if (!str || str.toLowerCase() === "manual") return null;

  // try ISO first
  const iso = new Date(str);
  if (!isNaN(iso.getTime())) return iso;

  // try DD/MM/YY or DD/MM/YYYY
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  let dd = Number(m[1]);
  let mm = Number(m[2]);
  let yy = Number(m[3]);
  if (yy < 100) yy = 2000 + yy;
  const d = new Date(yy, mm - 1, dd);
  if (isNaN(d.getTime())) return null;
  return d;
}

function normalizeRow(r) {
  const out = { ...r };
  out.FinalAmount = toNumber(out.FinalAmount);
  out.OriginalAmount = toNumber(out.OriginalAmount);
  out.AccountType = String(out.AccountType ?? "").trim().toLowerCase();
  out.Category = String(out.Category ?? "other").trim();
  out.Merchant = String(out.Merchant ?? "").trim();
  out.Date = String(out.Date ?? "").trim();
  out._dateObj = parseDateFlexible(out.Date);
  return out;
}

function validateRows(rows) {
  const cols = Object.keys(rows[0] || {});
  const missing = REQUIRED.filter(c => !cols.includes(c));
  return missing;
}

function formatILS(n) {
  // simple formatting, no locale assumptions
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}${abs.toFixed(2)} ILS`;
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function buildCategorySummary(rows) {
  const totals = new Map();
  const counts = new Map();

  rows.forEach(r => {
    const cat = r.Category || "other";
    totals.set(cat, (totals.get(cat) || 0) + (r.FinalAmount || 0));
    counts.set(cat, (counts.get(cat) || 0) + 1);
  });

  return Array.from(totals.entries())
    .map(([Category, TotalFinalAmount]) => ({
      Category,
      TotalFinalAmount,
      Transactions: counts.get(Category) || 0
    }))
    .sort((a, b) => b.TotalFinalAmount - a.TotalFinalAmount);
}

function renderTable(container, rows, columns) {
  if (!rows.length) {
    container.innerHTML = "<div class='muted' style='padding:10px;'>No rows.</div>";
    return;
  }

  const cols = columns || Object.keys(rows[0]);
  const thead = `<thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${
    rows.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")
  }</tbody>`;

  container.innerHTML = `<table>${thead}${tbody}</table>`;
}

function computeLargestExpense(rows) {
  const rentRegex = /rent|שכר דירה/i;

  const candidates = rows.filter(r => {
    const isRent = rentRegex.test(String(r.Merchant || ""));
    return !isRent;
  });

  if (!candidates.length) return null;

  let best = candidates[0];
  for (const r of candidates) {
    if ((r.FinalAmount || 0) > (best.FinalAmount || 0)) best = r;
  }

  return best;
}

function getWorkingRows(rows) {
  if (currentView === "jointOriginal") {
    return rows
      .filter(r => r.AccountType === "joint")
      .map(r => ({
        ...r,
        FinalAmount: toNumber(r.OriginalAmount)
      }));
  }

  return rows;
}

function applyFilters() {
  const acc = accountFilter.value;
  const cat = categoryFilter.value;

  const from = dateFrom.value ? new Date(dateFrom.value + "T00:00:00") : null;
  const to = dateTo.value ? new Date(dateTo.value + "T23:59:59") : null;

  const baseRows = getWorkingRows(allRows);

  filteredRows = baseRows.filter(r => {
    if (currentView === "jointOriginal") {
      if (r.AccountType !== "joint") return false;
    } else {
      if (acc !== "all" && r.AccountType !== acc) return false;
    }

    if (cat !== "all" && (r.Category || "") !== cat) return false;

    if (from || to) {
      if (!r._dateObj) return false;
      if (from && r._dateObj < from) return false;
      if (to && r._dateObj > to) return false;
    }

    return true;
  });

  renderDashboard();
}

function renderCharts(summary) {
  const labels = summary.map(x => x.Category);
  const values = summary.map(x => x.TotalFinalAmount);

  Plotly.newPlot("pie", [{
    type: "pie",
    labels,
    values,
    textinfo: "label+percent",
    hovertemplate: "%{label}<br>%{value:.2f} ILS<extra></extra>",
  }], { margin: { t: 10, l: 10, r: 10, b: 10 } }, { responsive: true });

  Plotly.newPlot("bar", [{
    type: "bar",
    x: labels,
    y: values,
    hovertemplate: "%{x}<br>%{y:.2f} ILS<extra></extra>",
  }], {
    margin: { t: 10, l: 40, r: 10, b: 80 },
    xaxis: { tickangle: -45 }
  }, { responsive: true });
}

function renderAccountBar(rows) {
  const personal = rows
    .filter(r => r.AccountType === "personal")
    .reduce((s, r) => s + (r.FinalAmount || 0), 0);

  const joint = rows
    .filter(r => r.AccountType === "joint")
    .reduce((s, r) => s + (r.FinalAmount || 0), 0);

  Plotly.newPlot("accountBar", [{
    type: "bar",
    x: ["personal", "joint"],
    y: [personal, joint],
    hovertemplate: "%{x}<br>%{y:.2f} ILS<extra></extra>",
  }], { margin: { t: 10, l: 40, r: 10, b: 40 } }, { responsive: true });
}

function renderDashboard() {
  if (!filteredRows.length) {
    mainEl.style.display = "none";
    errEl.textContent = "No rows match your filters.";
    return;
  }

  errEl.textContent = "";
  mainEl.style.display = "block";

  // KPIs
  const total = filteredRows.reduce((s, r) => s + (r.FinalAmount || 0), 0);
  const largest = computeLargestExpense(filteredRows);

  kpiTotalLabel.textContent =
  currentView === "jointOriginal"
    ? "Total joint spending (OriginalAmount)"
    : "Total spending (FinalAmount)";
  kpiTotal.textContent = formatILS(total);
  kpiLargest.textContent = largest ? `${formatILS(largest.FinalAmount)} (${largest.Merchant || "unknown"})` : "-";
  kpiCount.textContent = String(filteredRows.length);
  kpisEl.style.display = "flex";

  // Category summary
  const summary = buildCategorySummary(filteredRows);
  const summaryDisplay = summary.map(x => ({
    Category: x.Category,
    TotalSpending: x.TotalFinalAmount.toFixed(2),
    Transactions: x.Transactions
  }));
  renderTable(summaryTableWrap, summaryDisplay, ["Category", "TotalSpending", "Transactions"]);

  // Charts
  renderCharts(summary);
  renderAccountBar(filteredRows);

  // Category explorer
  const cats = uniqueSorted(filteredRows.map(r => r.Category || "other"));
  categorySelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
  const selected = categorySelect.value || cats[0];
  renderCategoryExplorer(selected);

  categorySelect.onchange = () => renderCategoryExplorer(categorySelect.value);

  // Transactions table (sorted desc)
  const tx = [...filteredRows].sort((a, b) => (b.FinalAmount || 0) - (a.FinalAmount || 0));
  const txDisplay = tx.map(r => ({
    Date: r.Date,
    Merchant: r.Merchant,
    Category: r.Category,
    AccountType: r.AccountType,
    FinalAmount: r.FinalAmount.toFixed(2)
  }));
  renderTable(txTableWrap, txDisplay, ["Date", "Merchant", "Category", "AccountType", "FinalAmount"]);

  // Exports
  exportCsvBtn.onclick = () => exportCsv(filteredRows, "filtered_transactions.csv");
  exportXlsxBtn.onclick = () => exportXlsx(filteredRows, summaryDisplay, "expense_dashboard.xlsx");
}

function renderCategoryExplorer(category) {
  const rows = filteredRows
    .filter(r => (r.Category || "") === category)
    .sort((a, b) => (b.FinalAmount || 0) - (a.FinalAmount || 0));

  const display = rows.map(r => ({
    Date: r.Date,
    Merchant: r.Merchant,
    AccountType: r.AccountType,
    Currency: r.Currency,
    OriginalAmount: (r.OriginalAmount ?? 0).toFixed(2),
    FinalAmount: (r.FinalAmount ?? 0).toFixed(2)
  }));

  renderTable(categoryTxWrap, display, ["Date", "Merchant", "AccountType", "Currency", "OriginalAmount", "FinalAmount"]);
}

function exportCsv(rows, filename) {
  // Remove helper fields
  const cleaned = rows.map(r => {
    const { _dateObj, ...rest } = r;
    return rest;
  });

  const csv = Papa.unparse(cleaned);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportXlsx(rows, summary, filename) {
  const wb = XLSX.utils.book_new();

  const cleaned = rows.map(r => {
    const { _dateObj, ...rest } = r;
    return rest;
  });

  const ws1 = XLSX.utils.json_to_sheet(cleaned);
  XLSX.utils.book_append_sheet(wb, ws1, "Transactions");

  const ws2 = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, ws2, "CategorySummary");

  XLSX.writeFile(wb, filename);
}

function populateCategoryFilter(rows) {
  const cats = uniqueSorted(rows.map(r => r.Category || "other"));
  categoryFilter.innerHTML =
    `<option value="all">All categories</option>` +
    cats.map(c => `<option value="${c}">${c}</option>`).join("");
}

function wireFilters() {
  accountFilter.onchange = applyFilters;
  categoryFilter.onchange = applyFilters;
  dateFrom.onchange = applyFilters;
  dateTo.onchange = applyFilters;

  clearFiltersBtn.onclick = () => {
    accountFilter.value = "all";
    categoryFilter.value = "all";
    dateFrom.value = "";
    dateTo.value = "";
    applyFilters();
  };
    mainViewBtn.onclick = () => {
    currentView = "main";
    applyFilters();
  };

  jointOriginalViewBtn.onclick = () => {
    currentView = "jointOriginal";
    accountFilter.value = "all";
    applyFilters();
  };
}

fileInput.addEventListener("change", async (e) => {
  resetUI();
  const file = (e.target.files || [])[0];
  if (!file) return;

  statusEl.textContent = "Parsing CSV...";
  try {
    const rows = await parseCsvFile(file);
    if (!rows.length) {
      errEl.textContent = "CSV is empty.";
      statusEl.textContent = "";
      return;
    }

    const missing = validateRows(rows);
    if (missing.length) {
      errEl.textContent = `Missing required columns: ${missing.join(", ")}.`;
      statusEl.textContent = "";
      return;
    }

    allRows = rows.map(normalizeRow);

    populateCategoryFilter(allRows);
    wireFilters();

    filtersCard.style.display = "block";
    viewTabsCard.style.display = "block";
    statusEl.innerHTML = "<span class='ok'>Loaded.</span>";

    applyFilters();

  } catch (err) {
    errEl.textContent = "Failed to parse CSV. Make sure it is a valid CSV exported from the agent.";
    statusEl.textContent = "";
  }
});
