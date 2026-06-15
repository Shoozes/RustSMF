GameMaker 2025+ Working Manual (living notes, project style)

1) Naming Conventions (project style guide)
- Local vars: prefix with underscore to avoid built-ins like x/speed (e.g., var _i, _tmp).
  Example:
    var _loop = 0;
    repeat (10) { _loop++; }
- Instance/global vars: lowercase_with_underscores (e.g., player_health, global.score).
  Example:
    global.level = 1;
    player_health = 100;
- Macros/enums: ALL_CAPS_WITH_UNDERSCORES.
  Example:
    #macro GRAVITY 9.81
    enum STATE { IDLE, RUNNING }
- Helper functions: double underscore prefix (internal/private feel).
  Example:
    function __parse_data(_s) { return _s; }
- Function args: lowercase_with_underscores, leading underscore ok (e.g., _value).
  Example:
    function calc(_value) { return _value * 2; }
- Arrays: loop indices use i, j, k without underscore for readability.
  Example:
    for (var i = 0; i < array_length(arr); i++) arr[i] = 0;
- Avoid camelCase; prefer readability and consistency. Use macros for “big numbers” instead of scientific notation in code literals.

2) Garbage Collection (GC)
- GC-managed: structs, arrays, methods. When no references remain, they are collected automatically.
- Not GC-managed: buffers, surfaces, all ds_* types (lists, maps, grids, stacks, queues). You must destroy these manually.
- HTML5 target: the browser (JS) manages GC; explicit GC controls do not affect it.
- Controls & checks:
  - delete marks a variable reference as removed (helps GC).
  - gc_collect() can force a collection at frame-end; use sparingly.
  - gc_target_frame_time(microseconds) sets a per-frame budget for GC work.
  - gc_get_stats() returns diagnostic info (generations, counts).
  - weak_ref_create(value) / weak_ref_alive(ref) lets us observe if a struct has been collected.

Example (Create → Step → Clean Up):
  // Create
  controller = { tick: 0 };
  buff = buffer_create(1024, buffer_fixed, 1); // must be deleted manually

  // Step
  controller.tick++;
  if (keyboard_check_pressed(vk_f1)) gc_collect();

  // Clean Up
  delete controller;         // GC-managed
  buffer_delete(buff);       // manual free

3) Structs & Constructors
- Structs: literal objects { key: value }; access via dot; dynamic key via [$ "name"].
- Constructors: function Name(...) constructor { ... }; instantiate with new Name(...).
- Inheritance: function Child(...) : Parent(parent_args) constructor { ... } (single-inheritance).
- Static members in constructors share code/data across all instances (good for methods/lookup tables).
- Introspection helpers: variable_struct_get_names(s), variable_struct_exists(s, "field").

Example:
  function Vec2(_x = 0, _y = 0) constructor {
    x = _x;
    y = _y;
    static add = function(o) { x += o.x; y += o.y; };
  }

  function Vec3(_x = 0, _y = 0, _z = 0) : Vec2(_x, _y) constructor {
    z = _z;
  }

  var v = new Vec3(1,2,3);
  v.add(new Vec2(1,1)); // v => (2,3,3)
  var fields = variable_struct_get_names(v);

4) Arrays (2025 behavior)
- Arrays are reference types. Passing an array to a function and mutating it changes the original unless you make a copy first.
- Core ops: array_length, array_push, array_pop, array_insert, array_resize, array_copy, array_sort, array_shuffle.
- Performance: preallocate with array_create(size, value) to avoid repeated resizes; for “clear and refill,” assign a fresh array_create.
- Legacy CoW: only relevant if a legacy project option is enabled; otherwise treat arrays as normal references.

Example:
  function bump_all(_arr) {
    var n = array_length(_arr);
    for (var i = 0; i < n; i++) _arr[i] += 1; // mutates caller
  }

  var a = [1,2,3];
  bump_all(a); // a == [2,3,4]
  a = array_create(1000, 0); // preallocated reset

5) Accessors (lists, maps, grids, arrays, structs)
- DS list: list[| index]
- DS map:  map[? key]
- DS grid: grid[# x, y]
- Array:   arr[@ index] // mainly for legacy CoW patterns in chained access
- Struct:  st[$ "field"]
- Accessors can be chained across different container types.

Example:
  var data = [ ds_list_create(), ds_map_create() ];
  data[0][| 0] = ds_grid_create(4,4);
  data[0][| 0][# 2,3] = 99;
  data[1][? "meta"] = { ver: 1 };
  var ver = data[1][? "meta"][$ "ver"];
  // Cleanup
  ds_grid_destroy(data[0][| 0]);
  ds_list_destroy(data[0]);
  ds_map_destroy(data[1]);

6) Variables & Scope
- Local: var x; exists only within the function/event.
- Instance: x; fields on the current instance.
- Global: global.x; shared across the game.
- Static: static x = ...; stored on the function, persists across calls.
- Dynamic access: variable_instance_get/set(id, name), variable_global_get/set(name).
- Targeting other instances: with(id_or_object) { ... } or id.field.

Example:
  // Instance scope by default
  hp = (is_undefined(hp) ? 100 : hp);

  // Touch another instance
  if (instance_exists(obj_enemy)) {
    var e = instance_find(obj_enemy, 0);
    variable_instance_set(e, "stunned", true);
  }

  // Static
  function counter() {
    static c = 0;
    c++;
    return c;
  }

7) Matrix Functions (modern 3D transforms)
- Build transforms: matrix_build(x, y, z, rx, ry, rz, sx, sy, sz)
- Combine: matrix_multiply(a, b)
- Inverse: matrix_inverse(m) // undefined if non-invertible
- Apply: matrix_set(matrix_world/view/projection, m)
- Transform a point: matrix_transform_vertex(m, x, y, z [, w])
- Stack helpers: matrix_stack_push/pop/top/set_top/clear/is_empty

Example (Draw):
  var M = matrix_build(x, y, z, pitch, yaw, roll, 1,1,1);
  matrix_set(matrix_world, M);
  vertex_submit(vbuf, pr_trianglelist, -1);
  matrix_set(matrix_world, matrix_build_identity());

8) Data Structures vs Arrays
- Prefer arrays for general gameplay data: GC-managed, simple, fast iteration, easy 2D via arr[row][col].
- Use ds_* when their semantics/APIs help:
  - ds_map for heterogeneous keys
  - ds_grid for large fixed 2D data with grid helpers
  - ds_stack for LIFO, ds_queue for FIFO
- Always destroy ds_* when done.

Examples:
  // 2D numeric table via arrays
  var w = 64, h = 64;
  var grid = array_create(h);
  for (var j = 0; j < h; j++) grid[j] = array_create(w, 0);
  grid[10][20] = 1;

  // Map for heterogeneous keys
  var m = ds_map_create();
  m[? "name"] = "boss";
  m[? 42] = true;
  ds_map_destroy(m);

9) Pointers & References
- References: structs/arrays/methods are references and GC-managed; delete removes a reference from a variable.
- True pointers: returned by certain APIs (e.g., buffer_get_address). Do not use after the resource is destroyed.
- Sanity checks: buffer_exists(buffer_id). Treat 0 or pointer_null as “no pointer”.

Example:
  var b = buffer_create(256, buffer_fast, 1);
  var p = buffer_get_address(b);
  if (p != 0 && buffer_exists(b)) {
    // pass p to an extension
  }
  buffer_delete(b);

10) Modern 3D Rendering (replace legacy d3d_*)
- Pipeline: vertex_format_* → vertex_create_buffer/vertex_begin → vertex_* writes → vertex_end → shader_set → matrix_set → vertex_submit → shader_reset.
- GPU state: gpu_set_ztestenable, gpu_set_zwriteenable, gpu_set_cullmode as needed.
- vertex_freeze(vbuf) makes static buffers immutable and faster to submit.
- Always free GPU resources in Clean Up.

Example (Create → Draw → Clean Up):
  // Create
  vertex_format_begin();
  vertex_format_add_position_3d();
  vertex_format_add_color();
  fmt = vertex_format_end();

  vbuf = vertex_create_buffer();
  vertex_begin(vbuf, fmt);
  vertex_position_3d(vbuf, -1, -1, 0); vertex_color(vbuf, c_red, 1);
  vertex_position_3d(vbuf,  1, -1, 0); vertex_color(vbuf, c_green, 1);
  vertex_position_3d(vbuf,  0,  1, 0); vertex_color(vbuf, c_blue, 1);
  vertex_end(vbuf);
  vertex_freeze(vbuf);

  // Draw
  gpu_set_ztestenable(true);
  matrix_set(matrix_world, matrix_build(x,y,z, 0, current_time*0.05, 0, 1,1,1));
  vertex_submit(vbuf, pr_trianglelist, -1);
  matrix_set(matrix_world, matrix_build_identity());
  gpu_set_ztestenable(false);

  // Clean Up
  vertex_delete_buffer(vbuf);
  vertex_format_delete(fmt);

11) Error Handling
- try/catch/finally around risky calls (parsing, IO, extension calls).
- throw to raise your own errors.
- show_error(message, abort) for critical failures during development.

Example:
  try {
    var s = json_parse(raw);
    process(s);
  } catch (e) {
    show_debug_message("Load failed: " + string(e.message));
  }

12) Performance Notes
- Preallocate with array_create() to avoid repeated resizes.
- Cache array_length() in tight loops.
- Time with get_timer() or delta_time; compare changes scientifically.
- GC: set a reasonable budget (gc_target_frame_time); rely on incremental collection; only force gc_collect() when profiling/tools demand it.

Example:
  var t0 = get_timer();
  var n = array_length(a);
  for (var i = 0; i < n; i++) a[i] += 1;
  var ms = (get_timer() - t0) / 1000000.0;
  show_debug_message("Loop ms: " + string(ms));

13) Struct Initialization
- Initialize every field you plan to read later (avoid undefined).
- Verify with variable_struct_exists(s, "field") and inspect with variable_struct_get_names(s).

Example:
  function Actor() constructor {
    mat = matrix_build_identity();
    pos = [0,0,0];
    health = 100;
  }

  var a = new Actor();
  if (variable_struct_exists(a, "mat")) {
    // safe to use a.mat
  }

14) Project Structure and Single-Object Architecture
- Folders and groups in GameMaker are optional, managed by the IDE for organization; runtime uses a flat script list.
- Use a single object (e.g., obj_control or custom name with "control") to handle all events (Create, Step, Draw, Clean Up), serving as the game loop entry point.
- Use a single room (e.g., rm_main or custom name) as a minimal requirement for GameMaker to run; no layered room system.
- Favor constructors (e.g., MiniInstance, InvManager) over traditional objects for modularity and memory efficiency, reducing instance overhead.
- Asset prefixes:
  - sh_ for shaders (e.g., sh_object_basic_pbr).
  - spr_ for sprites (e.g., spr_blank).
  - fnt_ for fonts (e.g., fnt_n64).
  - rm_ for rooms (e.g., rm_main for single room).
  - obj_ for objects (optional, e.g., obj_control if named uniquely; skip if single object).
- Scripts use prefix_purpose.gml (e.g., mini_instances.gml, gltf_system.gml) without scr_ prefix; group in IDE (e.g., mini/, gltf/) for readability.

15) Code Architecture Layers
- **Global Layering**:
  - **Low-Level Foundations**: Core constructors (e.g., Vec2), utility structs, and system-agnostic helpers in core/ folder (e.g., core_helpers.gml).
  - **Global Reusable Functions**: Shared utilities (e.g., math ops, GC helpers) in core_functions.gml or similar, dynamically implemented.
  - **Facade Functions**: High-level APIs (e.g., inv_add_item) in system files, abstracting complexity.
- **Per-System Layering** (within prefix_system.gml files):
  - Macros (ALL_CAPS, e.g., #macro INV_MAX_SLOTS 100).
  - Globals (initialized in obj_control Create, e.g., global.inv_data).
  - Config/Constructors (e.g., InvConfig, MiniInstance).
  - Low-Level Functions (__prefix_internal, e.g., __inv_find_empty_slot).
  - Main Functions (e.g., inv_create, mini_update_matrix).
  - Facade Functions (e.g., inv_add, draw_all_instances).
  - Cleanup Functions (manual for non-GC resources, e.g., vertex_delete_buffer).
  - Shims if needed go to the bottom.
  - TODO: Comments if needed on the very bottom.

16) Naming Conventions Expansion
- **Scripts**: prefix_purpose.gml (e.g., inv_system.gml, mini_helpers.gml).
  - prefix_system.gml: Core system file (macros, constructors, main functions).
  - prefix_helpers.gml: Encapsulated utils (e.g., __mini_parse_data).
  - prefix_functions.gml: Global reusables (e.g., inv_draw); bundle in prefix_system.gml if system-specific.
  - prefix_debug.gml: Debug functions (e.g., inv_debug_log), gated by #macro DEV_MODE or similar. Good for quick and dirty test coding, no rules here, just make stuff, test it, run it, delete it later, or never, etc.
  - prefix_compat.gml: Legacy shims or API shim connections. (not so important, we usually delete this after a full refactor)
  - prefixa_prefixb_api.gml: System connectors (e.g., inv_eq_api.gml, inv_ as dominant).
  - prefix_purpose.gml: Specific sub-modules (e.g., inv_slots.gml).
- **Variables/Functions**: Follow manual (lowercase_with_underscores, _local vars, i/j/k for array indices).
- **Avoid**: CamelCase, scientific notation (use macros), decorative comments.
- Systems don't always need the entire list, if small enough, we simply keep it in prefix_system.gml.

17) Enums and Constants
- **Enums**: Global identifiers holding constant integer values, ideal for state machines or switch cases.
  - Syntax: enum <NAME> { <MEMBER> [= <VALUE>], ... }
  - Default numbering starts at 0; custom integers or expressions (using prior enums) are allowed.
  - Example:
    enum STATE {
      IDLE,
      RUNNING,
      JUMPING
    }
    enum LEVEL {
      EASY = 1,
      MEDIUM = 2 * EASY,
      HARD = 5
    }
  - Access with dot notation: var state = STATE.RUNNING;
  - Use in switch cases for type safety and readability:
    switch (current_state) {
      case STATE.IDLE: break;
      case STATE.RUNNING: speed += 1; break;
      case STATE.JUMPING: y -= 5; break;
    }
  - Notes:
    - Only integers (including expressions with prior enums) are valid.
    - Stored as int64s; is_real() returns false.
    - Cannot be modified post-creation.
    - Prefer enums over strings in switches to avoid runtime errors and improve performance.

- **Macros**: Global constant expressions, unchangeable at runtime, useful for configuration or repeated values.
  - Syntax: #macro <NAME> <VALUE>
  - Example:
    #macro MAX_HEALTH 100
    #macro COLOR make_colour_hsv(0, 255, 255)
  - Can include expressions (e.g., functions), but evaluate at compile time.
  - Configuration overrides: #macro ConfigName:NAME <VALUE> (e.g., #macro Android:AD_ID "com.example").
  - Avoid semicolons or equals signs; define in dedicated scripts for organization.

- **Built-in Constants**: Use as needed (e.g., pointer_null, undefined, infinity).
  - Equality behavior: NaN != NaN, undefined == undefined, infinity == infinity.

- **Type Considerations**: Refer to type tables for arithmetic operations (e.g., Real + Bool = Real, String + Real = Error).
  - Enums behave as integers in operations; use with care in arithmetic contexts. A lot more neat compared to strings, especially in switch/case. Also great for finite state machines.

18) GML ↔ DLL: Buffers, Pointers, and Quirks (GM 2024+)
GML external functions accept only reals (double) and strings. No native int/bool/struct types.
If a function has 4+ parameters, all must be real. For text or complex payloads, use buffers.
Pointers are passed as reals. Use buffer_get_address(buf) in GML; cast double→uintptr_t→void* in C/C++.
Strings are NUL-terminated C strings. Treat GML strings as UTF-8; convert in DLL for UTF-16 APIs.
Bitness and calling convention must match runner and definition. Build x64; use dll_cdecl or dll_stdcall to match export.
buffer_get_address returns aligned base pointer. Do not free or resize in DLL. Never write past buffer_get_size.
After buffer_delete or resize, any pointer to that buffer is invalid.
Usage Patterns

Input-only: GML writes bytes → pass (addr, size) → DLL reads → returns code/number.
In/out buffer: GML preallocates capacity → pass (addr, capacity) → DLL writes bytes → GML reads.
Strings: Prefer in/out buffer to avoid lifetime issues. Return const char* from stable storage only if needed.

Alignment, Packing, Endianness

Runners are little-endian. Match field order and endianness in C.
Choose buffer alignment for fields (1/2/4/8/16). Use 8 for 64-bit types.
Avoid C struct padding. Write explicit fields or use packed layouts for binary protocols.

Pitfalls to Avoid

Wrong convention → corrupted args/stack or silent failure.
x86 DLL with x64 runner → load failure.
Using pointers after buffer_delete/resize → crashes/UB.
Writing past size → out-of-bounds error at runtime.
Returning stack strings → dangling pointer.
Casting double directly to void* without uintptr_t → truncation risk.

Numeric Marshaling Cheatsheet

GML buffer_u8/u16/u32/u64 → read as uint8_t/uint16_t/uint32_t/uint64_t.
GML buffer_s8/s16/s32/s64 → read as int8_t/int16_t/int32_t/int64_t.
GML buffer_f32/f64 → read as float/double.
Prefer fixed-width C types over int/long.

Sanity Checklist

x64 build, extern "C" __declspec(dllexport), correct convention.
Cast pointer reals via uintptr_t, not directly to void*.
Validate pointer and capacity on entry. Enforce bounds with buffer_get_size.
Do not free/resize GML memory in DLL. Document ownership.
For complex calls, use one buffer with version/opcode/lengths to avoid arg/string limits.
