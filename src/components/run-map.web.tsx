// Web build (previews in a browser): same map page in an iframe.
import { createElement, useEffect, useMemo, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';

import { type MapPoint, type MapPosition, mapHtml } from './map-html';

export type { MapPoint, MapPosition };

export function RunMap({
  points,
  me,
  selected,
  onSelect,
  style,
}: {
  points: MapPoint[];
  me?: MapPosition | null;
  selected?: string | null;
  onSelect?: (id: string) => void;
  style?: ViewStyle;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => mapHtml(points, selected), []); // eslint-disable-line react-hooks/exhaustive-deps
  const post = (msg: object) => ref.current?.contentWindow?.postMessage(JSON.stringify(msg), '*');

  useEffect(() => {
    post({ type: 'points', points, selected });
  }, [points, selected]);

  useEffect(() => {
    if (me) post({ type: 'me', ...me });
  }, [me]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'select') onSelect?.(m.id);
        if (m.type === 'ready') {
          post({ type: 'points', points, selected });
          if (me) post({ type: 'me', ...me });
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#1d2a22' }, style]}>
      {createElement('iframe', {
        ref,
        srcDoc: html,
        title: 'Run map',
        style: { border: 0, width: '100%', height: '100%' },
      })}
    </View>
  );
}
