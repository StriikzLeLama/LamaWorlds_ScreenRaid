import type { Animation, OverlayType } from '../services/pranks';

export interface RaidPack {
  id: string;
  label: string;
  description: string;
  overlayType: OverlayType;
  animation: Animation;
  durationMs: number;
  sfx: 'none' | 'pop' | 'whoosh';
  text?: string;
  /** Opens GIF selector when true. */
  needsGif?: boolean;
  bomb?: boolean;
}

/** Preset combos: one click sets composer fields. */
export const RAID_PACKS: RaidPack[] = [
  {
    id: 'hello-text',
    label: 'Hello pop',
    description: 'Texte + pop + son',
    overlayType: 'text',
    animation: 'pop',
    durationMs: 4000,
    sfx: 'pop',
    text: 'Hello from ScreenRaid!',
  },
  {
    id: 'shake-alert',
    label: 'Shake alert',
    description: 'Texte secoué',
    overlayType: 'text',
    animation: 'shake',
    durationMs: 3500,
    sfx: 'whoosh',
    text: '⚠ RAID INCOMING',
  },
  {
    id: 'gif-bounce',
    label: 'GIF bounce',
    description: 'Choisir un GIF + bounce',
    overlayType: 'gif',
    animation: 'bounce',
    durationMs: 6000,
    sfx: 'pop',
    needsGif: true,
  },
  {
    id: 'gif-bomb',
    label: 'GIF bomb',
    description: '5 GIFs en rafale',
    overlayType: 'gif',
    animation: 'zoom',
    durationMs: 4500,
    sfx: 'whoosh',
    needsGif: true,
    bomb: true,
  },
  {
    id: 'slide-meme',
    label: 'Slide meme',
    description: 'GIF qui slide',
    overlayType: 'gif',
    animation: 'slide_left',
    durationMs: 5000,
    sfx: 'whoosh',
    needsGif: true,
  },
];
