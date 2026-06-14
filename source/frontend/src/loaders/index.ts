// Barrel for loaders (SMF/GLB/FBX/coord).
// Promotes modularity and cleaner imports for consumers (e.g. hook, tests, future utils).
// Re-exports main public API; keeps specific imports possible for tree-shaking.

export * from './smf';
export * from './glb';
export * from './fbx';
export * from './obj';
export * from './coord';
export * from './threeToSmf';

// Note: coord.test.ts is test-only, not re-exported here.
