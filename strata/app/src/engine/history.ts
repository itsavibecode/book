// Command history with a merge window for scrubs and nudges.
import type { Command, DocumentLike, HistoryLike } from './contract';

export const MERGE_WINDOW_MS = 400;
export const HISTORY_LIMIT = 200;

export class History implements HistoryLike {
  limit = HISTORY_LIMIT;
  private stack: Command[] = [];
  private _cursor = 0;
  /** Time of the last record; 0 after undo/redo so a new command never folds into an older one. */
  private lastAt = 0;
  private listeners = new Set<() => void>();

  constructor(private readonly doc: DocumentLike) {}

  push(cmd: Command): void {
    cmd.do(this.doc);
    this.record(cmd);
  }

  record(cmd: Command): void {
    if (this._cursor < this.stack.length) {
      this.stack.length = this._cursor;
      this.lastAt = 0;
    }
    const now = Date.now();
    const top = this.stack[this.stack.length - 1];
    if (top && top.merge && this.lastAt > 0 && now - this.lastAt <= MERGE_WINDOW_MS && top.merge(cmd)) {
      this.lastAt = now;
      this.notify();
      return;
    }
    this.stack.push(cmd);
    const over = this.stack.length - Math.max(1, Math.floor(this.limit));
    if (over > 0) this.stack.splice(0, over);
    this._cursor = this.stack.length;
    this.lastAt = now;
    this.notify();
  }

  undo(): boolean {
    if (this._cursor === 0) return false;
    this._cursor--;
    this.lastAt = 0;
    this.stack[this._cursor].undo(this.doc);
    this.notify();
    return true;
  }

  redo(): boolean {
    if (this._cursor >= this.stack.length) return false;
    this.lastAt = 0;
    this.stack[this._cursor].do(this.doc);
    this._cursor++;
    this.notify();
    return true;
  }

  get canUndo(): boolean {
    return this._cursor > 0;
  }

  get canRedo(): boolean {
    return this._cursor < this.stack.length;
  }

  get labels(): readonly string[] {
    return this.stack.map((c) => c.label);
  }

  get cursor(): number {
    return this._cursor;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  clear(): void {
    this.stack = [];
    this._cursor = 0;
    this.lastAt = 0;
    this.notify();
  }

  private notify(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch (err) {
        console.error(err);
      }
    }
  }
}
