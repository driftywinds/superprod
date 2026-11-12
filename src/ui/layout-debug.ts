/**
 * Layout debug overlay — `?debug=1`.
 *
 * Reports the document scroll width and the widest offenders so an overflowing
 * layout can be diagnosed from a screenshot instead of guessed at.
 */
export const mountLayoutDebug = (): void => {
  requestAnimationFrame(() => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;

    const offenders: { tag: string; cls: string; width: number }[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const rect = element.getBoundingClientRect();
      if (rect.right > docWidth + 1 && rect.width > 0) {
        offenders.push({
          tag: element.tagName.toLowerCase(),
          cls: element.className.toString().slice(0, 28),
          width: Math.round(rect.right),
        });
      }
    }
    offenders.sort((a, b) => b.width - a.width);

    const overlay = document.createElement('pre');
    overlay.style.cssText = [
      'position:fixed',
      'left:0',
      'bottom:0',
      'z-index:9999',
      'margin:0',
      'padding:8px',
      'max-height:40vh',
      'overflow:auto',
      'background:#000',
      'color:#0f0',
      'font:11px/1.4 monospace',
      'white-space:pre-wrap',
      'width:100%',
    ].join(';');
    overlay.textContent = [
      `clientWidth=${docWidth} scrollWidth=${scrollWidth}`,
      ...offenders
        .slice(0, 12)
        .map((o) => `${o.tag}.${o.cls} right=${o.width}`),
    ].join('\n');
    document.body.append(overlay);
  });
};
