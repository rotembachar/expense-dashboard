const fileInput = document.getElementById("fileInput");
const statusEl = document.getElementById("status");
const errEl = document.getElementById("err");

const tabsEl = document.getElementById("tabs");
const mainEl = document.getElementById("main");

const mappingEl = document.getElementById("mapping");
const mappingRowsEl = document.getElementById("mappingRows");
const applyMappingBtn = document.getElementById("applyMappingBtn");

const summaryTableWrap = document.getElementById("summaryTableWrap");
const txTableWrap = document.getElementById("txTableWrap");
const categorySelect = document.getElementById("categorySelect");
const summaryNote = document.getElementById("summaryNote");

const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportXlsxBtn = document.getElementById("exportXlsxBtn");

let rawFiles = [];
let tables = { A: null, C: null, D: null };
let activeTab = "A";

const REQUIRED = ["Date", "Merchant", "Category", "FinalAmount"];

function resetUI() {
  errEl.textContent = "";
  statusEl.textContent = "";
  tabsEl.style.display = "none";
  mainEl.style.display = "none";
  mappingEl.style.display = "none";
  mappingRowsEl.innerHTML = "";
  tables = { A: null, C: null, D: null };
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve({ file, rows: res.data }),
      error: (err) => reject(err),
    });
  });
}

function normalizeRow(row) {
  // Ensure numeric FinalAmount
  const out = { ...row };
  const fa = Number(String(out.FinalAmount ?? "").replace(/,/g, ""));
  out.FinalAmount = isNaN(fa) ? 0 : fa;
  return out;
}

function validateRows(rows) {
  const cols = Object.keys(rows[0] || {});
  const missing = REQUIRED.filter(c => !cols.includes(c));
  return missing;
}

function guessTableKey(filename) {
  const f = filename.toLowerCase();
  if (f.includes("table a") || f.includes("table_a") || f.includes("a.csv")) return "A";
  if (f.includes("table c") || f.includes("table_c") || f.includes("c.csv")) return "C";
  if (f.includes("table d") || f.includes("table_d") || f.includes("d.csv")) return "D";
  return null;
}

function renderMapping(filesParsed) {
  mappingRowsEl.innerHTML = "";
  filesParsed.forEach(({ file }) => {
    const row = document.createElement("div");
    row.className = "controls";
    row.style.margin = "6px 0";

    const label = document.createElement("div");
    label.textContent = file.name;

    const select = document.createElement("select");
    select.dataset.filename = file.name;

    ["", "A", "C", "D"].forEach(v => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v ? `Table ${v}` : "Select table…";
      select.appendChild(opt);
    });

    const guessed = guessTableKey(file.name);
    if (guessed) select.value = guessed;

    row.appendChild(label);
    row.appendChild(select);
    mappingRowsEl.appendChild(row);
  });

  mappingEl.style.display = "block";

  applyMappingBtn.onclick = () => {
    const selects = mappingRowsEl.querySelectorAll("select");
    const map = {};
    selects.forEach(s => map[s.dataset.filename] = s.value);

    // Build tables from mapping
    const used = new Set();
    for (const fn in map) {
      const key = map[fn];
      if (!key) continue;
      if (used.has(key)) {
        errEl.textContent = `You assigned multiple files to Table ${key}. Please choose one file per table.`;
        return;
      }
      used.add(key);
    }

    // Apply
    tables = { A: null, C: null, D: null };
    filesParsed.forEach(fp => {
      const key = map[fp.file.name];
      if (!key) return;
      const rows = fp.rows.map(normalizeRow);
      tables[key] = rows;
    });

    // Require at least one
    if (!tables.A && !tables.C && !tables.D) {
      errEl.textContent = "Please assign at least one file to A, C, or D.";
      return;
    }

    startDashboard();
  };
}

function buildCategorySummary(rows) {
  const totals = new Map();
  rows.forEach(r => {
    const cat = (r.Category || "other").trim();
    const v = Number(r.FinalAmount) || 0;
    totals.set(cat, (totals.get(cat) || 0) + v);
  });

  const summary = Array.from(totals.entries())
    .map(([Category, TotalFinalAmount]) => ({ Category, TotalFinalAmount }))
    .sort((a, b) => b.TotalFinalAmount - a.TotalFinalAmount);

  return summary;
}

function renderTable(container, rows) {
  if (!rows.length) {
    container.innerHTML = "<div class='muted'>No rows.</div>";
    return;
  }
  const cols = Object.keys(rows[0]);
  const thead = `<thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${
    rows.map(r => `<tr>${cols.map(c => `<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")
  }</tbody>`;

  container.innerHTML = `<table>${thead}${tbody}</table>`;
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

function getActiveRows() {
  return tables[activeTab] || [];
}

function renderActiveTab() {
  const rows = getActiveRows();
  if (!rows.length) {
    errEl.textContent = `No data loaded for Table ${activeTab}.`;
    mainEl.style.display = "none";
    return;
  }

  // Validate columns
  const missing = validateRows(rows);
  if (missing.length) {
    errEl.textContent = `Table ${activeTab} is missing columns: ${missing.join(", ")}.`;
    mainEl.style.display = "none";
    return;
  }

  errEl.textContent = "";
  mainEl.style.display = "block";

  const summary = buildCategorySummary(rows);
  summaryNote.textContent = `Based on FinalAmount (Table ${activeTab}).`;

  // Summary table
  renderTable(summaryTableWrap, summary);

  // Charts
  renderCharts(summary);

  // Category selector
  const cats = summary.map(x => x.Category);
  categorySelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
  const selected = categorySelect.value || cats[0];

  renderCategoryTransactions(rows, selected);

  categorySelect.onchange = () => {
    renderCategoryTransactions(rows, categorySelect.value);
  };

  // Exports for active tab
  exportCsvBtn.onclick = () => exportCsv(rows, `Table_${activeTab}.csv`);
  exportXlsxBtn.onclick = () => exportXlsx(rows, summary, `Table_${activeTab}.xlsx`);
}

function renderCategoryTransactions(rows, category) {
  const filtered = rows
    .filter(r => (r.Category || "").trim() === category)
    .sort((a, b) => (Number(b.FinalAmount) || 0) - (Number(a.FinalAmount) || 0));

  renderTable(txTableWrap, filtered);
}

function exportCsv(rows, filename) {
  const csv = Papa.unparse(rows);
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

  const ws1 = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws1, "Transactions");

  const ws2 = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, ws2, "CategorySummary");

  XLSX.writeFile(wb, filename);
}

function startDashboard() {
  mappingEl.style.display = "none";

  tabsEl.style.display = "flex";
  document.getElementById("main").style.display = "block";

  // Wire tabs
  tabsEl.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = () => {
      tabsEl.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeTab = tab.dataset.tab;
      renderActiveTab();
    };
  });

  // If A exists, default to A, else first available
  if (!tables.A && tables.C) activeTab = "C";
  if (!tables.A && !tables.C && tables.D) activeTab = "D";

  // Set active class
  tabsEl.querySelectorAll(".tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === activeTab);
  });

  renderActiveTab();
  statusEl.innerHTML = "<span class='ok'>Loaded.</span>";
}

fileInput.addEventListener("change", async (e) => {
  resetUI();
  const files = Array.from(e.target.files || []);
  rawFiles = files;

  if (!files.length) return;

  statusEl.textContent = "Parsing CSV files...";
  try {
    const parsed = await Promise.all(files.map(parseCsvFile));

    // Normalize and quick validate
    const withRows = parsed.map(p => ({ ...p, rows: p.rows.map(normalizeRow) }));

    // If exactly 3 files and names guessable, auto assign
    const auto = { A: null, C: null, D: null };
    withRows.forEach(p => {
      const k = guessTableKey(p.file.name);
      if (k && !auto[k]) auto[k] = p.rows;
    });

    const autoCount = ["A","C","D"].filter(k => auto[k]).length;
    if (autoCount >= 1 && withRows.length <= 3) {
      tables = auto;
      startDashboard();
      return;
    }

    // Otherwise show mapping UI
    statusEl.innerHTML = "<span class='muted'>Please assign files to A/C/D.</span>";
    renderMapping(withRows);

  } catch (err) {
    errEl.textContent = "Failed to parse CSV. Make sure the file is a valid CSV exported from the agent.";
    statusEl.textContent = "";
  }
});
