import os
import re
import shutil
import sys

def replace_branding_in_text(content, new_brand="Brand X"):
    compact_title = "".join(part.capitalize() for part in new_brand.split())
    compact_lower = "".join(part.lower() for part in new_brand.split())
    slug_lower = "-".join(part.lower() for part in new_brand.split())
    upper_brand = new_brand.upper()
    lower_brand = new_brand.lower()

    replacements = [
        (r'chesscomfiles\.com', f'{compact_lower}files.com'),
        (r'chesscom_pawn', f'{compact_lower}_pawn'),
        (r'wwwchesscom', f'www{compact_lower}'),
        (r'@chesscom', f'@{compact_lower}'),
        (r'Chess\.com', new_brand),
        (r'CHESS\.COM', upper_brand),
        (r'chess\.com', lower_brand),
        (r'Chess-com', new_brand.replace(' ', '-')),
        (r'chess-com', slug_lower),
        (r'ChessCom', compact_title),
        (r'Chesscom', compact_title),
        (r'CHESSCOM', compact_lower.upper()),
        (r'chesscom', compact_lower),
    ]

    total_count = 0
    for pattern, replacement in replacements:
        count = len(re.findall(pattern, content))
        if count > 0:
            content = re.sub(pattern, replacement, content)
            total_count += count
    return content, total_count

def process_file(file_path, new_brand="Brand X", make_backup=True):
    if not os.path.isfile(file_path):
        return 0
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception as e:
        print(f"Could not read {file_path}: {e}")
        return 0

    new_content, count = replace_branding_in_text(content, new_brand)
    if count > 0:
        if make_backup:
            bak_path = file_path + ".bak"
            if not os.path.exists(bak_path):
                shutil.copy2(file_path, bak_path)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"[MODIFIED] {file_path} ({count} replacements)")
    return count

def process_path(target_path, new_brand="Brand X"):
    target_path = os.path.abspath(target_path)
    if os.path.isfile(target_path):
        total = process_file(target_path, new_brand)
        # Check companion _files folder
        base, _ = os.path.splitext(target_path)
        old_files_dir = base + "_files"
        if os.path.exists(old_files_dir):
            new_files_dir = base.replace("Chess.com", new_brand) + "_files"
            if new_files_dir != old_files_dir and not os.path.exists(new_files_dir):
                shutil.copytree(old_files_dir, new_files_dir)
                print(f"Copied companion folder to: {new_files_dir}")
        print(f"\nDone! Total replacements in file: {total}")
    elif os.path.isdir(target_path):
        extensions = {".html", ".htm", ".js", ".json", ".css", ".svg", ".txt"}
        total_files = 0
        total_replacements = 0
        for root, _, files in os.walk(target_path):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in extensions and not file.endswith(".bak"):
                    fpath = os.path.join(root, file)
                    count = process_file(fpath, new_brand)
                    if count > 0:
                        total_files += 1
                        total_replacements += count
        print(f"\nDone! Modified {total_files} files with {total_replacements} total replacements across '{target_path}'.")
    else:
        print(f"Error: Path not found: {target_path}")

if __name__ == "__main__":
    default_target = r"C:\Users\corte\Desktop\Chess_ looser18xian vs Drunk_Cadmus - 173783705186 - Chess.com.html"
    target = sys.argv[1] if len(sys.argv) > 1 else default_target
    brand = sys.argv[2] if len(sys.argv) > 2 else "Brand X"
    print(f"Running replacement for Brand: '{brand}'")
    print(f"Target path: '{target}'\n")
    process_path(target, brand)
