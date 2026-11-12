// Client side of the PNG worker. Vite's inline worker import keeps the single-file build working;
// when a worker cannot be created (Node tests, locked-down browsers) encoding falls back to the
// main thread, yielding between buffers so the page stays responsive between layers.
import PngWorker from './png.worker?worker&inline';
import { encodeJob, transferables, type PngJob } from './job';

export type { PngJob } from './job';

interface Reply { id: number; out?: Array<{ key: string; bytes: Uint8Array }>; error?: string }
interface Pending { resolve: (v: Record<string, Uint8Array>) => void; reject: (e: Error) => void }

let worker: Worker | null | undefined;
let disabled = false;
let seq = 0;
const pending = new Map<number, Pending>();

function failAll(err: Error): void {
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function getWorker(): Worker | null {
  if (disabled) return null;
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined') throw new Error('no Worker');
    const w = new PngWorker();
    w.onmessage = (e: MessageEvent<Reply>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error || !e.data.out) { p.reject(new Error(e.data.error ?? 'Encoding failed')); return; }
      const files: Record<string, Uint8Array> = {};
      for (const o of e.data.out) files[o.key] = o.bytes;
      p.resolve(files);
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      worker = null;
      failAll(new Error('The encoding worker stopped'));
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

const yieldNow = () => new Promise<void>((r) => setTimeout(r, 0));

/** Main-thread encoding, one buffer per task. */
export async function encodeJobsMainThread(jobs: PngJob[]): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < jobs.length; i++) {
    if (i > 0) await yieldNow();
    const j = jobs[i];
    files[j.key] = encodeJob(j);
  }
  return files;
}

/** Encodes every job to PNG bytes, in a worker when possible. The pixel buffers are transferred (detached). */
export async function encodeJobs(jobs: PngJob[]): Promise<Record<string, Uint8Array>> {
  if (jobs.length === 0) return {};
  const w = getWorker();
  if (!w) return encodeJobsMainThread(jobs);
  const id = ++seq;
  try {
    return await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, jobs }, transferables(jobs));
    });
  } catch (err) {
    // The worker died mid-job: the pixels may be detached, so the caller retries from a new snapshot.
    pending.delete(id);
    throw err;
  }
}

/** True when encodes run in a worker. */
export function pngWorkerActive(): boolean {
  return getWorker() !== null;
}

/** Test hook: force the main-thread path (true) or allow the worker again (false). */
export function setPngWorkerDisabled(v: boolean): void {
  disabled = v;
}
