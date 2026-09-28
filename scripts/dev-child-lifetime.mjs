// The managed dev launcher supplies an IPC channel and inherits this preload
// through NODE_OPTIONS into Next's forked worker. Windows cannot terminate the
// tree of an already-dead parent with taskkill, so a parent disconnect must also
// stop its child. No process lookup or unrelated PID is involved.
if (process.channel) {
  process.once("disconnect", () => process.exit(1));
  // Keep IPC referenced: Next's worker waits for its startup message on this
  // channel before opening the HTTP listener. Unref can make it exit too early.
}
