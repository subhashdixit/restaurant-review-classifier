import { predict } from "./text-engine.js";
self.onmessage = (event) => {
  try {
    const { model, records, threshold } = event.data;
    self.postMessage({ results: predict(model, records, threshold) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
