// Selection behaviour shared by every list: hover selects, click confirms, touch taps select then
// confirm, the selected item takes focus and scrolls into view.

let lastPick = 0;
// only a real mouse movement selects, and not right after a selection reflowed the layout
export function realMove(e) {
  if (e.pointerType !== 'mouse' || !(e.movementX || e.movementY)) return false;
  const now = performance.now();
  if (now - lastPick < 80) return false;
  lastPick = now;
  return true;
}

export function makeList(items, { onSelect, onActivate, start = 0, wrap = true, canAct = () => true } = {}) {
  let sel = -1, pointer = 'mouse';
  const ctrl = {
    items,
    get sel() { return sel; },
    select(i, quiet) {
      if (!items.length) return;
      i = wrap ? (i + items.length) % items.length : Math.max(0, Math.min(items.length - 1, i));
      const prev = sel;
      sel = i;
      items.forEach((el, j) => { el.classList.toggle('sel', j === i); el.setAttribute('aria-current', j === i ? 'true' : 'false'); });
      if (!quiet) items[i].focus({ preventScroll: true });
      items[i].scrollIntoView({ block: 'nearest', behavior: quiet ? 'auto' : 'smooth' });
      if (prev !== i) onSelect?.(i, prev, quiet);
    },
    move(d) { ctrl.select(sel + d); },
    activate() { if (sel >= 0 && canAct(sel)) onActivate?.(sel); },
  };
  items.forEach((el, i) => {
    el.addEventListener('pointerdown', (e) => { pointer = e.pointerType; });
    el.addEventListener('pointermove', (e) => { if (sel !== i && realMove(e)) ctrl.select(i); });
    el.addEventListener('click', (e) => {
      if (e.detail === 0) { if (sel !== i) ctrl.select(i); ctrl.activate(); return; }   // keyboard click
      if (sel !== i) { ctrl.select(i); if (pointer !== 'mouse') return; }
      ctrl.activate();
    });
  });
  if (items.length) ctrl.select(Math.min(start, items.length - 1), true);
  return ctrl;
}
