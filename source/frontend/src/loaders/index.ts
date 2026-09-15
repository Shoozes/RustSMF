// Barrel for loaders (SMF/GLB/FBX/DAE/coord).
// Promotes modularity and cleaner imports for hooks, tests, and shared utilities.
// Re-exports main public API; keeps specific imports possible for tree-shaking.

export * from './smf';
export * from './smfData';
export * from './glb';
export * from './fbx';
export * from './dae';
export * from './obj';
export * from './coord';
export * from './smfDiagnostics';
export * from './smfSemantics';
export * from './threeToSmf';
export { bytesToArrayBuffer, BinaryReader, BinaryWriter } from './smfBinary';

// bytesToArrayBuffer plus BinaryReader/BinaryWriter are exported here for direct consumers
// and test helpers that need a single, shared low-level binary contract.
