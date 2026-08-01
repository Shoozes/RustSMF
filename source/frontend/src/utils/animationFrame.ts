export function cancelPendingAnimationFrame(
  handle: number | null,
  cancel: (handle: number) => void,
): null {
  if (handle !== null) cancel(handle);
  return null;
}
