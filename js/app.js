const resolveApi = (path) => new URL(path, window.location.href).href;
const API_ORDERS = resolveApi("php/order_crud.php");
const API_DASHBOARD = resolveApi("php/dashboard_stats.php");
const API_PROFIT = resolveApi("php/profit_calc.php");

const statusClass = (status) => {
  if (status === "Delivered") return "status-delivered";
  if (status === "Cancelled") return "status-cancelled";
  return "status-pending";
};

const currency = (value) => `Tk ${Number(value).toFixed(2)}`;
const dashboardChartState = { orders: [] };

document.addEventListener("DOMContentLoaded", () => {
  initAppShell();
  const page = document.body.dataset.page;
  if (page === "dashboard") initDashboard();
  if (page === "create-order") initCreateOrder();
  if (page === "orders") initOrders();
  if (page === "edit-order") initEditOrder();
  if (page === "profit") initProfit();
  if (page === "history") initHistory();
  if (page === "login") initLoginValidation();
});

function initAppShell() {
  const toggle = document.getElementById("neoNavToggle");
  const closeBtn = document.getElementById("neoNavClose");
  const backdrop = document.getElementById("neoNavBackdrop");
  const sidebar = document.getElementById("neoSidebar");
  if (!toggle || !backdrop || !sidebar) return;

  const setOpen = (open) => {
    document.body.classList.toggle("neo-nav-open", open);
    document.body.style.overflow = open ? "hidden" : "";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  toggle.addEventListener("click", () => setOpen(true));
  closeBtn?.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));
  sidebar.querySelectorAll("a.sidebar-link").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      document.body.classList.remove("neo-nav-open");
      document.body.style.overflow = "";
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function initLoginValidation() {
  const form = document.getElementById("loginForm");
  const msg = document.getElementById("loginClientMsg");
  form?.addEventListener("submit", (e) => {
    const username = form.username.value.trim();
    const password = form.password.value.trim();
    if (!username || !password) {
      e.preventDefault();
      msg.textContent = "Username and password are required.";
    }
  });
}

async function initDashboard() {
  const [statsRes, ordersRes] = await Promise.all([fetch(API_DASHBOARD), fetch(API_ORDERS)]);
  const data = await statsRes.json();
  const ordersRaw = await ordersRes.json();
  const orders = Array.isArray(ordersRaw) ? ordersRaw : [];
  document.getElementById("totalOrders").textContent = data.total_orders || 0;
  document.getElementById("pendingOrders").textContent = data.pending_orders || 0;
  document.getElementById("deliveredOrders").textContent = data.delivered_orders || 0;
  document.getElementById("cancelledOrders").textContent = data.cancelled_orders || 0;
  document.getElementById("totalProfit").textContent = currency(data.total_profit || 0);
  renderDashboardCharts(orders, data);
}

function buildCurvePath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    d += ` Q ${cx} ${prev.y}, ${curr.x} ${curr.y}`;
  }
  return d;
}

function buildAreaPath(points, baselineY) {
  if (!points.length) return "";
  const linePath = buildCurvePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}

function renderDashboardCharts(orders, stats) {
  const statusChart = document.getElementById("ordersStatusChart");
  const statusLegend = document.getElementById("ordersStatusLegend");
  const priceProfitChart = document.getElementById("priceProfitChart");
  const priceProfitRange = document.getElementById("priceProfitRange");
  const priceProfitMeta = document.getElementById("priceProfitMeta");
  if (!statusChart || !statusLegend || !priceProfitChart || !priceProfitRange || !priceProfitMeta) return;

  dashboardChartState.orders = orders;

  const statusItems = [
    { label: "Pending", value: Number(stats.pending_orders || 0), color: "#f59e0b" },
    { label: "Delivered", value: Number(stats.delivered_orders || 0), color: "#22c55e" },
    { label: "Cancelled", value: Number(stats.cancelled_orders || 0) || orders.filter((o) => o.status === "Cancelled").length, color: "#ef4444" },
    { label: "Total", value: Number(stats.total_orders || 0), color: "#0ea5e9" },
  ];
  drawSingleCurveChart(statusChart, statusItems, "Orders");
  const statusTotal = Math.max(Number(stats.total_orders || 0), 1);
  statusLegend.innerHTML = statusItems
    .map(
      (item) => `
      <span class="inline-flex items-center gap-1">
        <span class="w-2.5 h-2.5 rounded-full" style="background:${item.color}"></span>
        ${item.label}: ${item.value} (${Math.round((item.value / statusTotal) * 100)}%)
      </span>`
    )
    .join("");

  const renderPriceProfitChart = () => {
    const dataset = buildPriceProfitDataset(dashboardChartState.orders, priceProfitRange.value);
    drawDualCurveChart(priceProfitChart, dataset);
    priceProfitMeta.textContent = `${dataset.mode} | ${dataset.labels.length} points shown | ${dataset.orderCount} delivered orders`;
  };

  if (!priceProfitRange.dataset.bound) {
    priceProfitRange.addEventListener("change", renderPriceProfitChart);
    priceProfitRange.dataset.bound = "1";
  }
  renderPriceProfitChart();
}

function buildPriceProfitDataset(orders, rangeValue) {
  const delivered = orders
    .filter((o) => o.status === "Delivered")
    .sort((a, b) => {
      const dateA = new Date(a.delivery_date || a.created_at || 0).getTime();
      const dateB = new Date(b.delivery_date || b.created_at || 0).getTime();
      return dateA - dateB;
    });

  const limit = rangeValue === "all" ? delivered.length : Number(rangeValue || 30);
  const scoped = delivered.slice(-limit);
  if (scoped.length > 60) {
    const grouped = scoped.reduce((acc, o) => {
      const sourceDate = o.delivery_date || o.created_at || "";
      const d = new Date(sourceDate);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const key = Number.isNaN(y) ? "Unknown" : `${y}-${m}`;
      if (!acc[key]) acc[key] = { price: 0, profit: 0 };
      acc[key].price += Number(o.price || 0);
      acc[key].profit += Number(o.profit_amount || 0);
      return acc;
    }, {});
    const labels = Object.keys(grouped);
    return {
      labels,
      priceSeries: labels.map((k) => grouped[k].price),
      profitSeries: labels.map((k) => grouped[k].profit),
      mode: "Monthly totals (auto-grouped)",
      orderCount: scoped.length,
    };
  }

  return {
    labels: scoped.map((o) => `#${o.id}`),
    priceSeries: scoped.map((o) => Number(o.price || 0)),
    profitSeries: scoped.map((o) => Number(o.profit_amount || 0)),
    mode: "Per-order trend",
    orderCount: scoped.length,
  };
}

function drawSingleCurveChart(svgEl, pointsData, yLabel) {
  const width = 360;
  const height = 180;
  const left = 28;
  const right = 10;
  const top = 16;
  const bottom = 26;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const maxValue = Math.max(...pointsData.map((item) => item.value), 1);
  const stepX = pointsData.length > 1 ? innerW / (pointsData.length - 1) : innerW;
  const points = pointsData.map((item, index) => ({
    x: left + index * stepX,
    y: top + innerH - (item.value / maxValue) * innerH,
    ...item,
  }));
  const path = buildCurvePath(points);
  const area = buildAreaPath(points, height - bottom);
  svgEl.innerHTML = `
    <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#cbd5e1" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" stroke="#cbd5e1" />
    <path d="${area}" fill="rgba(14, 165, 233, 0.08)" />
    <path d="${path}" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round" />
    ${points
      .map(
        (point) => `
      <circle cx="${point.x}" cy="${point.y}" r="4" fill="${point.color}" />
      <text x="${point.x}" y="${height - 8}" text-anchor="middle" fill="#64748b" font-size="10">${point.label}</text>
      <text x="${point.x}" y="${point.y - 8}" text-anchor="middle" fill="#334155" font-size="10">${point.value}</text>
    `
      )
      .join("")}
    <text x="10" y="${top + 4}" fill="#94a3b8" font-size="10">${yLabel}</text>
  `;
}

function drawDualCurveChart(svgEl, dataset) {
  const { labels, priceSeries, profitSeries } = dataset;
  if (!priceSeries.length || !profitSeries.length) {
    svgEl.innerHTML = `<text x="180" y="92" text-anchor="middle" fill="#94a3b8" font-size="12">No delivered order data yet</text>`;
    return;
  }

  const width = 360;
  const height = 180;
  const left = 28;
  const right = 10;
  const top = 16;
  const bottom = 22;
  const innerW = width - left - right;
  const innerH = height - top - bottom;
  const maxValue = Math.max(...priceSeries, ...profitSeries, 1);
  const count = Math.max(priceSeries.length, profitSeries.length);
  const stepX = count > 1 ? innerW / (count - 1) : innerW;

  const mapSeries = (series) =>
    series.map((value, index) => ({
      x: left + index * stepX,
      y: top + innerH - (value / maxValue) * innerH,
      value,
      index: index + 1,
    }));

  const pricePoints = mapSeries(priceSeries);
  const profitPoints = mapSeries(profitSeries);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => top + innerH - innerH * r);
  const sampledLabels = labels.map((label, index) => {
    const showEvery = Math.ceil(labels.length / 6);
    return index % showEvery === 0 || index === labels.length - 1 ? label : "";
  });

  svgEl.innerHTML = `
    <defs>
      <linearGradient id="priceAreaGradient" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#0ea5e9" stop-opacity="0.25"></stop>
        <stop offset="100%" stop-color="#0ea5e9" stop-opacity="0"></stop>
      </linearGradient>
      <linearGradient id="profitAreaGradient" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#6366f1" stop-opacity="0.2"></stop>
        <stop offset="100%" stop-color="#6366f1" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${yTicks.map((y) => `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="3 3" />`).join("")}
    <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" stroke="#cbd5e1" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" stroke="#cbd5e1" />
    <path d="${buildAreaPath(pricePoints, height - bottom)}" fill="url(#priceAreaGradient)" />
    <path d="${buildAreaPath(profitPoints, height - bottom)}" fill="url(#profitAreaGradient)" />
    <path d="${buildCurvePath(pricePoints)}" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-linecap="round" />
    <path d="${buildCurvePath(profitPoints)}" fill="none" stroke="#6366f1" stroke-width="3" stroke-linecap="round" />
    ${pricePoints
      .map(
        (point) => `
      <circle cx="${point.x}" cy="${point.y}" r="3" fill="#0ea5e9">
        <title>${sampledLabels[point.index - 1] || `Point ${point.index}`}: ${currency(point.value)}</title>
      </circle>`
      )
      .join("")}
    ${profitPoints
      .map(
        (point) => `
      <circle cx="${point.x}" cy="${point.y}" r="3" fill="#6366f1">
        <title>${sampledLabels[point.index - 1] || `Point ${point.index}`}: ${currency(point.value)}</title>
      </circle>`
      )
      .join("")}
    ${sampledLabels
      .map((label, index) => {
        if (!label) return "";
        const x = left + index * stepX;
        return `<text x="${x}" y="${height - 6}" text-anchor="middle" fill="#94a3b8" font-size="9">${label}</text>`;
      })
      .join("")}
    <text x="10" y="${top + 4}" fill="#94a3b8" font-size="10">Value</text>
  `;
}

function initCreateOrder() {
  const form = document.getElementById("createOrderForm");
  const msg = document.getElementById("createOrderMsg");
  const orderDateInput = document.getElementById("orderDateInput");

  const setDefaultOrderDate = () => {
    if (orderDateInput && !orderDateInput.value) {
      orderDateInput.value = new Date().toISOString().slice(0, 10);
    }
  };
  setDefaultOrderDate();

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    msg.className = "mt-3 text-sm";
    const payload = Object.fromEntries(new FormData(form).entries());
    let res;
    try {
      res = await fetch(API_ORDERS, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
    } catch {
      msg.textContent =
        "Network error. Open this app through your web server (e.g. http://localhost/.../create-order.html), not as a file:// page.";
      msg.className = "mt-3 text-sm text-red-600 font-medium";
      return;
    }
    const raw = await res.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      msg.textContent =
        raw.slice(0, 280) || "Server did not return JSON. Check PHP errors and database connection.";
      msg.className = "mt-3 text-sm text-red-600 font-medium";
      return;
    }
    const success = data !== null && data.success === true;
    msg.textContent = success
      ? data.message || "Order saved successfully."
      : data?.message || `Save failed (${res.status}).`;
    msg.className = success ? "mt-3 text-sm text-green-600 font-medium" : "mt-3 text-sm text-red-600 font-medium";
    if (success) {
      form.reset();
      setDefaultOrderDate();
    }
  });
}

async function getOrders(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  const res = await fetch(`${API_ORDERS}?${query}`);
  return res.json();
}

async function initOrders() {
  let currentPage = 1;
  const rowsPerPage = 8;
  const tableBody = document.getElementById("ordersTableBody");
  const pager = document.getElementById("pager");
  const statusFilter = document.getElementById("statusFilter");
  const dateFilter = document.getElementById("dateFilter");
  const ordersCustomer = document.getElementById("ordersCustomer");
  const ordersProduct = document.getElementById("ordersProduct");

  const render = async () => {
    const all = await getOrders({
      status: statusFilter.value,
      date: dateFilter.value,
      customer: ordersCustomer?.value?.trim() || "",
      product: ordersProduct?.value?.trim() || "",
    });
    const totalPages = Math.max(1, Math.ceil(all.length / rowsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * rowsPerPage;
    const pageItems = all.slice(start, start + rowsPerPage);

    tableBody.innerHTML = pageItems
      .map(
        (o, idx) => `
      <tr class="border-b">
        <td class="px-3 py-2">${start + idx + 1}</td>
        <td class="px-3 py-2">${o.id}</td>
        <td class="px-3 py-2">${o.customer_name}</td>
        <td class="px-3 py-2">${o.product}</td>
        <td class="px-3 py-2">${o.quantity}</td>
        <td class="px-3 py-2">${currency(o.price)}</td>
        <td class="px-3 py-2">${currency(o.profit_amount || 0)}</td>
        <td class="px-3 py-2"><span class="status-pill ${statusClass(o.status)}">${o.status}</span></td>
        <td class="px-3 py-2">${o.delivery_date}</td>
        <td class="px-3 py-2">
          <div class="flex flex-wrap gap-1">
            <a class="table-action-btn bg-blue-100 text-blue-700" href="edit-order.html?id=${o.id}">Edit</a>
            ${
              o.status === "Pending"
                ? `<button type="button" class="table-action-btn bg-green-100 text-green-700" onclick="markDelivered(${o.id})">Deliver</button>`
                : ""
            }
            <button type="button" class="table-action-btn bg-slate-100 text-slate-700" onclick="printOrder(${o.id})">Print</button>
          </div>
        </td>
      </tr>
    `
      )
      .join("");

    pager.textContent = `Page ${currentPage} of ${totalPages}`;
    document.getElementById("prevPage").disabled = currentPage <= 1;
    document.getElementById("nextPage").disabled = currentPage >= totalPages;
  };

  window.markDelivered = async (id) => {
    const order = await fetch(`${API_ORDERS}?id=${id}`).then((r) => r.json());
    if (!order?.id) return;
    order.status = "Delivered";
    await fetch(API_ORDERS, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    render();
  };

  window.printOrder = async (id) => {
    const order = await fetch(`${API_ORDERS}?id=${id}`).then((r) => r.json());
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Order #${order.id}</title></head><body>
      <h1>NEO3D - Order Receipt</h1>
      <p><strong>Order ID:</strong> ${order.id}</p>
      <p><strong>Customer:</strong> ${order.customer_name}</p>
      <p><strong>Product:</strong> ${order.product}</p>
      <p><strong>Quantity:</strong> ${order.quantity}</p>
      <p><strong>Price:</strong> ${currency(order.price)}</p>
      <p><strong>Profit Amount:</strong> ${currency(order.profit_amount || 0)}</p>
      <p><strong>Status:</strong> ${order.status}</p>
      <p><strong>Delivery Date:</strong> ${order.delivery_date}</p>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  document.getElementById("prevPage").addEventListener("click", () => {
    currentPage -= 1;
    render();
  });
  document.getElementById("nextPage").addEventListener("click", () => {
    currentPage += 1;
    render();
  });
  statusFilter.addEventListener("change", () => {
    currentPage = 1;
    render();
  });
  dateFilter.addEventListener("change", () => {
    currentPage = 1;
    render();
  });
  ordersCustomer?.addEventListener("input", () => {
    currentPage = 1;
    render();
  });
  ordersProduct?.addEventListener("input", () => {
    currentPage = 1;
    render();
  });

  render();
}

async function initEditOrder() {
  const form = document.getElementById("editOrderForm");
  const msg = document.getElementById("editOrderMsg");
  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;

  const order = await fetch(`${API_ORDERS}?id=${id}`).then((r) => r.json());
  Object.keys(order).forEach((key) => {
    if (form[key]) form[key].value = order[key];
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.id = id;
    const res = await fetch(API_ORDERS, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    msg.textContent = data.message;
    msg.className = data.success ? "text-green-600 font-medium" : "text-red-600 font-medium";
  });
}

async function initProfit() {
  const data = await fetch(API_PROFIT).then((r) => r.json());
  document.getElementById("profitTotal").textContent = currency(data.total_profit || 0);
  document.getElementById("profitDaily").textContent = currency(data.daily_profit || 0);
  document.getElementById("profitWeekly").textContent = currency(data.weekly_profit || 0);
  document.getElementById("profitMonthly").textContent = currency(data.monthly_profit || 0);
  document.getElementById("profitYearly").textContent = currency(data.yearly_profit || 0);

  const allOrders = Array.isArray(data.orders) ? data.orders : [];
  const fromInput = document.getElementById("profitFromDate");
  const toInput = document.getElementById("profitToDate");
  const applyBtn = document.getElementById("applyProfitDateFilter");
  const resetBtn = document.getElementById("resetProfitDateFilter");
  const rangeOrderAmount = document.getElementById("rangeOrderAmount");
  const rangeProfitAmount = document.getElementById("rangeProfitAmount");
  const rangeCombinedAmount = document.getElementById("rangeCombinedAmount");
  const rangeInfo = document.getElementById("profitRangeInfo");
  const profitRows = document.getElementById("profitRows");

  const safeSetText = (el, text) => {
    if (el) el.textContent = text;
  };

  const formatDateLabel = (value) => {
    if (!value) return "";
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };

  const renderRows = (orders) => {
    profitRows.innerHTML = orders
    .map(
      (o, idx) => `
    <tr class="border-b">
      <td class="px-3 py-2">${idx + 1}</td>
      <td class="px-3 py-2">${o.id}</td>
      <td class="px-3 py-2">${o.customer_name}</td>
      <td class="px-3 py-2">${o.product}</td>
      <td class="px-3 py-2">${o.quantity}</td>
      <td class="px-3 py-2">${currency(o.price)}</td>
      <td class="px-3 py-2">${currency(o.profit_amount)}</td>
      <td class="px-3 py-2">${o.delivery_date}</td>
    </tr>`
    )
    .join("");
  };

  const applyDateRange = () => {
    const fromVal = fromInput?.value || "";
    const toVal = toInput?.value || "";
    const fromTime = fromVal ? new Date(`${fromVal}T00:00:00`).getTime() : null;
    const toTime = toVal ? new Date(`${toVal}T23:59:59`).getTime() : null;

    if (fromTime && toTime && fromTime > toTime) {
      rangeInfo.textContent = "From date cannot be greater than To date.";
      renderRows([]);
      safeSetText(rangeOrderAmount, currency(0));
      safeSetText(rangeProfitAmount, currency(0));
      safeSetText(rangeCombinedAmount, currency(0));
      return;
    }

    const filtered = allOrders.filter((o) => {
      const orderTime = new Date(`${o.delivery_date}T12:00:00`).getTime();
      if (Number.isNaN(orderTime)) return false;
      if (fromTime !== null && orderTime < fromTime) return false;
      if (toTime !== null && orderTime > toTime) return false;
      return true;
    });

    const orderAmount = filtered.reduce((sum, o) => sum + Number(o.price || 0), 0);
    const profitAmount = filtered.reduce((sum, o) => sum + Number(o.profit_amount || 0), 0);
    safeSetText(rangeOrderAmount, currency(orderAmount));
    safeSetText(rangeProfitAmount, currency(profitAmount));
    safeSetText(rangeCombinedAmount, currency(orderAmount + profitAmount));

    if (!fromVal && !toVal) {
      rangeInfo.textContent = `Showing all delivered orders (${filtered.length}).`;
    } else {
      const fromLabel = fromVal ? formatDateLabel(fromVal) : "Start";
      const toLabel = toVal ? formatDateLabel(toVal) : "Today";
      rangeInfo.textContent = `Showing ${filtered.length} delivered orders from ${fromLabel} to ${toLabel}.`;
    }

    renderRows(filtered);
  };

  applyBtn?.addEventListener("click", applyDateRange);
  resetBtn?.addEventListener("click", () => {
    if (fromInput) fromInput.value = "";
    if (toInput) toInput.value = "";
    applyDateRange();
  });

  applyDateRange();
}

async function initHistory() {
  const customer = document.getElementById("historyCustomer");
  const product = document.getElementById("historyProduct");
  const date = document.getElementById("historyDate");
  const rows = document.getElementById("historyRows");

  const render = async () => {
    const data = await getOrders({
      customer: customer.value.trim(),
      product: product.value.trim(),
      date: date.value,
    });
    rows.innerHTML = data
      .map(
        (o) => `
      <tr class="border-b">
        <td class="px-3 py-2">${o.id}</td>
        <td class="px-3 py-2">${o.customer_name}</td>
        <td class="px-3 py-2">${o.product}</td>
        <td class="px-3 py-2">${o.quantity}</td>
        <td class="px-3 py-2">${currency(o.price)}</td>
        <td class="px-3 py-2">${currency(o.profit_amount || 0)}</td>
        <td class="px-3 py-2"><span class="status-pill ${statusClass(o.status)}">${o.status}</span></td>
        <td class="px-3 py-2">${o.delivery_date}</td>
        <td class="px-3 py-2">${o.order_date || o.created_at || ""}</td>
      </tr>`
      )
      .join("");
    // history.html renders a "Print" column via a separate patcher.
    window.patchHistoryPrintButtons?.();
  };

  [customer, product, date].forEach((el) => el.addEventListener("input", render));
  render();
}
