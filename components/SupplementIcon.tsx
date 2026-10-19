// components/SupplementIcon.tsx — the supplements icon: a supplement tub with a leaf on its label
// (not a pill, which reads as medicine).
import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

export function SupplementIcon({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Lid */}
      <Rect x={6.5} y={2} width={11} height={4} rx={1.3} fill={color} />
      {/* Tub */}
      <Path
        d="M5.5 8.6A2 2 0 0 1 7.5 6.6h9a2 2 0 0 1 2 2v10.4a2.6 2.6 0 0 1-2.6 2.6H8.1a2.6 2.6 0 0 1-2.6-2.6V8.6z"
        stroke={color} strokeWidth={1.8} fill={color} fillOpacity={0.16}
      />
      {/* Leaf on the label */}
      <Path
        d="M15.2 10.4c-3.6 0-6.1 1.9-6.1 5.1 0 .5.1 1 .2 1.4.8-1.8 2.3-3 3.9-3.5-1.5.8-2.7 2-3.5 3.6.4.1.8.1 1.2.1 3.1 0 4.3-2.7 4.3-6.7z"
        fill={color}
      />
    </Svg>
  );
}
