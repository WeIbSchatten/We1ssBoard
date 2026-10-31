import { memo, useMemo } from 'react';

import { useTheme } from '@/hooks/useTheme';
import { BACKDROP_H, BACKDROP_W, backdropPaths, backdropStrength } from '@/theme/backdrops';

// The preset's drawing behind every page; inks are CSS variables, so a theme switch repaints it.
function PanelBackdrop() {
  const { background, backgroundOpacity, mode } = useTheme();
  const paths = useMemo(
    () => backdropPaths(background, backdropStrength(mode, backgroundOpacity)),
    [background, backgroundOpacity, mode],
  );
  if (paths.length === 0) return null;
  return (
    <svg
      className="panel-backdrop"
      viewBox={`0 0 ${BACKDROP_W} ${BACKDROP_H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      data-backdrop={background}
    >
      {paths.map((p, i) => (
        <path key={i} d={p.d} style={p.style} />
      ))}
    </svg>
  );
}

export default memo(PanelBackdrop);
