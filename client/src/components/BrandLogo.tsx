interface BrandLogoProps {
  /** Pixel size of the mark (square). */
  size?: number;
  /** Show “ScreenRaid” / product name next to the mark. */
  withWordmark?: boolean;
  /** Optional subtitle under the wordmark. */
  subtitle?: string;
  className?: string;
}

/**
 * LamaWorlds brand mark used in sidebars, title bar, and auth screens.
 * Assets live in /public (served as /logo.png etc.).
 */
export function BrandLogo({
  size = 32,
  withWordmark = false,
  subtitle,
  className = '',
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img
        src="/logo.png"
        alt="LamaWorlds"
        width={size}
        height={size}
        className="shrink-0 rounded-xl object-cover"
        draggable={false}
      />
      {withWordmark && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-raid-text">
            ScreenRaid
          </p>
          {subtitle ? (
            <p className="truncate text-[11px] leading-tight text-raid-text-secondary">
              {subtitle}
            </p>
          ) : (
            <p className="truncate text-[11px] leading-tight text-raid-text-secondary">
              by LamaWorlds
            </p>
          )}
        </div>
      )}
    </div>
  );
}
