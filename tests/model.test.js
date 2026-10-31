import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import {
  predict,
  scoreRecord,
  vectorize,
  tokens,
  parseCSV,
  csvText,
} from "../site/text-engine.js";
const model = JSON.parse(fs.readFileSync("site/model.json"));
const sample = JSON.parse(fs.readFileSync("site/sample.json"));
const fixtures = JSON.parse(fs.readFileSync("reports/parity-fixtures.json"));
test("browser TF-IDF and classifier match held-out sklearn outputs", () => {
  for (const row of fixtures)
    assert.ok(Math.abs(scoreRecord(model, row.record) - row.expected) < 1e-9);
});
test("unigrams and adjacent bigrams use the same explicit ASCII token contract", () => {
  assert.deepEqual(tokens("Not good!"), ["not", "good", "not good"]);
});
test("nonzero feature vector has L2 norm one", () => {
  const x = vectorize(model, sample.review);
  assert.ok(Math.abs(Math.hypot(...x) - 1) < 1e-12);
});
test("unknown vocabulary and prototype names raise a reliability warning", () => {
  for (const review of ["zzzxqvv", "constructor"])
    assert.match(predict(model, [{ review }])[0].warning, /unreliable/);
});
test("empty, excessive or nontext reviews fail", () => {
  for (const review of ["", null, true, 42, "a", "x".repeat(4001)])
    assert.throws(() => predict(model, [{ review }]));
});
test("batch and schema limits bound browser computation", () => {
  for (const rows of [[], Array(501).fill(sample), [{}], null])
    assert.throws(() => predict(model, rows));
});
test("bad thresholds cannot silently classify", () => {
  for (const value of [true, 0, 1, NaN, "bad"])
    assert.throws(() => predict(model, [sample], value));
});
test("CSV roundtrip supports commas and literal markup as text", () => {
  const rows = parseCSV(
    csvText([{ review: "Great food, <b>friendly</b> service" }]),
  );
  assert.equal(rows.length, 1);
  assert.ok(Number.isFinite(scoreRecord(model, rows[0])));
});
test("CSV rejects malformed quotes, duplicate headers and excessive rows", () => {
  for (const text of ["a,a\n1,2", 'review\n"open', 'review\n"x"bad'])
    assert.throws(() => parseCSV(text));
  assert.throws(() => parseCSV("review\n" + "good\n".repeat(501)));
});
test("model and source metadata identify the evaluated artifact", () => {
  const r = JSON.parse(fs.readFileSync("site/metrics.json"));
  assert.equal(
    r.artifact_sha256,
    crypto
      .createHash("sha256")
      .update(fs.readFileSync("site/model.json"))
      .digest("hex"),
  );
  assert.match(r.source_notice, /UCI/);
  assert.equal(r.test.rows, r.split.test);
});
