export function removeLegacySavedGamesFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || !("saved_games" in metadata)) {
    return { metadata: metadata || {}, changed: false };
  }

  const nextMetadata = { ...metadata };
  delete nextMetadata.saved_games;

  return { metadata: nextMetadata, changed: true };
}
