/** Match the fitted ASCII unigram/bigram TF-IDF and binary linear model. */
import { sigmoid, parseCSV, csvText } from "./model-engine.js";
export { parseCSV, csvText };
export function tokens(review) {
  if (
    typeof review !== "string" ||
    review.trim().length < 3 ||
    review.length > 4000
  )
    throw new Error("Provide a review of 3–4000 characters.");
  const words = review.toLowerCase().match(/[a-z]{2,}/g) ?? [];
  if (words.length > 1000)
    throw new Error("Use at most 1000 recognized word tokens.");
  return [
    ...words,
    ...words.slice(1).map((word, index) => words[index] + " " + word),
  ];
}
export function vectorize(model, review) {
  const counts = new Map();
  for (const token of tokens(review)) {
    const id = Object.hasOwn(model.vocabulary, token)
      ? model.vocabulary[token]
      : undefined;
    if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const vector = Array(model.idf.length).fill(0);
  let norm = 0;
  for (const [index, count] of counts) {
    const value = (1 + Math.log(count)) * model.idf[index];
    vector[index] = value;
    norm += value * value;
  }
  norm = Math.sqrt(norm);
  return norm ? vector.map((value) => value / norm) : vector;
}
export function scoreRecord(model, record) {
  if (
    !record ||
    Array.isArray(record) ||
    typeof record !== "object" ||
    !Object.hasOwn(record, "review")
  )
    throw new Error("Each record needs a review field.");
  const vector = vectorize(model, record.review);
  const margin = vector.reduce(
    (sum, value, index) => sum + value * model.coefficients[index],
    model.intercept,
  );
  return sigmoid(margin);
}
export function predict(model, records, threshold = model.threshold) {
  if (!Array.isArray(records) || records.length < 1 || records.length > 500)
    throw new Error("Provide 1–500 reviews.");
  if (
    typeof threshold === "boolean" ||
    !Number.isFinite(Number(threshold)) ||
    Number(threshold) < 0.01 ||
    Number(threshold) > 0.99
  )
    throw new Error("Use a threshold from 0.01 to 0.99.");
  return records.map((record, index) => {
    const score = scoreRecord(model, record),
      vector = vectorize(model, record.review);
    return {
      row: index + 1,
      label: score >= Number(threshold) ? 1 : 0,
      score,
      threshold: Number(threshold),
      warning: vector.some((value) => value !== 0)
        ? ""
        : "No vocabulary overlap: this result is unreliable.",
    };
  });
}
