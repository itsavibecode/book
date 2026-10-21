// Node environment for engine unit tests: IndexedDB shim; ImageData/OffscreenCanvas are absent, so
// unit tests cover tiles, history and serialisation logic, and anything needing a canvas runs in
// tests/browser (real Chromium).
import 'fake-indexeddb/auto';
