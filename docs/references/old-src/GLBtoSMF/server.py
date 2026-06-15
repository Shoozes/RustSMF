import os
import json
from flask import Flask, send_from_directory, jsonify

app = Flask(__name__, static_folder='.')

def get_base_dir():
    """Get the absolute directory of the script file."""
    return os.path.dirname(os.path.abspath(__file__))

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/worlds')
def list_worlds():
    combined_worlds = []
    base_dir = get_base_dir()

    # 1. Load custom worlds/external links from maps.json (safely)
    maps_json_path = os.path.join(base_dir, 'maps.json')
    if os.path.exists(maps_json_path):
        try:
            with open(maps_json_path, 'r', encoding='utf-8') as f:
                maps_json_data = json.load(f)
                # Ensure each entry is a dict and append.
                if isinstance(maps_json_data, list):
                    for entry in maps_json_data:
                        if isinstance(entry, dict) and "name" in entry and "path" in entry:
                            combined_worlds.append(entry)
                elif isinstance(maps_json_data, dict) and "name" in maps_json_data and "path" in maps_json_data:
                    combined_worlds.append(maps_json_data)
        except Exception as e:
            print(f"Error loading maps.json: {e}")

    # 2. Scan local maps directory and combine with image convention
    maps_dir_rel = 'maps'
    maps_dir_abs = os.path.join(base_dir, maps_dir_rel)
    if os.path.exists(maps_dir_abs):
        local_glbs = [f for f in os.listdir(maps_dir_abs) if f.endswith('.glb')]
        for f in local_glbs:
            glb_path = f"/{maps_dir_rel}/{f}"

            # convention: world.glb -> world_preview.png/world_preview.jpg
            base_name = os.path.splitext(f)[0]
            preview_img_path = None

            # prioritize a _preview image convention
            for ext in ['.png', '.jpg']:
                potential_preview = f"{base_name}_preview{ext}"
                potential_path = os.path.join(maps_dir_abs, potential_preview)
                if os.path.exists(potential_path):
                    preview_img_path = f"/{maps_dir_rel}/{potential_preview}"
                    break # prioritize first found image extension

            # Only append local glb if not already present from maps.json (by unique path)
            if not any(w.get("path") == glb_path for w in combined_worlds):
                combined_worlds.append({
                    "name": f,
                    "path": glb_path,
                    "preview_img": preview_img_path
                })

    # Remove any duplicates based on unique path if needed
    unique_worlds = {w['path']: w for w in combined_worlds}.values()
    return jsonify(list(unique_worlds))

@app.route('/<path:path>')
def serve_file(path):
    return send_from_directory('.', path)

if __name__ == '__main__':
    port = 5000
    print(f"Grout Studio running at https://192.168.1.144:5000")
    # Using specific host ip for easier network access.
    app.run(host='0.0.0.0', port=port, debug=False, ssl_context='adhoc')