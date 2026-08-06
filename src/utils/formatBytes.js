// Turns a byte count into a friendly display string, e.g. 2_500_000 -> "2.38 MB".
// Shared by every tool that shows file sizes, so there's exactly one place
// this formatting logic lives.
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
