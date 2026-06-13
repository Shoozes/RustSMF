# src/store

Lightweight React state slices (no zustand/redux to avoid new deps).

Current:
- `useModelSlice`: model root, skeleton, clips, and clear lifecycle.
- `usePlaybackSlice`: play/pause, scrub, clip selection, duration, and speed.
- `useUiSlice`: status, selected item, loading flag, and error banner state.

`useLoadModel` composes these slices and keeps `App.tsx` as a thin shell.

See docs/dev/APP_STATE.md and modularity group in summary_bank.
