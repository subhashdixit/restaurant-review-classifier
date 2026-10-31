/** Local SVG charts and safe DOM/CSV helpers; no external scripts or analytics. */
export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = String(text);
  return node;
}
export function number(value, digits = 0) {
  return Number.isFinite(value)
    ? value.toLocaleString("en", { maximumFractionDigits: digits })
    : "Unavailable";
}
export function metric(label, value, note = "") {
  const card = element("article", undefined, "metric");
  card.append(
    element("strong", value),
    element("div", label),
    element("span", note),
  );
  return card;
}
export function table(container, headers, rows) {
  const grid = element("table");
  const heading = element("tr");
  for (const label of headers) heading.append(element("th", label));
  const head = element("thead");
  head.append(heading);
  grid.append(head);
  const body = element("tbody");
  for (const values of rows) {
    const row = element("tr");
    for (const value of values) row.append(element("td", value));
    body.append(row);
  }
  grid.append(body);
  container.replaceChildren(grid);
}
export function barChart(container, rows, title) {
  const width = 800,
    height = Math.max(160, rows.length * 32 + 35),
    left = 210;
  const svg = svgNode("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": title,
  });
  svg.append(svgNode("title", {}, title));
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  rows.forEach((row, index) => {
    const y = index * 32 + 12;
    const full = String(row.label),
      label = full.length > 26 ? full.slice(0, 24) + "…" : full;
    svg.append(
      svgNode("text", { x: left - 12, y: y + 15, "text-anchor": "end" }, label),
    );
    const bar = svgNode("rect", {
      x: left,
      y,
      width: Math.max(0, (row.value / maximum) * 480),
      height: 22,
      fill: "#24664e",
      rx: 3,
    });
    bar.append(svgNode("title", {}, `${full}: ${number(row.value, 2)}`));
    svg.append(bar);
    svg.append(
      svgNode(
        "text",
        { x: left + Math.max(0, (row.value / maximum) * 480) + 8, y: y + 15 },
        number(row.value, 2),
      ),
    );
  });
  if (!rows.length)
    svg.append(
      svgNode("text", { x: 20, y: 40 }, "No observations for this selection."),
    );
  container.replaceChildren(svg);
}
export function lineChart(container, rows, title, color = "#24664e") {
  const width = 800,
    height = 280,
    left = 65,
    right = 30,
    top = 25,
    bottom = 45;
  const svg = svgNode("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": title,
  });
  svg.append(svgNode("title", {}, title));
  if (!rows.length) {
    svg.append(svgNode("text", { x: 20, y: 40 }, "No observations."));
    container.replaceChildren(svg);
    return;
  }
  const minimum = Math.min(...rows.map((row) => row.value));
  const maximum = Math.max(...rows.map((row) => row.value));
  const span = maximum - minimum || Math.max(1, Math.abs(maximum) * 0.1);
  const x = (index) =>
    left + (index / Math.max(1, rows.length - 1)) * (width - left - right);
  const y = (value) =>
    height - bottom - ((value - minimum) / span) * (height - top - bottom);
  for (let tick = 0; tick < 3; tick++) {
    const value = minimum + (span * tick) / 2,
      position = y(value);
    svg.append(
      svgNode("line", {
        x1: left,
        x2: width - right,
        y1: position,
        y2: position,
        stroke: "#d7e1d8",
      }),
    );
    svg.append(
      svgNode(
        "text",
        { x: left - 8, y: position + 4, "text-anchor": "end" },
        number(value, 2),
      ),
    );
  }
  svg.append(
    svgNode("polyline", {
      points: rows.map((row, index) => `${x(index)},${y(row.value)}`).join(" "),
      fill: "none",
      stroke: color,
      "stroke-width": 3,
    }),
  );
  rows.forEach((row, index) => {
    const point = svgNode("circle", {
      cx: x(index),
      cy: y(row.value),
      r: 3,
      fill: color,
    });
    point.append(svgNode("title", {}, `${row.label}: ${number(row.value, 3)}`));
    svg.append(point);
  });
  [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])].forEach(
    (index) =>
      svg.append(
        svgNode(
          "text",
          { x: x(index), y: height - 15, "text-anchor": "middle" },
          rows[index].label,
        ),
      ),
  );
  container.replaceChildren(svg);
}
export function downloadCsv(filename, headers, rows) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = [headers, ...rows]
    .map((row) => row.map(cell).join(","))
    .join("\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = element("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
