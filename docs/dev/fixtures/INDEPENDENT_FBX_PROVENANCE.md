# Independent FBX compatibility fixture

`source/frontend/tests/fixtures/independent-fbx/independent_skinned.fbx` and its packed texture are original compatibility fixtures authored for RustSMF with Blender 5.0.0. They contain no third-party mesh, animation, or image source. The generation script is retained beside the fixture so the binary can be reproduced without relying on the Three.js FBX exporter used by the application.

The fixture intentionally exercises:

- an eight-vertex textured mesh with UVs;
- two weighted armature bones, `IndependentRoot` and `IndependentTip`;
- a keyed pose animation from frames 1 through 24; and
- Blender's binary FBX 7500 writer with packed image data.

Regenerate it only when the fixture contract changes:

```powershell
& '<Blender 5.0 executable>' --background --python source/frontend/tests/fixtures/independent-fbx/generate_fixture.py -- source/frontend/tests/fixtures/independent-fbx/independent_skinned.fbx
```

Validate both the committed source fixture and an app-exported FBX saved by the independent browser test:

```powershell
& '<Blender 5.0 executable>' --background --python source/frontend/tests/fixtures/independent-fbx/validate_fixture.py -- source/frontend/tests/fixtures/independent-fbx/independent_skinned.fbx
& '<Blender 5.0 executable>' --background --python source/frontend/tests/fixtures/independent-fbx/validate_fixture.py -- source/frontend/test-results/independent-skinned-roundtrip.fbx
```

The fixture is a test asset, not a product sample. Compatibility claims remain limited to the structure verified by RustSMF and Blender 5.0.0. Any new external target must be recorded with its version and result before the claim is widened.
