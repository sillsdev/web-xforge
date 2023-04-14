export function getOverlays(element: HTMLElement): HTMLElement[] {
  return Array.from(element.ownerDocument.querySelectorAll('.cdk-overlay-container .cdk-overlay-pane'));
}

export function getOverlay(element: HTMLElement): HTMLElement {
  const overlays = getOverlays(element);
  if (overlays.length !== 1) {
    throw new Error(`Expected 1 overlay, found ${overlays.length}`);
  }
  return overlays[0];
}
