// Web preview: no background location - the run screen records while open.
export type TrackMode = 'background' | 'foreground';

export async function startTrack(_ns: string, _run: string): Promise<TrackMode> {
  return 'foreground';
}

export async function stopTrack(): Promise<void> {}
