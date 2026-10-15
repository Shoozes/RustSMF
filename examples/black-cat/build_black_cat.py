"""Rebuild Sable's original rig, keys and GLB from its editable Blender geometry.

The finished geometry/texture is an image-guided Tripo Pro output, repaired in
Blender. No borrowed mesh, rig, texture or motion is distributed. Default input
is sable.blend; save geometry edits there, then rerun this recipe.
Copyright 2026 Shoozes. MIT license; see the repository LICENSE.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Quaternion, Vector


FPS = 30
METERS_PER_UNIT = .3
CLIPS = {"Idle": (3.0, True), "Walk": (1.2, True), "Run": (0.8, True), "Sit": (2.0, False)}
TAIL = [(0, .65, 1.12), (0, .89, 1.02), (0, 1.12, .88), (0, 1.34, .80), (0, 1.55, .82), (0, 1.68, .90)]
SPECS = {"Root": ((0, 0, 0), (0, .2, 0), None),
         "Pelvis": ((0, .32, 1.03), (0, 0, 1.06), "Root"),
         "Spine": ((0, 0, 1.06), (0, -.78, 1.12), "Pelvis"),
         "Neck": ((0, -.78, 1.12), (0, -1.18, 1.43), "Spine"),
         "Head": ((0, -1.18, 1.43), (0, -1.57, 1.43), "Neck")}
for i in range(5):
    SPECS[f"Tail{i + 1:02}"] = (TAIL[i], TAIL[i + 1], "Pelvis" if i == 0 else f"Tail{i:02}")
for side, sign in [("L", 1), ("R", -1)]:
    fore = [(sign*.24, -.82, 1.10), (sign*.24, -.72, .62), (sign*.268, -1.01, .10), (sign*.268, -1.22, .08)]
    hind = [(sign*.32, .28, 1.02), (sign*.34, .05, .65), (sign*.45, .46, .32), (sign*.50, .42, .10), (sign*.50, .19, .09)]
    for family, points, names, parent in [("Fore", fore, ["Upper", "Lower", "Paw"], "Spine"), ("Hind", hind, ["Upper", "Lower", "Foot", "Paw"], "Pelvis")]:
        for i, name in enumerate(names):
            bone = f"{family}{name}_{side}"
            SPECS[bone] = (points[i], points[i + 1], parent)
            parent = bone


def material(name, color, roughness=.6):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular IOR Level"].default_value = .32
    return mat


def active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def clamp(value):
    return max(0.0, min(1.0, value))


def components(mesh):
    neighbors = [set() for _ in mesh.vertices]
    for edge in mesh.edges:
        a,b = edge.vertices; neighbors[a].add(b); neighbors[b].add(a)
    remaining = set(range(len(mesh.vertices))); groups = []
    while remaining:
        pending=[remaining.pop()]; group=set(pending)
        while pending:
            for other in neighbors[pending.pop()]:
                if other in remaining:
                    remaining.remove(other); pending.append(other); group.add(other)
        groups.append(group)
    return sorted(groups, key=len, reverse=True)


def read_geometry(args):
    path = (args.source_blend or Path(__file__).with_name("sable.blend")).resolve()
    bpy.ops.wm.open_mainfile(filepath=str(path))
    bpy.data.use_autopack = False
    if bpy.data.libraries: raise ValueError("Pack linked geometry before rebuilding Sable")
    obj=bpy.data.objects["Sable_Cat"]
    obj.parent=None; obj.modifiers.clear();obj.matrix_world=Matrix.Identity(4)
    for other in list(bpy.data.objects):
        if other != obj: bpy.data.objects.remove(other,do_unlink=True)
    for action in list(bpy.data.actions): bpy.data.actions.remove(action,do_unlink=True)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    obj.name="Sable_Cat"; obj.data.name="SableGeometry"
    obj.parent=None; obj.modifiers.clear(); obj.animation_data_clear()
    bm=bmesh.new(); bm.from_mesh(obj.data)
    if bm.verts.layers.deform.active: bm.verts.layers.deform.remove(bm.verts.layers.deform.active)
    bm.to_mesh(obj.data); bm.free()
    obj.vertex_groups.clear()
    for mat in obj.data.materials:
        mat.name="Sable coat"; shader=mat.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value=.56; shader.inputs["Metallic"].default_value=0
        shader.inputs["Specular IOR Level"].default_value=.35
    for image in bpy.data.images:
        if image.source == 'FILE':
            if not image.packed_file or bytes(image.packed_file.data[:8]) != b'\x89PNG\r\n\x1a\n':
                raise ValueError("Pack the finished coat as PNG in the editable Blender scene")
            image.name='Sable_Coat.png'
            if image.filepath != '//Sable_Coat.png': image.filepath_raw='//Sable_Coat.png'
            for packed in image.packed_files:
                if packed.filepath != '//Sable_Coat.png': packed.filepath='//Sable_Coat.png'
    return obj


def bind_mesh(mesh, rig):
    body = components(mesh.data)[0]
    rig.data.bones['Root'].use_deform=False
    active(rig); mesh.select_set(True)
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    rig.data.bones['Root'].use_deform=True
    for name in SPECS:
        if not mesh.vertex_groups.get(name): mesh.vertex_groups.new(name=name)
    influences=[]
    for vertex in mesh.data.vertices:
        weights={mesh.vertex_groups[group.group].name:group.weight for group in vertex.groups if group.weight>0}
        if vertex.index not in body: weights={'Head':1}
        elif vertex.co.z < .18:
            family='Fore' if vertex.co.y < -.35 else 'Hind'; side='L' if vertex.co.x >= 0 else 'R'
            weights={f'{family}Paw_{side}':1}
        if not weights: raise ValueError(f'Unweighted vertex {vertex.index}')
        weights=dict(sorted(weights.items(),key=lambda item:item[1],reverse=True)[:4]); total=sum(weights.values())
        influences.append({name:w/total for name,w in weights.items()})
    neighbors=[set() for _ in mesh.data.vertices]
    for edge in mesh.data.edges:
        a,b=edge.vertices;neighbors[a].add(b);neighbors[b].add(a)
    for _ in range(2):
        previous=influences;influences=[]
        for vertex in mesh.data.vertices:
            index=vertex.index;weights=previous[index]
            if index in body and vertex.co.z > .18 and len(weights)>1 and neighbors[index]:
                weights={name:.45*weights.get(name,0)+.55*sum(previous[n].get(name,0) for n in neighbors[index])/len(neighbors[index]) for name in SPECS}
                weights=dict(sorted(weights.items(),key=lambda item:item[1],reverse=True)[:4])
                total=sum(weights.values());weights={name:w/total for name,w in weights.items() if w>0}
            influences.append(weights)
    for vertex in mesh.data.vertices:
        weights=influences[vertex.index]
        for group in mesh.vertex_groups: group.remove([vertex.index])
        for name,weight in weights.items(): mesh.vertex_groups[name].add([vertex.index],weight,"REPLACE")
    for polygon in mesh.data.polygons: polygon.use_smooth=True
    mesh.parent=rig
    modifier=next(modifier for modifier in mesh.modifiers if modifier.type=='ARMATURE');modifier.name="Original Sable rig";modifier.object=rig
    mesh["asset_id"]="SAMPLE-SABLE-001"
    mesh["license"]="MIT; Copyright 2026 Shoozes"
    mesh["source"]="Image-guided Tripo Pro mesh/texture, repaired in Blender; original rig and authored keys"
    return mesh


def make_rig():
    data = bpy.data.armatures.new("SableSkeleton")
    rig = bpy.data.objects.new("Sable", data); bpy.context.collection.objects.link(rig)
    active(rig); bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in SPECS.items():
        bone = data.edit_bones.new(name); bone.head = head; bone.tail = tail
        if parent:
            bone.parent = data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
    return rig


def set_absolute(rig, name, head, tail, fit_length=False):
    bone = rig.data.bones[name]
    rotation = (bone.tail_local-bone.head_local).rotation_difference(tail-head) @ bone.matrix_local.to_quaternion()
    scale=(tail-head).length/bone.length if fit_length else 1
    rig.pose.bones[name].matrix = Matrix.Translation(head) @ rotation.to_matrix().to_4x4() @ Matrix.Diagonal((1, scale, 1, 1))
    bpy.context.view_layer.update()


def solve_knee(head, target, a, b, pole):
    vector = target - head
    distance = max(abs(a-b) + 1e-5, min(a+b-1e-5, vector.length))
    direction = vector.normalized()
    plane = pole - direction * pole.dot(direction)
    plane.normalize()
    along = (a*a - b*b + distance*distance)/(2*distance)
    knee = head + direction*along + plane*math.sqrt(max(0, a*a-along*along))
    return knee, head + direction*distance


def foot_target(family, side, phase, clip, sit):
    rest = Vector(SPECS[f"{family}Paw_{side}"][0])
    # Baked local quaternion interpolation can dip the sole between fixed paw keys.
    # Reserve 0.3 mm for Run while retaining the root and stride trajectories.
    if clip == "Run": rest.z += .001
    if clip in ("Walk", "Run"):
        if clip == "Walk":
            offsets, duty, stride, lift = {("Fore", "L"): 0, ("Fore", "R"): .5, ("Hind", "L"): .75, ("Hind", "R"): .25}, .66, .28, .12
        else:
            offsets, duty, stride, lift = {("Fore", "L"): 0, ("Fore", "R"): .08, ("Hind", "L"): .52, ("Hind", "R"): .60}, .4, .45, .18
        p = (phase + offsets[(family, side)]) % 1
        if p <= duty:
            rest.y += stride*(p/duty - .5)
        else:
            swing = (p-duty)/(1-duty)
            rest.y += .5*stride*math.cos(math.pi*swing)
            rest.z += lift*math.sin(math.pi*swing)**2
    if family == "Hind":
        rest.y -= .68*sit
    return rest


def pose(rig, clip, phase):
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    p = phase
    sit = (clamp(p/.8)**2 * (3-2*clamp(p/.8))) if clip == "Sit" else 0
    bob = .007*(1-math.cos(math.tau*p)) if clip == "Idle" else .012*(1-math.cos(2*math.tau*p)) if clip == "Walk" else .035*(1-math.cos(math.tau*p)) if clip == "Run" else -.42*sit
    root_delta = Vector((0, -.02*sit, bob))
    rig.pose.bones["Root"].matrix = Matrix.Translation(root_delta) @ rig.data.bones["Root"].matrix_local
    rig.pose.bones["Pelvis"].rotation_quaternion = Quaternion((1, 0, 0), -.30*sit + (.035*math.sin(math.tau*p) if clip == "Run" else 0))
    rig.pose.bones["Spine"].rotation_quaternion = Quaternion((1, 0, 0), -.30*sit + (.06*math.sin(math.tau*p) if clip == "Run" else 0))
    rig.pose.bones["Neck"].rotation_quaternion = Quaternion((1, 0, 0), .20*sit)
    rig.pose.bones["Head"].rotation_quaternion = Quaternion((0, 1, 0), 0 if clip == "Sit" else (.045 if clip == "Idle" else .015)*math.sin(math.tau*p))
    for i in range(1, 6):
        angle = .16*sit if clip == "Sit" else (.055 if clip == "Idle" else .08)*math.sin(math.tau*p + (i-1)*.35)
        rig.pose.bones[f"Tail{i:02}"].rotation_quaternion = Quaternion((0, 0, 1), angle)
    bpy.context.view_layer.update()
    if clip == "Sit":
        pelvis_head = Vector(SPECS["Pelvis"][0]) + Vector((0, -.60*sit, -.64*sit))
        pelvis_tail = Vector(SPECS["Pelvis"][1]) + Vector((0, -.60*sit, -.64*sit))
        set_absolute(rig, "Pelvis", pelvis_head, pelvis_tail)
        chest = Vector(SPECS["Spine"][1])+Vector((0, -.20*sit, -.06*sit))
        neck_end = Vector(SPECS["Neck"][1])+Vector((0, .10*sit, -.05*sit))
        set_absolute(rig, "Spine", pelvis_tail, chest, fit_length=True)
        set_absolute(rig, "Neck", chest, neck_end, fit_length=True)
        set_absolute(rig, "Head", neck_end, neck_end+Vector(SPECS["Head"][1])-Vector(SPECS["Head"][0]))
    for side in ("L", "R"):
        for family in ("Fore", "Hind"):
            upper, lower = f"{family}Upper_{side}", f"{family}Lower_{side}"
            bone = rig.data.bones[upper]
            parent = rig.pose.bones[bone.parent.name]
            head = parent.matrix @ bone.parent.matrix_local.inverted() @ bone.head_local
            ankle = foot_target(family, side, p, clip, sit)
            offset = (Vector(SPECS[f"HindFoot_{side}"][0])-Vector(SPECS[f"HindPaw_{side}"][0])) if family == "Hind" else Vector((0, 0, 0))
            target = ankle + offset
            knee, target = solve_knee(head, target, rig.data.bones[upper].length, rig.data.bones[lower].length, Vector((0, -1 if family == "Hind" else 1, 0)))
            set_absolute(rig, upper, head, knee); set_absolute(rig, lower, knee, target)
            if family == "Hind":
                ankle = target-offset
                set_absolute(rig, f"HindFoot_{side}", target, ankle)
            else:
                ankle = target
            paw = f"{family}Paw_{side}"
            vector = Vector(SPECS[paw][1])-Vector(SPECS[paw][0])
            set_absolute(rig, paw, ankle, ankle+vector)


def fcurves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for slot in action.slots:
                bag = strip.channelbag(slot)
                if bag:
                    yield from bag.fcurves


def animate(rig):
    rig.animation_data_create()
    actions = {}
    for name, (duration, loop) in CLIPS.items():
        rig.animation_data.action = bpy.data.actions.new(name)
        action = rig.animation_data.action
        for frame in range(round(duration*FPS)+1):
            bpy.context.scene.frame_set(frame)
            pose(rig, name, frame/(duration*FPS))
            for bone in rig.pose.bones:
                bone.keyframe_insert("location", frame=frame, group=bone.name)
                bone.keyframe_insert("rotation_quaternion", frame=frame, group=bone.name)
                bone.keyframe_insert("scale", frame=frame, group=bone.name)
        for curve in fcurves(action):
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"
        action.use_fake_user = True
        action["loop"] = loop
        action["duration_seconds"] = duration
        actions[name] = action
    rig.animation_data.action = actions["Idle"]
    bpy.context.scene.frame_start = 0; bpy.context.scene.frame_end = 90
    bpy.context.scene.frame_set(0)
    return actions


def topology(mesh, weld=False):
    bm = bmesh.new(); bm.from_mesh(mesh)
    if weld:
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    boundary = sum(edge.is_boundary for edge in bm.edges)
    non_manifold = sum(not edge.is_manifold for edge in bm.edges)
    remaining = set(bm.verts); components = 0
    while remaining:
        components += 1; pending = [remaining.pop()]
        while pending:
            vertex = pending.pop()
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other in remaining:
                    remaining.remove(other); pending.append(other)
    result = {"vertices": len(bm.verts), "triangles": sum(len(face.verts)-2 for face in bm.faces), "components": components, "boundary_edges": boundary, "non_manifold_edges": non_manifold}
    bm.free()
    return result


def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z", "Y").to_euler()


def studio():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 800; scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.world.color = (.06, .06, .06)
    scene.view_settings.view_transform = "AgX"
    ground = material("Studio only", (.13, .15, .18), .85)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, 0))
    bpy.context.object.name = "Studio floor"; bpy.context.object.data.materials.append(ground)
    for name, position, energy, size in [("Key", (-3, -4, 6), 300, 4), ("Rim", (3, 2, 4), 380, 3), ("Fill", (3, -3, 3), 180, 4)]:
        light = bpy.data.lights.new(name, "AREA"); light.energy = energy*METERS_PER_UNIT**2; light.shape = "DISK"; light.size = size*METERS_PER_UNIT
        obj = bpy.data.objects.new(name, light); bpy.context.collection.objects.link(obj); obj.location = Vector(position)*METERS_PER_UNIT; aim(obj, (0, 0, METERS_PER_UNIT))
    camera = bpy.data.cameras.new("Review camera"); obj = bpy.data.objects.new("Review camera", camera); bpy.context.collection.objects.link(obj)
    scene.camera = obj; camera.type = "ORTHO"; camera.ortho_scale = 4.15*METERS_PER_UNIT
    obj.location = Vector((3, -4, 2.6))*METERS_PER_UNIT; aim(obj, Vector((0, .03, .92))*METERS_PER_UNIT)
    return obj


def review_asset(rig, mesh, actions, camera, directory, glb_hash):
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    samples, captures = [], []
    for name, (duration, _) in CLIPS.items():
        rig.animation_data.action = actions[name]
        for half_frame in range(round(duration*FPS*2)+1):
            frame=half_frame/2
            scene.frame_set(int(frame), subframe=frame-int(frame)); bpy.context.view_layer.update()
            evaluated = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            data = evaluated.to_mesh()
            points = [evaluated.matrix_world @ vertex.co for vertex in data.vertices]
            samples.append({"clip": name, "time": frame/FPS, "minimum_floor_m": min(v.z for v in points),
                            "paws_m": {bone: list(rig.matrix_world @ rig.pose.bones[bone].head) for bone in ["ForePaw_L", "ForePaw_R", "HindPaw_L", "HindPaw_R"]}})
            evaluated.to_mesh_clear()
    views = {"front": (0, -5, 1), "left": (5, 0, 1), "right": (-5, 0, 1), "back": (0, 5, 1)}
    for clip, time, tag in [(None, 0, "rest"), ("Walk", .9, "walk-lift"), ("Run", 17/30, "run-lift"), ("Sit", 1, "sit-mid"), ("Sit", 2, "sit-held")]:
        rig.animation_data.action = actions.get(clip)
        if clip is None:
            for bone in rig.pose.bones:
                bone.matrix_basis = Matrix.Identity(4)
        scene.frame_set(round(time*FPS)); bpy.context.view_layer.update()
        for view, position in views.items():
            camera.location = Vector(position)*METERS_PER_UNIT; aim(camera, Vector((0, .03, .92))*METERS_PER_UNIT)
            name = f"{tag}-{view}.png"; scene.render.filepath = str(directory / name); bpy.ops.render.render(write_still=True)
            captures.append({"path": name, "clip": clip, "time": time, "view": view})
    camera.location = Vector((3, -4, 2.6))*METERS_PER_UNIT; aim(camera, Vector((0, .03, .92))*METERS_PER_UNIT)
    for name, time in [(None, 0), ("Idle", 1.5), ("Walk", .3), ("Run", .2), ("Sit", 2.0)]:
        rig.animation_data.action = actions.get(name)
        if name is None:
            for bone in rig.pose.bones:
                bone.matrix_basis = Matrix.Identity(4)
        scene.frame_set(round(time*FPS)); bpy.context.view_layer.update()
        filename = (name.lower() if name else "rest") + "-beauty.png"
        scene.render.filepath = str(directory / filename); bpy.ops.render.render(write_still=True)
        captures.append({"path": filename, "clip": name, "time": time, "view": "beauty"})
    report = {"source_glb_sha256": glb_hash, "camera_span_m": 4.15*METERS_PER_UNIT, "floor": "Blender Z=0; glTF Y=0",
              "registration": "Fixed world cameras and floor; no pose normalization or registration that hides root travel", "samples": samples, "captures": captures}
    (directory / "review.json").write_text(json.dumps(report, separators=(",", ":"))+"\n", encoding="utf8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--review-dir", type=Path)
    parser.add_argument("--source-blend", type=Path)
    parser.add_argument("--render", action="store_true")
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    output = args.output_dir.resolve(); output.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    mesh = read_geometry(args)
    scene = bpy.context.scene; scene.render.fps = FPS; scene.unit_settings.system = "METRIC"
    body_indices = components(mesh.data)[0]
    body_mesh=mesh.data.copy(); bm=bmesh.new(); bm.from_mesh(body_mesh); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in body_indices], context="VERTS")
    bm.to_mesh(body_mesh); bm.free()
    main_topology=topology(body_mesh); welded_body=topology(body_mesh,weld=True); bpy.data.meshes.remove(body_mesh)
    rig = make_rig(); mesh = bind_mesh(mesh, rig)
    rig.scale = (METERS_PER_UNIT,)*3
    actions = animate(rig)
    camera = studio()
    # Keep the editable file at a neutral standing pose; studio objects never enter the GLB.
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    scene.frame_set(0); bpy.context.view_layer.update()
    active(mesh); rig.select_set(True)
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_distance = 3.8
            area.spaces.active.region_3d.view_location = (0, 0, 1)
    bpy.ops.wm.save_as_mainfile(filepath=str(output / "sable.blend"), compress=True, relative_remap=False)
    bpy.ops.export_scene.gltf(filepath=str(output / "sable.glb"), export_format="GLB", use_selection=True,
                             export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
                             export_frame_range=False, export_skins=True, export_yup=True, export_extras=True)
    manifest = {"schema": "rustsmf.original-asset.v1", "id": "SAMPLE-SABLE-001", "name": "Sable", "license": "MIT", "copyright": "2026 Shoozes",
                "source": "Original image-guided design; Tripo Pro mesh/texture repaired in Blender; original rig and authored keys",
                "provenance": {"image": "CAT-IMAGE-002", "draft": "CAT-TRIPO-002", "generated": "2026-10-15", "entitlement": "Pro observed for this generation", "rights": "Tripo Terms 5.2.2 paid-user output rights; distributed by Shoozes under MIT", "terms": "https://www.tripo3d.ai/terms", "reference": "REF-FOX-001 pose/framing only; no borrowed model, rig, texture or motion included"},
                "generator": {"path": Path(__file__).name, "sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},
                "blender": bpy.app.version_string, "fps": FPS, "units": "meters", "authoring_unit_meters": METERS_PER_UNIT, "blender_front": "-Y", "gltf_up": "+Y", "gltf_front": "+Z",
                "joints": list(SPECS), "clips": [{"name": name, "duration": duration, "loop": loop, "in_place": True} for name, (duration, loop) in CLIPS.items()],
                "topology": {"main_connected_body": main_topology, "welded_main_body": welded_body, "complete_mesh": topology(mesh.data), "intentional_components": "Two closed eye surfaces attached to Head; body, paws, ears and tail form one component."},
                "locomotion": {"Walk": {"forward": "+Z", "nominal_meters_per_cycle": .3*.28/.66}, "Run": {"forward": "+Z", "nominal_meters_per_cycle": .3*.45/.4}, "Sit": {"hold_from_seconds": 1.6, "loop": False}},
                "materials": [mat.name for mat in mesh.data.materials], "uv": "Original UV atlas preserved through patch repair; one embedded 1024x1024 PNG, packed in Blender to fit browser recovery",
                "files": {name: {"bytes": (output/name).stat().st_size, "sha256": hashlib.sha256((output/name).read_bytes()).hexdigest()} for name in ["sable.blend", "sable.glb"]}}
    (output / "asset.json").write_text(json.dumps(manifest, indent=2)+"\n", encoding="utf8")
    if args.render:
        review_asset(rig, mesh, actions, camera, (args.review_dir or output / "review").resolve(), manifest["files"]["sable.glb"]["sha256"])
    print("SABLE_RESULT " + json.dumps({"files": manifest["files"], "body": main_topology, "clips": manifest["clips"]}))


if __name__ == "__main__":
    main()
