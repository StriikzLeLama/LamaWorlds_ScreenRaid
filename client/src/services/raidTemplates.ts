import type { Animation, OverlayType } from './pranks';

export interface RaidTemplate {
  id: string;
  name: string;
  roomId: string;
  overlayType: OverlayType;
  textContent: string;
  mediaId: string;
  durationMs: number;
  animation: Animation;
  volume: number;
  sfx: 'none' | 'pop' | 'whoosh';
  opacity: number;
  scale?: number;
  raidBomb: boolean;
  multiMonitorBomb: boolean;
  textColor: string;
  bgColor: string;
  accentColor: string;
  fontFamily: string;
  createdAt: string;
}

const KEY = 'screenraid-raid-templates';

export function loadRaidTemplates(roomId: string): RaidTemplate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as RaidTemplate[];
    if (!Array.isArray(all)) return [];
    return all.filter((t) => t.roomId === roomId);
  } catch {
    return [];
  }
}

function saveAll(items: RaidTemplate[]): void {
  localStorage.setItem(KEY, JSON.stringify(items.slice(0, 80)));
}

export function saveRaidTemplate(
  template: Omit<RaidTemplate, 'id' | 'createdAt'>,
): RaidTemplate[] {
  const raw = localStorage.getItem(KEY);
  let all: RaidTemplate[] = [];
  try {
    all = raw ? (JSON.parse(raw) as RaidTemplate[]) : [];
    if (!Array.isArray(all)) all = [];
  } catch {
    all = [];
  }
  const next: RaidTemplate = {
    ...template,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  all = [next, ...all.filter((t) => !(t.roomId === template.roomId && t.name === template.name))];
  saveAll(all);
  return all.filter((t) => t.roomId === template.roomId);
}

export function deleteRaidTemplate(roomId: string, templateId: string): RaidTemplate[] {
  const raw = localStorage.getItem(KEY);
  let all: RaidTemplate[] = [];
  try {
    all = raw ? (JSON.parse(raw) as RaidTemplate[]) : [];
    if (!Array.isArray(all)) all = [];
  } catch {
    all = [];
  }
  all = all.filter((t) => t.id !== templateId);
  saveAll(all);
  return all.filter((t) => t.roomId === roomId);
}
