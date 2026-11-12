// PNG encoding off the main thread. Receives pixel or tile copies (transferred), returns PNG
// bytes (transferred back). Same encoder as the main thread, so output is byte-identical.
import { encodeJob, type PngJob } from './job';

interface Request { id: number; jobs: PngJob[] }

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(msg: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (e) => {
  const { id, jobs } = e.data;
  try {
    const out = jobs.map((j) => ({ key: j.key, bytes: encodeJob(j) }));
    scope.postMessage({ id, out }, out.map((o) => o.bytes.buffer as ArrayBuffer));
  } catch (err) {
    scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
