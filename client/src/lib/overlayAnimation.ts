/**
 * Map a prank animation name to CSS classes for enter / exit.
 * Shared by the overlay window and the RoomPage live preview (no Tauri deps).
 */
export function animationClass(animation: string, exiting: boolean): string {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (exiting) {
    if (reduced) return 'overlay-anim animate-overlay-fade-out';
    if (animation === 'zoom' || animation === 'pop') {
      return 'overlay-anim animate-overlay-zoom-out';
    }
    return 'overlay-anim animate-overlay-fade-out';
  }

  if (reduced) return 'overlay-anim animate-overlay-fade';

  switch (animation) {
    case 'zoom':
      return 'overlay-anim animate-overlay-zoom';
    case 'bounce':
      return 'overlay-anim animate-overlay-bounce';
    case 'slide_left':
      return 'overlay-anim animate-overlay-slide-left';
    case 'slide_right':
      return 'overlay-anim animate-overlay-slide-right';
    case 'slide_up':
      return 'overlay-anim animate-overlay-slide-up';
    case 'slide_down':
      return 'overlay-anim animate-overlay-slide-down';
    case 'shake':
      return 'overlay-anim animate-overlay-shake';
    case 'pop':
      return 'overlay-anim animate-overlay-pop';
    case 'none':
      return '';
    default:
      return 'overlay-anim animate-overlay-fade';
  }
}
