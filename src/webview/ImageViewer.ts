import { escapeHtml, safeHtml } from './sanitize';
export type ViewerImage = { src: string; alt: string; caption: string; error?: string };

export class ImageViewer {
 private element: HTMLElement | null = null;
 private index = 0;
 private zoom = 1;
 private x = 0;
 private y = 0;
 private interval = 5000;
 private timer: number | undefined;
 private playing = false;
 private loaded = false;
 private failed = false;
 private loop = false;
 private captions = true;
 private fit = 1;
 private preload: HTMLImageElement | null = null;
 private returnFocus: HTMLElement | null = null;
 private background: HTMLElement | null = null;
 private pointers = new Map<number, { x: number; y: number }>();
 private suppressStageClick = false;
 private gesture: { x: number; y: number; distance: number; zoom: number; panX: number; panY: number; pinch: boolean } | null = null;
 private key = (e: KeyboardEvent) => {
  if (!this.element) return;
  if (e.key === 'Escape') { e.preventDefault(); this.close(); }
  if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
  if (e.key === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); this.togglePlay(); }
  if (e.key === 'Tab') this.trapFocus(e);
 };
 private visibility = () => { if (document.hidden) this.pause(); };
 private resize = () => this.reset();
 constructor(private images: ViewerImage[], private slideshow: boolean, private onClose: () => void, private retry: () => Promise<ViewerImage[]>) {}
 open(index = 0): void {
  this.index = index;
  this.returnFocus = document.activeElement as HTMLElement;
  this.background = document.getElementById('app');
  this.background?.setAttribute('inert', '');
  this.element = document.createElement('section');
  this.element.className = 'image-viewer overlay';
  this.element.setAttribute('role', 'dialog');
  this.element.setAttribute('aria-modal', 'true');
  this.element.setAttribute('aria-label', this.slideshow ? 'Image slideshow' : 'Image viewer');
  document.body.appendChild(this.element);
  this.element.addEventListener('click', e => this.click(e));
  this.element.addEventListener('change', e => { const target = e.target as HTMLSelectElement; if (target.matches('[data-interval]')) { this.interval = Number(target.value); this.schedule(); } });
  this.element.addEventListener('wheel', e => { if ((e.target as HTMLElement).closest('.image-stage')) { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2)); } }, { passive: false });
  this.element.addEventListener('pointerdown', e => this.down(e));
  this.element.addEventListener('pointermove', e => this.move(e));
  this.element.addEventListener('pointerup', e => this.up(e));
  this.element.addEventListener('pointercancel', () => { this.suppressStageClick = true; this.pointers.clear(); this.gesture = null; });
  document.addEventListener('keydown', this.key);
  document.addEventListener('visibilitychange', this.visibility);
  window.addEventListener('resize', this.resize);
  this.render();
  this.element.querySelector<HTMLButtonElement>('[data-viewer="close"]')?.focus();
 }
 private trapFocus(e: KeyboardEvent): void {
  const items = Array.from(this.element!.querySelectorAll<HTMLElement>('button:not(:disabled),select'));
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
 }
 close(): void {
  this.pause();
  if (document.fullscreenElement === this.element && document.exitFullscreen) document.exitFullscreen().catch(() => undefined);
  this.element?.remove(); this.element = null; this.preload = null;
  this.background?.removeAttribute('inert');
  document.removeEventListener('keydown', this.key);
  document.removeEventListener('visibilitychange', this.visibility);
  window.removeEventListener('resize', this.resize);
  this.returnFocus?.focus();
  this.onClose();
 }
 pause(): void { this.playing = false; window.clearTimeout(this.timer); this.updateControls(); }
 private togglePlay(): void {
  if (this.playing) { this.pause(); return; }
  if (this.failed || !this.loaded || !this.slideshow) return;
  if (this.index === this.images.length - 1 && !this.loop) { this.index = 0; this.render(); }
  this.reset(); this.playing = true; this.schedule(); this.updateControls();
 }
 private schedule(): void {
  window.clearTimeout(this.timer);
  if (!this.playing || !this.loaded || this.failed) return;
  this.timer = window.setTimeout(() => {
   if (this.index === this.images.length - 1 && !this.loop) this.pause();
   else this.step(1, true);
  }, this.interval);
 }
 private step(delta: number, automatic = false): void {
  if (!automatic) this.pause();
  let next = this.index + delta;
  if (this.loop) next = (next + this.images.length) % this.images.length;
  if (next < 0 || next >= this.images.length) return;
  this.index = next; this.render();
 }
 private render(): void {
  if (!this.element) return;
  const current = this.images[this.index];
  const focusedAction = (document.activeElement as HTMLElement | null)?.dataset.viewer;
  this.zoom = 1; this.x = this.y = 0; this.loaded = false; this.failed = false; this.pointers.clear();
  window.clearTimeout(this.timer);
  this.element.innerHTML = `<header class="viewer-toolbar">
   <button data-viewer="close" aria-label="Close image viewer">Close</button>
   ${this.slideshow ? '<button data-viewer="previous" aria-label="Previous image">&#8592;</button><span class="slide-count"></span><button data-viewer="next" aria-label="Next image">&#8594;</button><button data-viewer="play">Play</button><label>Interval <select data-interval><option value="3000">3 s</option><option value="5000">5 s</option><option value="10000">10 s</option></select></label><button data-viewer="loop">Loop</button><button data-viewer="captions">Caption</button>' : ''}
   <button data-viewer="out" aria-label="Zoom out">&#8722;</button><button data-viewer="in" aria-label="Zoom in">+</button><button data-viewer="fit">Fit</button><button data-viewer="original">1:1</button>
   ${document.fullscreenEnabled ? '<button data-viewer="fullscreen">Fullscreen</button>' : ''}
  </header><div class="image-stage"><img class="viewer-image" alt="${escapeHtml(current.alt)}" draggable="false"><div class="image-status" role="status">Loading image...</div></div>
  <div class="viewer-caption rendered-markdown">${safeHtml(current.caption)}</div>`;
  const select = this.element.querySelector<HTMLSelectElement>('select'); if (select) select.value = String(this.interval);
  const img = this.element.querySelector<HTMLImageElement>('.viewer-image')!;
  img.onload = () => {
   if (!img.isConnected) return;
   this.loaded = true; this.failed = false; this.reset();
   this.element!.querySelector<HTMLElement>('.image-status')!.hidden = true;
   this.schedule(); this.updateControls(); this.preloadNext();
  };
  img.onerror = () => {
   if (!img.isConnected) return;
   this.failed = true; this.loaded = false; this.pause();
   this.element!.querySelector<HTMLElement>('.image-status')!.innerHTML = 'Image unavailable. <button data-viewer="retry">Retry</button>';
   img.style.visibility = 'hidden';
  };
  if (current.src && !current.error) img.src = current.src;
  else img.dispatchEvent(new Event('error'));
  this.updateControls();
  if (focusedAction) this.element.querySelector<HTMLElement>(`[data-viewer="${focusedAction}"]:not(:disabled)`)?.focus();
 }
 private preloadNext(): void {
  this.preload = null;
  const next = this.images[this.index + 1];
  if (next?.src) { this.preload = new Image(); this.preload.src = next.src; }
 }
 private updateControls(): void {
  if (!this.element) return;
  const button = (name: string) => this.element!.querySelector<HTMLButtonElement>(`[data-viewer="${name}"]`);
  const play = button('play'); if (play) { play.textContent = this.playing ? 'Pause' : 'Play'; play.disabled = !this.loaded || this.failed; }
  const prev = button('previous'); if (prev) prev.disabled = !this.loop && this.index === 0;
  const next = button('next'); if (next) next.disabled = !this.loop && this.index === this.images.length - 1;
  button('loop')?.setAttribute('aria-pressed', String(this.loop));
  button('captions')?.setAttribute('aria-pressed', String(this.captions));
  const count = this.element.querySelector('.slide-count'); if (count) count.textContent = `${this.index + 1} / ${this.images.length}`;
  const caption = this.element.querySelector<HTMLElement>('.viewer-caption'); if (caption) caption.hidden = !this.captions;
 }
 private reset(): void {
  const img = this.element?.querySelector<HTMLImageElement>('.viewer-image');
  const stage = this.element?.querySelector<HTMLElement>('.image-stage');
  if (!img || !stage || !img.naturalWidth) return;
  this.fit = Math.min(stage.clientWidth / img.naturalWidth, stage.clientHeight / img.naturalHeight, 1);
  this.zoom = 1; this.x = this.y = 0;
  img.style.width = `${img.naturalWidth * this.fit}px`;
  img.style.height = `${img.naturalHeight * this.fit}px`;
  img.style.visibility = 'visible';
  this.transform();
 }
 private setZoom(value: number): void { this.pause(); this.zoom = Math.max(1, Math.min(8, value)); if (this.zoom === 1) this.x = this.y = 0; this.transform(); }
 private transform(): void {
  const img = this.element?.querySelector<HTMLImageElement>('.viewer-image');
  const stage = this.element?.querySelector<HTMLElement>('.image-stage');
  if (!img || !stage) return;
  const limitX = Math.max(0, (img.naturalWidth * this.fit * this.zoom - stage.clientWidth) / 2);
  const limitY = Math.max(0, (img.naturalHeight * this.fit * this.zoom - stage.clientHeight) / 2);
  this.x = Math.max(-limitX, Math.min(limitX, this.x)); this.y = Math.max(-limitY, Math.min(limitY, this.y));
  img.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.zoom})`;
 }
 private down(e: PointerEvent): void {
  const stage = (e.target as HTMLElement).closest<HTMLElement>('.image-stage');
  if (!stage || (e.target as HTMLElement).closest('button') || e.button > 0) return;
  e.preventDefault(); stage.setPointerCapture?.(e.pointerId);
  if (!this.pointers.size) this.suppressStageClick = false;
  else this.suppressStageClick = true;
  this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const pts = Array.from(this.pointers.values());
  this.gesture = { x: pts[0].x, y: pts[0].y, distance: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, zoom: this.zoom, panX: this.x, panY: this.y, pinch: pts.length > 1 };
  if (pts.length > 1 || this.zoom > 1) this.pause();
 }
 private move(e: PointerEvent): void {
  if (!this.pointers.has(e.pointerId) || !this.gesture) return;
  if (Math.hypot(e.clientX - this.gesture.x, e.clientY - this.gesture.y) > 8) this.suppressStageClick = true;
  this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const pts = Array.from(this.pointers.values());
  if (pts.length > 1 && this.gesture.distance) this.setZoom(this.gesture.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / this.gesture.distance);
  else if (this.zoom > 1) { this.x = this.gesture.panX + e.clientX - this.gesture.x; this.y = this.gesture.panY + e.clientY - this.gesture.y; this.transform(); }
 }
 private up(e: PointerEvent): void {
  if (!this.pointers.has(e.pointerId)) return;
  const gesture = this.gesture;
  if (gesture && (gesture.pinch || Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 8)) this.suppressStageClick = true;
  this.pointers.delete(e.pointerId);
  if (!this.pointers.size && gesture && !gesture.pinch && this.zoom === 1 && this.slideshow) {
   const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y;
   if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) this.step(dx < 0 ? 1 : -1);
  }
  if (!this.pointers.size) this.gesture = null;
 }
 private async click(e: MouseEvent): Promise<void> {
  const action = (e.target as HTMLElement).closest<HTMLElement>('[data-viewer]')?.dataset.viewer;
  if (!action && (e.target as HTMLElement).closest('.image-stage')) {
   if (!this.suppressStageClick) this.close();
   return;
  }
  if (action === 'close') this.close();
  if (action === 'previous') this.step(-1);
  if (action === 'next') this.step(1);
  if (action === 'play') this.togglePlay();
  if (action === 'loop') { this.loop = !this.loop; this.updateControls(); }
  if (action === 'captions') { this.captions = !this.captions; this.updateControls(); this.reset(); }
  if (action === 'in') this.setZoom(this.zoom * 1.5);
  if (action === 'out') this.setZoom(this.zoom / 1.5);
  if (action === 'fit') { this.pause(); this.reset(); }
  if (action === 'original') this.setZoom(1 / this.fit);
  if (action === 'fullscreen') {
   try { if (document.fullscreenElement) await document.exitFullscreen(); else await this.element?.requestFullscreen(); this.reset(); } catch (_) { /* The viewer still fills the plugin when fullscreen is unavailable. */ }
  }
  if (action === 'retry') {
   this.pause();
   const index = this.index;
   try { const images = await this.retry(); if (images.length && this.element && index === this.index) this.images = images; } catch (_) { /* Keep the explicit retry affordance on another failure. */ }
   if (this.element && index === this.index) this.render();
  }
 }
}
