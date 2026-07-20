import { animationClass } from '../overlay/utils';
import type { Animation } from '../services/pranks';

interface Props {
  animation: Animation;
  label?: string;
  textColor?: string;
  bgColor?: string;
  accentColor?: string;
}

/** Live miniature of the entrance animation before sending a raid. */
export function AnimationPreview({
  animation,
  label = 'Preview',
  textColor = '#f5f5f5',
  bgColor = 'rgba(20,20,22,0.94)',
  accentColor = '#f97316',
}: Props) {
  const anim = animationClass(animation, false);

  return (
    <div className="overflow-hidden rounded-xl border border-raid-border bg-raid-bg/80 p-4">
      <p className="mb-3 text-xs text-raid-text-secondary">Aperçu animation</p>
      <div className="relative flex h-28 items-center justify-center">
        <div key={animation} className={anim}>
          <div
            className="rounded-xl px-5 py-3 text-center"
            style={{
              background: bgColor,
              border: `2px solid ${accentColor}`,
              color: textColor,
            }}
          >
            <p className="text-[10px] uppercase tracking-wide" style={{ color: accentColor }}>
              Raid
            </p>
            <p className="text-sm font-bold">{label}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
