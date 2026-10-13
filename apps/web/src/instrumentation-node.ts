import { parseServerEnvironment } from "./env";

// Loaded only by the Node.js runtime: process.exit is not available in the Edge Runtime.
export function validateEnvironmentOrExit() {
  try {
    parseServerEnvironment();
  } catch (error) {
    // Next.js would keep running and answer every request with 500. Stop with a clear
    // message instead, so the process manager or container shows the failed start.
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
