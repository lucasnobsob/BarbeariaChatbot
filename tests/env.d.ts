/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { WorkerBindings } from '../src/worker/types';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerBindings {}
  }
}
