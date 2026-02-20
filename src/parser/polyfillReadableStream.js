/**
 * Set ReadableStream on globalThis so dependencies (e.g. undici) work on Node 16.
 * Must be imported before any module that pulls in undici.
 */
import { ReadableStream } from 'node:stream/web';
if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = ReadableStream;
}
