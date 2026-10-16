import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

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
  const ref = useRef<WebView>(null);
  // Build the page once; later changes go in as messages so the map keeps its view.
  const html = useMemo(() => mapHtml(points, selected), []); // eslint-disable-line react-hooks/exhaustive-deps

  const post = (msg: object) => ref.current?.injectJavaScript(`window.upande && (${inject(msg)});true;`);

  useEffect(() => {
    post({ type: 'points', points, selected });
  }, [points, selected]);

  useEffect(() => {
    if (me) post({ type: 'me', ...me });
  }, [me]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === 'select') onSelect?.(m.id);
      if (m.type === 'ready') {
        post({ type: 'points', points, selected });
        if (me) post({ type: 'me', ...me });
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      <WebView ref={ref} originWhitelist={['*']} source={{ html }} onMessage={onMessage} style={styles.web} />
    </View>
  );
}

function inject(msg: any): string {
  if (msg.type === 'me') return `window.upande.me(${msg.lat},${msg.lon},${msg.accuracy ?? 'null'})`;
  return `window.upande.draw(${JSON.stringify(msg.points)},${JSON.stringify(msg.selected ?? null)})`;
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#1d2a22' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
