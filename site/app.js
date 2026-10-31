import { predict, parseCSV, csvText } from "./text-engine.js";
import { element, metric, table, number, barChart } from "./charts.js";
const $ = (id) => document.getElementById(id);
let model, report, sample, project, latest;
function message(text, error = false) {
  $("status").textContent = text;
  $("status").className = error ? "error" : "muted";
}
function download(name, text, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = element("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readFields(prefix = "input-") {
  return Object.fromEntries(
    model.features.map((f) => [
      f.name,
      $(prefix + f.name).value.trim() || null,
    ]),
  );
}
function showResult(prediction, target, title) {
  const card = element("article", undefined, "result");
  card.append(element("span", title, "eyebrow"));
  if (prediction.warning)
    card.append(element("p", prediction.warning, "error"));
  if (model.kind === "classification") {
    card.append(
      element(
        "p",
        prediction.label === 1 ? project.positiveLabel : project.negativeLabel,
      ),
    );
    card.append(element("strong", number(prediction.score * 100, 1) + "%"));
    card.append(
      element(
        "p",
        `Uncalibrated class-1 score. Applied threshold ${prediction.threshold}. This is a historical-source prediction, not an operational decision.`,
      ),
    );
    const meter = element("meter");
    meter.min = 0;
    meter.max = 1;
    meter.value = prediction.score;
    meter.setAttribute("aria-label", "Positive source-label score");
    card.append(meter);
  } else {
    card.append(element("strong", number(prediction.prediction, 2)));
    card.append(element("p", model.unit));
    card.append(
      element(
        "p",
        "A model estimate, not a guaranteed outcome. Held-out MAE describes average errors; it is not an individual prediction interval.",
      ),
    );
  }
  target.replaceChildren(card);
}
function buildFields(container, prefix) {
  const grid = element("div", undefined, "grid");
  for (const f of model.features) {
    const label = element("label", f.label);
    label.htmlFor = prefix + f.name;
    let input;
    if (f.type === "text") {
      input = element("textarea");
      input.maxLength = f.maxLength;
      input.minLength = 3;
    } else if (f.type === "category") {
      input = element("select");
      for (const category of f.categories) {
        const option = element(
          "option",
          category === "__MISSING__"
            ? "Missing / use training representation"
            : category,
        );
        option.value = category;
        input.append(option);
      }
    } else {
      input = element("input");
      input.type = "number";
      input.min = f.min;
      input.max = f.max;
      input.step = f.integer ? "1" : "any";
    }
    input.id = prefix + f.name;
    input.name = f.name;
    input.value = sample[f.name];
    label.append(input, element("small", f.name));
    grid.append(label);
  }
  container.append(grid);
}
function evaluateView() {
  const stats = $("metrics"),
    test = report.test;
  for (const [label, value] of model.kind === "classification"
    ? [
        ["Test average precision", number(test.average_precision, 3)],
        [
          "Test recall, class 1",
          number(
            (
              test.classification_report["1.0"] ??
              test.classification_report["1"]
            )?.recall,
            3,
          ),
        ],
        ["Held-out rows", test.rows],
      ]
    : [
        ["Test MAE", number(test.mae, 2)],
        ["Test RMSE", number(test.rmse, 2)],
        ["Test R²", number(test.r2, 3)],
      ])
    stats.append(metric(label, value));
  const candidates = Object.entries(report.validation_candidates).map(
    ([label, values]) => ({
      label,
      value:
        model.kind === "classification" ? values.average_precision : values.mae,
    }),
  );
  barChart(
    $("candidate-chart"),
    candidates,
    model.kind === "classification"
      ? "Validation average precision: larger is better"
      : "Validation MAE: smaller is better",
  );
  $("selected-model").textContent =
    `Selected ${report.selected_model.replaceAll("_", " ")} using validation ${model.kind === "classification" ? "average precision" : "MAE"}. Training / validation / test rows: ${Object.values(report.split).join(" / ")}. ${report.split_method}.`;
  if (model.kind === "classification")
    table(
      $("test-table"),
      ["Actual / predicted", "0", "1"],
      report.test.confusion_matrix.map((row, i) => [i, ...row]),
    );
  else
    table(
      $("test-table"),
      ["Measure", "Selected model", "Mean baseline"],
      ["mae", "rmse", "r2"].map((k) => [
        k,
        number(test[k], 3),
        number(report.test_baseline[k], 3),
      ]),
    );
}
async function start() {
  try {
    const modelResponse = await fetch("./model.json");
    if (!modelResponse.ok)
      throw new Error("Could not load the model artifact.");
    const bytes = await modelResponse.arrayBuffer();
    [report, sample, project] = await Promise.all(
      ["metrics.json", "sample.json", "project.json"].map(async (path) => {
        const r = await fetch("./" + path);
        if (!r.ok) throw new Error("Missing " + path);
        return r.json();
      }),
    );
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== report.artifact_sha256)
      throw new Error(
        "Model integrity mismatch; refresh the published release.",
      );
    model = JSON.parse(new TextDecoder().decode(bytes));
    buildFields($("inputs"), "input-");
    if (project.scenario) {
      $("scenario").hidden = false;
      buildFields($("scenario-inputs"), "scenario-");
    }
    if (model.features.length > 20) {
      $("fields-details").open = false;
      $("field-count").textContent =
        `Advanced single profile · ${model.features.length} anonymized sensors`;
    }
    $("threshold-row").hidden = model.kind !== "classification";
    $("threshold").value = model.threshold;
    evaluateView();
    $("run").disabled = false;
    $("batch-run").disabled = false;
    message(
      "Verified model loaded. Processing runs in this browser; feature values are not uploaded.",
    );
  } catch (error) {
    message(error.message, true);
  }
}
$("single-form").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    const threshold =
      model.kind === "classification" ? $("threshold").value : 0.5;
    latest = predict(model, [readFields()], threshold);
    showResult(latest[0], $("prediction"), "MODEL RESULT");
    if (project.scenario) {
      const scenario = predict(model, [readFields("scenario-")], threshold)[0];
      showResult(scenario, $("scenario-result"), "WHAT-IF ASSOCIATION");
      const difference = scenario.prediction - latest[0].prediction;
      $("scenario-result").append(
        element(
          "p",
          `Scenario minus baseline: ${number(difference, 2)} ${model.unit}. Changing a feature in a predictive model does not establish a causal effect.`,
        ),
      );
    }
    $("export-result").hidden = false;
    message("Prediction complete. Inputs were processed locally.");
  } catch (error) {
    message(error.message, true);
    $("prediction").replaceChildren();
    $("scenario-result").replaceChildren();
    $("export-result").hidden = true;
  }
});
$("sample").addEventListener("click", () => {
  if (sample) download("sample.csv", csvText([sample]));
});
$("reset").addEventListener("click", () => {
  if (!sample) return;
  for (const f of model.features) {
    $("input-" + f.name).value = sample[f.name];
    if (project.scenario) $("scenario-" + f.name).value = sample[f.name];
  }
  $("prediction").replaceChildren();
  $("scenario-result").replaceChildren();
  $("export-result").hidden = true;
  message("Synthetic median profile restored.");
});
$("export-result").addEventListener("click", () => {
  if (latest) download("prediction.csv", csvText(latest));
});
$("batch-run").addEventListener("click", async () => {
  const file = $("csv").files[0];
  if (!file) {
    message("Select a CSV first.", true);
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    message("CSV must be at most 2 MiB.", true);
    return;
  }
  $("batch-run").disabled = true;
  try {
    const records = parseCSV(await file.text());
    const worker = new Worker(new URL("./model-worker.js", import.meta.url), {
      type: "module",
    });
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate();
        reject(new Error("Batch exceeded 30 seconds; use fewer rows."));
      }, 30000);
      worker.onmessage = (event) => {
        clearTimeout(timer);
        worker.terminate();
        event.data.error
          ? reject(new Error(event.data.error))
          : resolve(event.data.results);
      };
      worker.onerror = () => {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error("Batch worker failed."));
      };
      worker.postMessage({
        model,
        records,
        threshold: model.kind === "classification" ? $("threshold").value : 0.5,
      });
    });
    download("batch-predictions.csv", csvText(result));
    message(
      `Processed ${result.length} rows locally. Export includes row numbers and predictions, not source feature values.`,
    );
  } catch (error) {
    message(error.message, true);
  } finally {
    $("batch-run").disabled = false;
  }
});
start();
