import os

def generate_structure_with_content(root_dir, output_file="_structure_with_content.txt", skip_folders=None):
    if skip_folders is None:
        skip_folders = ['lib']  # default folders to skip

    structure_lines = []  # stores the file structure
    content_blocks = []  # stores file contents in `#region` format

    def write_structure(directory, prefix="", is_root=False):
        # recursively writes the directory structure, placing the entry point first
        entries = sorted(os.listdir(directory))
        entries = sorted(entries, key=lambda e: (e != "index.html", e))  # move entry point to top

        for index, entry in enumerate(entries):
            entry_path = os.path.join(directory, entry)

            # skip ignored folders
            if os.path.isdir(entry_path) and entry in skip_folders:
                continue

            # skip files prefixed with "_structure" or "_generate"
            if entry.startswith(('_structure', '_generate', '_')):
                continue

            is_last = index == len(entries) - 1
            
            # append to file structure
            structure_lines.append(f"{prefix}{'└── ' if is_last else '├── '}{entry}")

            if os.path.isdir(entry_path):
                sub_prefix = prefix + ("    " if is_last else "│   ")
                write_structure(entry_path, sub_prefix)

            elif entry.endswith(('.css', '.js', '.ts', '.html', '.py', '.pyw')):
                file_block = [f"#region {entry}"]
                try:
                    with open(entry_path, 'r', encoding='utf-8') as file:
                        for line in file:
                            file_block.append(line.rstrip())
                except UnicodeDecodeError:
                    file_block.append("[Error reading file: Encoding issues]")
                except Exception as e:
                    file_block.append(f"[Error reading file: {str(e)}]")
                file_block.append(f"#endregion\n")
                content_blocks.append("\n".join(file_block))

    # ensure the entry point appears first
    structure_lines.append(f"{root_dir}/")
    write_structure(root_dir, is_root=True)
    
    # write everything to the output file
    with open(output_file, "w", encoding="utf-8") as file:
        file.write("\n".join(structure_lines) + "\n\n")
        file.write("\n".join(content_blocks))

    print(f"Structure with content written to {output_file}")

# example usage
root_directory = "."
folders_to_skip = ['lib', 'node_modules', 'dist', 'models', 'data', 'FrontEnd']
generate_structure_with_content(root_directory, skip_folders=folders_to_skip)
