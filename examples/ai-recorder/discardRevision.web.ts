export function confirmDiscard(onDiscard: () => void) {
  if (window.confirm('Discard unsaved revision? Your saved transcript will not change.')) onDiscard();
}
