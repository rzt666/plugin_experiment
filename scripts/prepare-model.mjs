import { mkdir, writeFile, rename, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Explicit developer packaging step; never executed by the Obsidian plugin.
const model = "Xenova/all-MiniLM-L6-v2";
const revision = "751bff37182d3f1213fa05d7196b954e230abad9";
for (const file of ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "onnx/model_quantized.onnx", "README.md"]) {
  const target = resolve("models", model, file);
  await mkdir(dirname(target), { recursive: true });
  console.log(`Preparing ${model}/${file}`);
  const response = await fetch(`https://huggingface.co/${model}/resolve/${revision}/${file}`);
  if (!response.ok) throw new Error(`Model download failed: ${response.status} ${file}`);
  await writeFile(target + ".tmp", new Uint8Array(await response.arrayBuffer()));
  await rename(target + ".tmp", target);
}
await mkdir("wasm", { recursive: true });
for (const file of ["ort-wasm.wasm", "ort-wasm-simd.wasm"]) {
  await copyFile(resolve("node_modules/onnxruntime-web/dist", file), resolve("wasm", file));
}
await copyFile("node_modules/onnxruntime-web/README.md", "wasm/README.md");
console.log("Offline assets ready. Copy models/ and wasm/ alongside main.js.");
