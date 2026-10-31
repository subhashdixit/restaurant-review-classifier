/** Numeric model inference matching the training export. No network or DOM dependency. */
export function validateRecord(model, record) {
  if (!record || Array.isArray(record) || typeof record !== "object")
    throw new Error("Each row must be an object.");
  const cleaned = {};
  let observed = 0;
  for (const f of model.features) {
    if (!Object.hasOwn(record, f.name))
      throw new Error(`Missing column: ${f.name}`);
    const raw = record[f.name];
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      cleaned[f.name] = null;
      continue;
    }
    observed++;
    if (f.type === "number") {
      if (
        typeof raw === "boolean" ||
        !["number", "string"].includes(typeof raw)
      )
        throw new Error(`${f.label}: use a number.`);
      const value = Number(raw);
      if (
        !Number.isFinite(value) ||
        value < f.min ||
        value > f.max ||
        (f.integer && !Number.isInteger(value))
      )
        throw new Error(
          `${f.label}: outside supported range ${f.min}–${f.max}${f.integer ? " (whole numbers)" : ""}.`,
        );
      cleaned[f.name] = value;
    } else {
      const value = String(raw).trim();
      if (!f.categories.includes(value))
        throw new Error(`${f.label}: unknown category.`);
      cleaned[f.name] = value;
    }
  }
  if (!observed) throw new Error("Provide at least one observed feature.");
  return cleaned;
}
export function vectorize(model, record) {
  const row = validateRecord(model, record),
    result = [];
  for (const f of model.features) {
    if (f.type === "number")
      result.push(((row[f.name] ?? f.median) - f.mean) / f.scale);
    else
      for (const category of f.categories)
        result.push((row[f.name] ?? "__MISSING__") === category ? 1 : 0);
  }
  return result;
}
export function sigmoid(value) {
  return value >= 0
    ? 1 / (1 + Math.exp(-value))
    : Math.exp(value) / (1 + Math.exp(value));
}
export function scoreRecord(model, record) {
  const vector = vectorize(model, record),
    est = model.estimator;
  if (est.type === "linear") {
    const value = est.coefficients.reduce(
      (sum, weight, index) => sum + weight * vector[index],
      est.intercept,
    );
    return est.logistic ? sigmoid(value) : value;
  }
  if (est.type !== "forest" || !est.trees.length)
    throw new Error("Unsupported model artifact.");
  // sklearn forests coerce their input to float32 before comparing thresholds.
  const single = vector.map(Math.fround);
  let sum = 0;
  for (const tree of est.trees) {
    let node = 0,
      traversed = 0;
    while (tree.left[node] !== -1) {
      if (++traversed > tree.left.length)
        throw new Error("Invalid tree cycle.");
      node =
        single[tree.feature[node]] <= tree.threshold[node]
          ? tree.left[node]
          : tree.right[node];
    }
    sum += tree.value[node][model.kind === "classification" ? 1 : 0];
  }
  return sum / est.trees.length;
}
export function predict(model, records, threshold = model.threshold) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 500)
    throw new Error("Provide 1–500 records.");
  if (
    typeof threshold === "boolean" ||
    !Number.isFinite(Number(threshold)) ||
    Number(threshold) < 0.01 ||
    Number(threshold) > 0.99
  )
    throw new Error("Use a threshold from 0.01 to 0.99.");
  return records.map((record, index) => {
    const score = scoreRecord(model, record);
    if (!Number.isFinite(score))
      throw new Error(`Row ${index + 1}: nonfinite prediction.`);
    return model.kind === "classification"
      ? {
          row: index + 1,
          score,
          label: score >= Number(threshold) ? 1 : 0,
          threshold: Number(threshold),
        }
      : { row: index + 1, prediction: score, unit: model.unit };
  });
}
export function parseCSV(text, maximumRows = 500) {
  if (typeof text !== "string" || text.length > 2 * 1024 * 1024)
    throw new Error("CSV must be at most 2 MiB.");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i <= text.length; i++) {
    const char = i === text.length ? "\n" : text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === '"') {
      if (cell || closed) throw new Error("Unexpected quote in CSV field.");
      quoted = true;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(cell);
      cell = "";
      closed = false;
      if (char !== ",") {
        if (row.some((value) => value !== "")) rows.push(row);
        row = [];
        if (char === "\r" && text[i + 1] === "\n") i++;
        if (rows.length > maximumRows + 1)
          throw new Error(`CSV supports at most ${maximumRows} records.`);
      }
    } else {
      if (closed && !/\s/.test(char))
        throw new Error("Characters after closing CSV quote.");
      if (!closed) cell += char;
    }
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  const headers = rows.shift()?.map((value) => value.trim());
  if (
    !headers?.length ||
    !rows.length ||
    headers.some((h) => !h) ||
    new Set(headers).size !== headers.length
  )
    throw new Error(
      "CSV needs unique nonempty headers and at least one record.",
    );
  return rows.map((values) => {
    if (values.length !== headers.length)
      throw new Error("CSV row has the wrong number of columns.");
    return Object.fromEntries(
      headers.map((key, index) => [key, values[index]]),
    );
  });
}
export function csvText(rows) {
  if (!Array.isArray(rows) || !rows.length)
    throw new Error("Nothing to export.");
  const keys = Object.keys(rows[0]);
  const escape = (value) => {
    let s = String(value ?? "");
    if (typeof value !== "number" && /^[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    [
      keys.map(escape).join(","),
      ...rows.map((row) => keys.map((key) => escape(row[key])).join(",")),
    ].join("\r\n") + "\r\n"
  );
}
