// Vectorization is currently PAUSED.
// To re-enable: restore the full implementation from git history (scripts/vectorize-songs-node.mjs).
async function vectorizeSongs() {
  console.warn('⚠️ Vectorization is currently PAUSED. Restore implementation to re-enable.');
}

vectorizeSongs().catch(console.error);
