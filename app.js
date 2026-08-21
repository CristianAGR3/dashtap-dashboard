const state = { rows: [], sectionRows: [], filtered: [], filters: {}, view: "MOVIMIENTOS" };
let deferredInstallPrompt = null;
const viewConfig = {
  MOVIMIENTOS: {
    title: "Movimientos",
    columns: ["FECHA", "RAZON", "CODIGO", "DESCRIPCION", "PIEZAS", "MOTIVO", "CHOFER", "PLACAS"],
    firstChart: "MOTIVO", secondChart: "RAZON",
    firstChartTitle: "Motivo del movimiento", secondChartTitle: "Tipo de movimiento",
  },
  REGISTRO: {
    title: "Chofer y registro",
    columns: ["FECHA", "CODIGO", "DESCRIPCION", "PIEZAS", "KILOMETRAJE", "CHOFER", "PLACAS", "REGRESO", "TAPAS"],
    firstChart: "CHOFER", secondChart: "REGRESO",
    firstChartTitle: "Piezas por chofer", secondChartTitle: "Estado de regreso",
  },
};
const labels = { CODIGO: "CÓDIGO", DESCRIPCION: "DESCRIPCIÓN", PIEZAS: "PIEZAS", MOTIVO: "MOTIVO", FECHA: "FECHA", CHOFER: "CHOFER", PLACAS: "PLACAS", RAZON: "RAZÓN", KILOMETRAJE: "KILOMETRAJE", REGRESO: "REGRESO", TAPAS: "TAPAS" };
const $ = (selector) => document.querySelector(selector);

function norm(value) { return String(value ?? "").trim().toUpperCase(); }
function number(value) { return Number(value) || 0; }
function sum(rows) { return rows.reduce((total, row) => total + number(row.PIEZAS), 0); }
function formatNumber(value) { return new Intl.NumberFormat("es-MX").format(value); }
function formatDate(value) { return value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`)) : "—"; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
function grouped(rows, key, byPieces = false) { return rows.reduce((acc, row) => { const label = row[key] || "Sin dato"; acc[label] = (acc[label] || 0) + (byPieces ? number(row.PIEZAS) : 1); return acc; }, {}); }

function renderBars(target, data) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  $(target).innerHTML = entries.length ? entries.map(([label, value]) => `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${value / max * 100}%"></div></div><b>${formatNumber(value)}</b></div>`).join("") : "<span class='footnote'>Sin datos</span>";
}

function populateSelects() {
  ["RAZON", "MOTIVO", "CHOFER"].forEach(key => {
    const select = $(`[name="${key}"]`); const current = select.value;
    const values = [...new Set(state.sectionRows.map(row => row[key]).filter(Boolean))].sort();
    select.innerHTML = `<option value="">${key === "RAZON" ? "Todas" : "Todos"}</option>` + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    select.value = values.includes(current) ? current : "";
  });
}

function updateViewUi() {
  const drivers = state.view === "REGISTRO";
  $("#movementsViewButton").classList.toggle("is-active", !drivers);
  $("#movementsViewButton").setAttribute("aria-pressed", String(!drivers));
  $("#driversViewButton").classList.toggle("is-active", drivers);
  $("#driversViewButton").setAttribute("aria-pressed", String(drivers));
  $("#recordsTitle").textContent = viewConfig[state.view].title;
  $("#movementMetricLabel").textContent = drivers ? "🚚 Registros de chofer" : "🗺 Movimientos";
  $("#movementMetricHelp").textContent = drivers ? "entregas registradas" : "registros activos";
  $("#entryMetricLabel").textContent = drivers ? "✅ Regresos OK" : "🛖 Entradas";
  $("#entryMetricHelp").textContent = drivers ? "registros sin incidencia" : "ingresos al sistema";
  $("#exitMetricLabel").textContent = drivers ? "🧰 Choferes" : "🚚 Salidas";
  $("#exitMetricHelp").textContent = drivers ? "conductores registrados" : "despachos activos";
  $("#statusChartTitle").textContent = viewConfig[state.view].firstChartTitle;
  $("#reasonChartTitle").textContent = viewConfig[state.view].secondChartTitle;
  document.querySelector('[name="RAZON"]').closest("label").hidden = drivers;
  document.querySelector('[name="MOTIVO"]').closest("label").hidden = drivers;
}

function setView(view) {
  state.view = view;
  state.filters = {};
  $("#advancedForm").reset();
  $("#quickSearch").value = "";
  state.sectionRows = state.rows.filter(row => norm(row.ORIGEN) === view);
  const url = new URL(window.location.href); url.searchParams.set("view", view); history.replaceState(null, "", url);
  updateViewUi(); populateSelects(); applyFilters();
}

function applyFilters() {
  const quick = norm($("#quickSearch").value);
  const { text = "", from = "", to = "", RAZON = "", MOTIVO = "", CHOFER = "" } = state.filters;
  state.filtered = state.sectionRows.filter(row => {
    const allText = Object.values(row).join(" ");
    return (!quick || norm(allText).includes(quick)) && (!text || norm(allText).includes(norm(text))) &&
      (!RAZON || row.RAZON === RAZON) && (!MOTIVO || row.MOTIVO === MOTIVO) && (!CHOFER || row.CHOFER === CHOFER) &&
      (!from || row.FECHA >= from) && (!to || row.FECHA <= to);
  });
  render();
}

function render() {
  const rows = state.filtered; const drivers = state.view === "REGISTRO"; const config = viewConfig[state.view];
  $("#movementCount").textContent = formatNumber(rows.length);
  $("#pieceCount").textContent = formatNumber(sum(rows));
  $("#entryCount").textContent = formatNumber(drivers ? rows.filter(row => norm(row.REGRESO) === "OK").length : rows.filter(row => norm(row.RAZON) === "ENTRADA").length);
  $("#exitCount").textContent = formatNumber(drivers ? new Set(rows.map(row => row.CHOFER).filter(Boolean)).size : rows.filter(row => norm(row.RAZON) === "SALIDA").length);
  $("#statusTotal").textContent = `${formatNumber(rows.length)} registros`;
  renderBars("#statusBars", grouped(rows, config.firstChart, drivers));
  renderBars("#reasonBars", grouped(rows, config.secondChart, drivers));
  $("#tableHead").innerHTML = `<tr>${config.columns.map(column => `<th>${labels[column]}</th>`).join("")}</tr>`;
  $("#tableBody").innerHTML = rows.map(row => `<tr>${config.columns.map(column => `<td>${column === "FECHA" ? formatDate(row[column]) : escapeHtml(row[column] || "—")}</td>`).join("")}</tr>`).join("");
  $("#recordDescription").textContent = `${formatNumber(rows.length)} de ${formatNumber(state.sectionRows.length)} registros mostrados`;
  $("#emptyMessage").hidden = rows.length !== 0;
}

async function loadData() {
  const button = $("#refreshButton"); button.disabled = true; button.textContent = "Actualizando…";
  try {
    const staticSite = location.hostname.endsWith(".github.io");
    let response = staticSite ? await fetch(`movimientos.json?at=${Date.now()}`, { cache: "no-store" }) : await fetch(`/api/movimientos.json?at=${Date.now()}`, { cache: "no-store" });
    let contentType = response.headers.get("content-type") || "";
    if ((!response.ok || !contentType.includes("application/json")) && !staticSite) { response = await fetch(`movimientos.json?at=${Date.now()}`, { cache: "no-store" }); contentType = response.headers.get("content-type") || ""; }
    if (!response.ok) throw new Error("No se encontraron datos publicados.");
    if (!contentType.includes("application/json")) throw new Error("El servidor no entregó datos JSON.");
    const data = await response.json(); state.rows = Array.isArray(data.movimientos) ? data.movimientos : [];
    const hasMovements = state.rows.some(row => norm(row.ORIGEN) === "MOVIMIENTOS");
    const hasDrivers = state.rows.some(row => norm(row.ORIGEN) === "REGISTRO");
    const requestedView = norm(new URLSearchParams(location.search).get("view"));
    const initialView = ["MOVIMIENTOS", "REGISTRO"].includes(requestedView) ? requestedView : (!hasMovements && hasDrivers ? "REGISTRO" : state.view);
    setView(initialView);
    const updated = data.actualizado ? new Date(data.actualizado) : null; const validUpdated = updated && !Number.isNaN(updated.getTime());
    $("#lastUpdated").textContent = validUpdated ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(updated) : "Fecha no disponible";
    if (validUpdated) $("#lastUpdated").dateTime = updated.toISOString();
  } catch (error) { $("#recordDescription").textContent = `No fue posible cargar los datos: ${error.message}`; $("#lastUpdated").textContent = "Sin conexión con los datos"; }
  finally { button.disabled = false; button.textContent = "↻ Actualizar datos"; }
}

$("#movementsViewButton").addEventListener("click", () => setView("MOVIMIENTOS"));
$("#driversViewButton").addEventListener("click", () => setView("REGISTRO"));
$("#quickSearch").addEventListener("input", applyFilters); $("#refreshButton").addEventListener("click", loadData);
function setTheme(theme) { document.body.dataset.theme = theme; $("#themeButton").setAttribute("aria-label", theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"); localStorage.setItem("tapas-theme", theme); }
setTheme(localStorage.getItem("tapas-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("#themeButton").addEventListener("click", () => setTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));
$("#advancedButton").addEventListener("click", () => $("#advancedDialog").showModal());
$("#advancedForm").addEventListener("submit", event => { if (event.submitter?.value === "apply") { state.filters = Object.fromEntries(new FormData(event.currentTarget)); applyFilters(); } });
$("#clearFilters").addEventListener("click", () => { $("#advancedForm").reset(); state.filters = {}; applyFilters(); });

$("#installButton").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("#installButton").hidden = true;
});
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault(); deferredInstallPrompt = event; $("#installButton").hidden = false;
});
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; $("#installButton").hidden = true; });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) $("#installButton").hidden = true;
loadData();
