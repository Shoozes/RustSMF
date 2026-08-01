import math
import pathlib
import sys

import bpy


def output_path_from_args() -> pathlib.Path:
    try:
        separator = sys.argv.index("--")
        return pathlib.Path(sys.argv[separator + 1]).resolve()
    except (ValueError, IndexError) as error:
        raise SystemExit("Usage: blender --background --python generate_fixture.py -- OUTPUT.fbx") from error


def make_texture(texture_path: pathlib.Path) -> bpy.types.Image:
    image = bpy.data.images.new("IndependentFBXTexture", width=4, height=4, alpha=True)
    pixels = []
    for y in range(4):
        for x in range(4):
            checker = (x + y) % 2 == 0
            pixels.extend((0.08 if checker else 0.75, 0.55 if checker else 0.16, 0.9 if checker else 0.22, 1.0))
    image.pixels = pixels
    image.filepath_raw = str(texture_path)
    image.file_format = "PNG"
    image.save()
    return image


def make_material(image: bpy.types.Image) -> bpy.types.Material:
    material = bpy.data.materials.new("IndependentFBXMaterial")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError("Blender did not create a Principled BSDF node")
    texture = nodes.new("ShaderNodeTexImage")
    texture.name = "IndependentFBXTextureNode"
    texture.image = image
    links.new(texture.outputs["Color"], principled.inputs["Base Color"])
    return material


def make_mesh(material: bpy.types.Material) -> bpy.types.Object:
    vertices = [
        (-0.5, 0.0, -0.25),
        (0.5, 0.0, -0.25),
        (0.5, 0.0, 0.25),
        (-0.5, 0.0, 0.25),
        (-0.5, 1.5, -0.25),
        (0.5, 1.5, -0.25),
        (0.5, 1.5, 0.25),
        (-0.5, 1.5, 0.25),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (4, 0, 3, 7),
    ]
    mesh_data = bpy.data.meshes.new("IndependentFBXMesh")
    mesh_data.from_pydata(vertices, [], faces)
    mesh_data.update()
    mesh_data.materials.append(material)

    uv_layer = mesh_data.uv_layers.new(name="UVMap")
    for polygon in mesh_data.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh_data.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = (0.0 if vertex % 2 == 0 else 1.0, 0.0 if vertex < 4 else 1.0)

    mesh_object = bpy.data.objects.new("IndependentSkinnedMesh", mesh_data)
    bpy.context.scene.collection.objects.link(mesh_object)
    return mesh_object


def make_armature(mesh_object: bpy.types.Object) -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("IndependentFBXRig")
    armature_object = bpy.data.objects.new("IndependentFBXRig", armature_data)
    bpy.context.scene.collection.objects.link(armature_object)
    bpy.context.view_layer.objects.active = armature_object
    armature_object.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    root = armature_data.edit_bones.new("IndependentRoot")
    root.head = (0.0, 0.0, 0.0)
    root.tail = (0.0, 0.75, 0.0)
    tip = armature_data.edit_bones.new("IndependentTip")
    tip.head = (0.0, 0.75, 0.0)
    tip.tail = (0.0, 1.5, 0.0)
    tip.parent = root
    bpy.ops.object.mode_set(mode="OBJECT")
    armature_object.select_set(False)

    root_group = mesh_object.vertex_groups.new(name="IndependentRoot")
    tip_group = mesh_object.vertex_groups.new(name="IndependentTip")
    root_group.add([0, 1, 2, 3], 1.0, "REPLACE")
    tip_group.add([4, 5, 6, 7], 1.0, "REPLACE")
    modifier = mesh_object.modifiers.new(name="IndependentFBXArmature", type="ARMATURE")
    modifier.object = armature_object
    mesh_object.parent = armature_object

    bpy.context.view_layer.objects.active = armature_object
    armature_object.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    root_pose = armature_object.pose.bones["IndependentRoot"]
    tip_pose = armature_object.pose.bones["IndependentTip"]
    root_pose.rotation_mode = "XYZ"
    tip_pose.rotation_mode = "XYZ"
    bpy.context.scene.frame_set(1)
    root_pose.rotation_euler = (0.0, 0.0, 0.0)
    tip_pose.rotation_euler = (0.0, 0.0, 0.0)
    root_pose.keyframe_insert(data_path="rotation_euler", frame=1)
    tip_pose.keyframe_insert(data_path="rotation_euler", frame=1)
    bpy.context.scene.frame_set(24)
    root_pose.rotation_euler = (0.0, math.radians(8.0), 0.0)
    tip_pose.rotation_euler = (0.0, 0.0, math.radians(32.0))
    root_pose.keyframe_insert(data_path="rotation_euler", frame=24)
    tip_pose.keyframe_insert(data_path="rotation_euler", frame=24)
    bpy.ops.object.mode_set(mode="OBJECT")
    return armature_object


def main() -> None:
    fbx_path = output_path_from_args()
    fbx_path.parent.mkdir(parents=True, exist_ok=True)
    texture_path = fbx_path.with_name("independent_skinned_texture.png")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = 24
    scene.render.fps = 24
    image = make_texture(texture_path)
    material = make_material(image)
    mesh_object = make_mesh(material)
    armature_object = make_armature(mesh_object)
    bpy.context.view_layer.objects.active = armature_object
    armature_object.select_set(True)
    mesh_object.select_set(True)
    scene.frame_set(1)
    bpy.ops.export_scene.fbx(
        filepath=str(fbx_path),
        use_selection=True,
        object_types={"ARMATURE", "MESH"},
        add_leaf_bones=False,
        apply_unit_scale=True,
        axis_forward="-Z",
        axis_up="Y",
        bake_anim=True,
        bake_anim_use_all_actions=False,
        bake_anim_use_nla_strips=False,
        bake_anim_step=1.0,
        bake_anim_simplify_factor=0.0,
        path_mode="COPY",
        embed_textures=True,
    )
    print(f"wrote {fbx_path} ({fbx_path.stat().st_size} bytes)")
    print(f"wrote {texture_path} ({texture_path.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
