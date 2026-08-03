const state = { rows: [], filtered: [], filters: {} };
const columns = ["FECHA", "RAZON", "TAPA", "PZ", "TAMAÑO", "ESTATUS", "NOMBRE", "CHOFER", "PLACA", "REGRESO", "TAPAS"];
const $ = (selector) => document.querySelector(selector);

function norm(value) { return String(value ?? "").trim().toUpperCase(); }
function number(value) { return Number(value) || 0; }
function sum(rows) { return rows.reduce((total, row) => total + number(row.PZ), 0); }
function formatNumber(value) { return new Intl.NumberFormat("es-MX").format(value); }
function formatDate(value) { return value ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`)) : "—"; }

function grouped(rows, key, byPieces = false) {
  return rows.reduce((acc, row) => { const label = row[key] || "Sin dato"; acc[label] = (acc[label] || 0) + (byPieces ? number(row.PZ) : 1); return acc; }, {});
}
function renderBars(target, data) {
  const entries = Object.entries(data).sort((a,b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  $(target).innerHTML = entries.length ? entries.map(([label, value]) => `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${value / max * 100}%"></div></div><b>${formatNumber(value)}</b></div>`).join("") : "<span class='footnote'>Sin datos</span>";
}
function populateSelects() {
  ["RAZON", "ESTATUS", "TAMAÑO"].forEach((key) => {
    const select = $(`[name="${key}"]`);
    const current = select.value;
    const values = [...new Set(state.rows.map(row => row[key]).filter(Boolean))].sort();
    select.innerHTML = `<option value="">${key === "RAZON" ? "Todas" : "Todos"}</option>` + values.map(value => `<option value="${value}">${value}</option>`).join("");
    select.value = current;
  });
}
function applyFilters() {
  const quick = norm($("#quickSearch").value);
  const { text = "", from = "", to = "", RAZON = "", ESTATUS = "", TAMAÑO = "" } = state.filters;
  state.filtered = state.rows.filter((row) => {
    const allText = Object.values(row).join(" ");
    return (!quick || norm(allText).includes(quick)) && (!text || norm(allText).includes(norm(text))) &&
      (!RAZON || row.RAZON === RAZON) && (!ESTATUS || row.ESTATUS === ESTATUS) && (!TAMAÑO || row.TAMAÑO === TAMAÑO) &&
      (!from || row.FECHA >= from) && (!to || row.FECHA <= to);
  });
  render();
}
function render() {
  const rows = state.filtered;
  $("#movementCount").textContent = formatNumber(rows.length);
  $("#pieceCount").textContent = formatNumber(sum(rows));
  $("#entryCount").textContent = formatNumber(rows.filter(row => norm(row.RAZON) === "ENTRADA").length);
  $("#exitCount").textContent = formatNumber(rows.filter(row => norm(row.RAZON) === "SALIDA").length);
  $("#statusTotal").textContent = `${formatNumber(rows.length)} registros`;
  renderBars("#statusBars", grouped(rows, "ESTATUS"));
  renderBars("#reasonBars", grouped(rows, "RAZON", true));
  $("#tableHead").innerHTML = `<tr>${columns.map(column => `<th>${column}</th>`).join("")}</tr>`;
  $("#tableBody").innerHTML = rows.map(row => `<tr>${columns.map(column => `<td>${column === "FECHA" ? formatDate(row[column]) : (row[column] || "—")}</td>`).join("")}</tr>`).join("");
  $("#recordDescription").textContent = `${formatNumber(rows.length)} de ${formatNumber(state.rows.length)} registros mostrados`;
  $("#emptyMessage").hidden = rows.length !== 0;
}
async function loadData() {
  const button = $("#refreshButton"); button.disabled = true; button.textContent = "Actualizando…";
  try {
    const staticSite = location.hostname.endsWith(".github.io");
    let response = staticSite
      ? await fetch(`movimientos.json?at=${Date.now()}`, { cache: "no-store" })
      : await fetch(`/api/movimientos.json?at=${Date.now()}`, { cache: "no-store" });
    let contentType = response.headers.get("content-type") || "";
    if ((!response.ok || !contentType.includes("application/json")) && !staticSite) {
      // Los hosts estaticos pueden responder con index.html para rutas de API inexistentes.
      response = await fetch(`movimientos.json?at=${Date.now()}`, { cache: "no-store" });
      contentType = response.headers.get("content-type") || "";
    }
    if (!response.ok) throw new Error("No se encontraron datos publicados.");
    if (!contentType.includes("application/json")) throw new Error("El servidor no entrego el archivo de datos JSON.");
    const data = await response.json();
    state.rows = Array.isArray(data.movimientos) ? data.movimientos : [];
    populateSelects(); applyFilters();
    const updated = data.actualizado ? new Date(data.actualizado) : null;
    const validUpdated = updated && !Number.isNaN(updated.getTime());
    $("#lastUpdated").textContent = validUpdated
      ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(updated)
      : "Fecha no disponible";
    if (validUpdated) $("#lastUpdated").dateTime = updated.toISOString();
  } catch (error) {
    $("#recordDescription").textContent = `No fue posible cargar los datos: ${error.message}`;
    $("#lastUpdated").textContent = "Sin conexión con los datos";
  } finally { button.disabled = false; button.textContent = "↻ Actualizar datos"; }
}
$("#quickSearch").addEventListener("input", applyFilters);
$("#refreshButton").addEventListener("click", loadData);
function setTheme(theme) {
  document.body.dataset.theme = theme;
  $("#themeButton").setAttribute("aria-label", theme === "dark" ? "Activar modo claro" : "Activar modo oscuro");
  localStorage.setItem("tapas-theme", theme);
}
setTheme(localStorage.getItem("tapas-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
$("#themeButton").addEventListener("click", () => setTheme(document.body.dataset.theme === "dark" ? "light" : "dark"));
$("#advancedButton").addEventListener("click", () => $("#advancedDialog").showModal());
$("#advancedForm").addEventListener("submit", (event) => { if (event.submitter?.value === "apply") { const form = new FormData(event.currentTarget); state.filters = Object.fromEntries(form); applyFilters(); } });
$("#clearFilters").addEventListener("click", () => { $("#advancedForm").reset(); state.filters = {}; applyFilters(); });
loadData();
