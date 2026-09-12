import { env, pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";
import { join, sep } from "path";

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const INDEX_MODEL = `${MODEL_ID}@751bff37182d3f1213fa05d7196b954e230abad9:quantized:mean:normalized:v1`;
export const DIMENSIONS = 384;
let extractor: Promise<FeatureExtractionPipeline> | undefined;
let configured = false;
let progress: (message: string) => void = console.log;

/** Call with the absolute installed plugin directory before embedding. */
export function configureEmbeddings(pluginDirectory: string, onProgress: typeof progress): void {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useFS = true;
  env.useFSCache = false;
  env.useBrowserCache = false;
  env.localModelPath = join(pluginDirectory, "models") + sep;
  env.backends.onnx.wasm.wasmPaths = join(pluginDirectory, "wasm") + sep;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  progress = onProgress;
  configured = true;
}

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!configured) throw new Error("Local embedding assets have not been configured.");
  if (!extractor) {
    progress("Loading local MiniLM model…");
    extractor = (pipeline("feature-extraction", MODEL_ID, {
      quantized: true,
      local_files_only: true,
      progress_callback: (event: { status: string; file?: string }) => {
        if (event.status === "done") progress(`Loaded ${event.file ?? "model asset"}`);
      },
    }) as Promise<FeatureExtractionPipeline>).catch((error: unknown) => {
      extractor = undefined; // Allow a retry after missing assets are installed.
      throw error;
    });
  }
  return extractor;
}

export async function embedBatch(texts: string[], batchSize = 8): Promise<number[][]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Invalid batch size");
  if (!texts.length) return [];
  const model = await getExtractor();
  const result: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const output = await model(texts.slice(start, start + batchSize), {
      pooling: "mean", normalize: true,
    });
    result.push(...output.tolist() as number[][]);
  }
  return result;
}

export async function embed(text: string): Promise<number[]> {
  return (await embedBatch([text]))[0];
}

export async function disposeEmbeddings(): Promise<void> {
  const pending = extractor;
  extractor = undefined;
  configured = false;
  if (pending) await (await pending).dispose();
}
