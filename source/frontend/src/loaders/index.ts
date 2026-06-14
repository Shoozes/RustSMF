// Barrel for loaders (SMF/GLB/FBX/coord).
// Promotes modularity and cleaner imports for consumers (e.g. hook, tests, future utils).
// Re-exports main public API; keeps specific imports possible for tree-shaking.

export * from './smf';
export * from './glb';
export * from './fbx';
export * from './obj';
export * from './coord';
export * from './threeToSmf';
export { bytesToArrayBuffer } from './smfBinary';

// Note: coord.test.ts and smfBinary (BinaryReader/Writer impl details) are not fully re-exported here.
// bytesToArrayBuffer is the shared util for safe Uint8Array->ArrayBuffer (used by loaders, hooks, tauri bridge).
// Specific imports from './smfBinary' remain possible for advanced/low-level use.
