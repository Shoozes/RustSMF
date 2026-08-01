import pathlib
import sys

import bpy


def input_path_from_args() -> pathlib.Path:
    try:
        separator = sys.argv.index("--")
        return pathlib.Path(sys.argv[separator + 1]).resolve()
    except (ValueError, IndexError) as error:
        raise SystemExit("Usage: blender --background --python validate_fixture.py -- INPUT.fbx") from error


def main() -> None:
    fbx_path = input_path_from_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=str(fbx_path), use_anim=True)

    meshes = [object_ for object_ in bpy.context.scene.objects if object_.type == "MESH"]
    armatures = [object_ for object_ in bpy.context.scene.objects if object_.type == "ARMATURE"]
    if len(meshes) != 1 or len(armatures) != 1:
        raise RuntimeError(f"expected one mesh and one armature, got {len(meshes)} and {len(armatures)}")
    mesh = meshes[0]
    armature = armatures[0]
    if len(mesh.vertex_groups) < 2:
        raise RuntimeError("expected at least two imported vertex groups")
    if len(armature.data.bones) != 2:
        raise RuntimeError(f"expected two imported bones, got {len(armature.data.bones)}")
    action = armature.animation_data.action if armature.animation_data else None
    if action is None:
        raise RuntimeError("expected imported armature animation curves")
    if hasattr(action, "fcurves"):
        curve_count = len(action.fcurves)
    else:
        curve_count = sum(
            len(channelbag.fcurves)
            for layer in action.layers
            for strip in layer.strips
            for channelbag in strip.channelbags
        )
    if curve_count == 0:
        raise RuntimeError("expected imported armature animation curves")
    textured_material = any(
        material.use_nodes
        and any(
            node.type == "TEX_IMAGE"
            and node.image is not None
            and node.image.packed_file is not None
            for node in material.node_tree.nodes
        )
        for slot in mesh.material_slots
        if (material := slot.material) is not None
    )
    if not textured_material:
        raise RuntimeError("expected a material connected to an embedded imported texture")
    print(
        f"Blender FBX validation passed: meshes={len(meshes)} bones={len(armature.data.bones)} "
        f"groups={len(mesh.vertex_groups)} fcurves={curve_count} "
        f"packed_images={sum(1 for image in bpy.data.images if image.packed_file)}"
    )


if __name__ == "__main__":
    main()
