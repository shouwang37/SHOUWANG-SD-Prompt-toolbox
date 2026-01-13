import os
import json
import shutil
import sys
import subprocess
from flask import Flask, render_template, send_from_directory, request, jsonify
from PIL import Image

# === 自动切换到便携版 Python 逻辑 ===
# 获取当前文件所在目录
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 定义便携版 Python 的路径
PORTABLE_PYTHON = os.path.join(BASE_DIR, 'python-portable', 'python.exe')

# 如果便携版 Python 存在，且当前使用的不是它
if os.path.exists(PORTABLE_PYTHON) and os.path.normpath(sys.executable).lower() != os.path.normpath(PORTABLE_PYTHON).lower():
    print("="*50)
    print("检测到便携版 Python 环境，正在自动切换...")
    print(f"当前: {sys.executable}")
    print(f"目标: {PORTABLE_PYTHON}")
    print("="*50)
    
    # 构建重启命令
    cmd = [PORTABLE_PYTHON] + sys.argv
    
    # 使用 subprocess 启动新进程并等待其结束
    try:
        subprocess.call(cmd)
        sys.exit(0) # 退出当前（旧）进程
    except Exception as e:
        print(f"切换便携版失败: {e}")
        print("将继续使用当前环境运行...")

# ==========================================

print("="*50)
print("当前使用的 Python 解释器路径:")
print(sys.executable)
print("="*50)


app = Flask(__name__)

# Configuration
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGE_DATA_DIR = os.path.join(BASE_DIR, 'imageData')
IMAGES_DIR = os.path.join(IMAGE_DATA_DIR, 'images')
THUMBNAILS_DIR = os.path.join(IMAGE_DATA_DIR, 'thumbnails')
INDEX_FILE = os.path.join(IMAGE_DATA_DIR, 'images.json')

# Ensure directories exist
os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(THUMBNAILS_DIR, exist_ok=True)

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'}

def generate_thumbnail(src_path, thumb_path):
    try:
        os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
        if os.path.exists(thumb_path):
            # Check modification time to see if we need to regenerate
            if os.path.getmtime(src_path) <= os.path.getmtime(thumb_path):
                return
        
        with Image.open(src_path) as img:
            # Convert to RGB if necessary (e.g. for PNGs with transparency)
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            
            # Resize logic: 220px width is the card size, let's make it slightly larger for high DPI
            # Spec says: "Image scaled proportionally to fit"
            # Let's limit width to 400px to save space but keep quality
            img.thumbnail((400, 400))
            img.save(thumb_path, 'JPEG', quality=85)
    except Exception as e:
        print(f"Error generating thumbnail for {src_path}: {e}")

def scan_directory(current_path, relative_path=''):
    """
    Recursively scans the directory.
    Returns a list of items (files and directories).
    """
    items = []
    
    try:
        entries = sorted(os.scandir(current_path), key=lambda e: e.name)
    except FileNotFoundError:
        return []

    for entry in entries:
        entry_relative_path = os.path.join(relative_path, entry.name).replace('\\', '/')
        
        if entry.is_dir():
            # Recursively scan subdirectories
            children = scan_directory(entry.path, entry_relative_path)
            items.append({
                'name': entry.name,
                'type': 'directory',
                'path': entry_relative_path,
                'children': children,
                'mtime': entry.stat().st_mtime
            })
        elif entry.is_file():
            ext = os.path.splitext(entry.name)[1].lower()
            if ext in IMAGE_EXTENSIONS:
                # Auto-convert to PNG if not already PNG
                if ext != '.png':
                    try:
                        base_path_no_ext = os.path.splitext(entry.path)[0]
                        png_path = base_path_no_ext + '.png'
                        
                        # If PNG version doesn't exist, convert it
                        if not os.path.exists(png_path):
                            with Image.open(entry.path) as img:
                                if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                                    img = img.convert('RGBA')
                                else:
                                    img = img.convert('RGB')
                                img.save(png_path, 'PNG')
                            
                            # Remove original file
                            os.remove(entry.path)
                            
                            # Remove original thumbnail if exists
                            old_thumb_full_path = os.path.join(THUMBNAILS_DIR, relative_path, entry.name)
                            if os.path.exists(old_thumb_full_path):
                                os.remove(old_thumb_full_path)
                            
                            # Update variables for current entry processing
                            entry_relative_path = os.path.splitext(entry_relative_path)[0] + '.png'
                            ext = '.png'
                            # entry.name is read-only, but we use base_name below
                        else:
                            # PNG already exists, this is a duplicate non-PNG file. Remove it.
                            os.remove(entry.path)
                            continue # Skip this entry, the PNG one will be picked up
                            
                    except Exception as e:
                        print(f"Error converting {entry.name} to PNG: {e}")
                        # If conversion fails, keep original for now to avoid data loss
                        pass

                base_name = os.path.splitext(entry.name)[0]
                txt_name = base_name + '.txt'
                txt_path = os.path.join(current_path, txt_name)
                
                # Read prompt content
                prompt = ""
                if os.path.exists(txt_path):
                    try:
                        with open(txt_path, 'r', encoding='utf-8') as f:
                            prompt = f.read()
                    except Exception:
                        prompt = ""
                else:
                    # Create empty txt file if it doesn't exist? 
                    # For now, just assume empty. User can edit later.
                    pass

                # Generate thumbnail
                thumb_relative_path = entry_relative_path
                thumb_full_path = os.path.join(THUMBNAILS_DIR, thumb_relative_path)
                generate_thumbnail(entry.path, thumb_full_path)

                # Spec: Remove extension from name, do not include prompt
                items.append({
                    'name': base_name, # Removed extension
                    'base_name': base_name,
                    'type': 'file',
                    'path': entry_relative_path,
                    # 'prompt': prompt, # Removed prompt as requested
                    'mtime': entry.stat().st_mtime
                })
    
    return items

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search')
def api_search():
    query = request.args.get('q', '').lower()
    if not query:
        return jsonify([])
    
    results = []
    
    # Helper to recursively search
    def search_recursive(root_path, relative_path=''):
        try:
            entries = os.scandir(root_path)
        except FileNotFoundError:
            return

        for entry in entries:
            entry_relative_path = os.path.join(relative_path, entry.name).replace('\\', '/')
            
            if entry.is_dir():
                search_recursive(entry.path, entry_relative_path)
            elif entry.is_file():
                ext = os.path.splitext(entry.name)[1].lower()
                if ext in IMAGE_EXTENSIONS:
                    base_name = os.path.splitext(entry.name)[0]
                    
                    # Search in Name
                    match_name = query in base_name.lower()
                    
                    # Search in Prompt
                    match_prompt = False
                    txt_path = os.path.join(root_path, base_name + '.txt')
                    prompt_content = ""
                    if os.path.exists(txt_path):
                        try:
                            with open(txt_path, 'r', encoding='utf-8') as f:
                                prompt_content = f.read()
                            if query in prompt_content.lower():
                                match_prompt = True
                        except:
                            pass
                            
                    if match_name or match_prompt:
                        results.append({
                            'name': base_name,
                            'base_name': base_name,
                            'type': 'file',
                            'path': entry_relative_path,
                            'prompt': prompt_content, # Include prompt in search results
                            'mtime': entry.stat().st_mtime
                        })
    
    search_recursive(IMAGES_DIR)
    return jsonify(results)

@app.route('/api/prompts', methods=['POST'])
def api_get_prompts():
    paths = request.json.get('paths', [])
    result = {}
    
    for relative_path in paths:
        full_path = os.path.join(IMAGES_DIR, relative_path)
        base_path = os.path.splitext(full_path)[0]
        txt_path = base_path + '.txt'
        
        if os.path.exists(txt_path):
            try:
                with open(txt_path, 'r', encoding='utf-8') as f:
                    result[relative_path] = f.read()
            except:
                result[relative_path] = ""
        else:
            result[relative_path] = ""
            
    return jsonify(result)

@app.route('/api/scan')
def api_scan():
    # Scan images directory
    tree = scan_directory(IMAGES_DIR)
    
    # Save to images.json
    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)
        
    return jsonify(tree)

@app.route('/imageData/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMAGES_DIR, filename)

@app.route('/imageData/thumbnails/<path:filename>')
def serve_thumbnail(filename):
    return send_from_directory(THUMBNAILS_DIR, filename)

@app.route('/api/update', methods=['POST'])
def api_update():
    data = request.json
    file_path = data.get('path')
    new_prompt = data.get('prompt')
    
    if not file_path:
        return jsonify({'error': 'No path provided'}), 400
        
    full_path = os.path.join(IMAGES_DIR, file_path)
    base_path = os.path.splitext(full_path)[0]
    txt_path = base_path + '.txt'
    
    try:
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(new_prompt)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/rename', methods=['POST'])
def api_rename():
    data = request.json
    old_path = data.get('old_path')
    new_name = data.get('new_name') # Just the name without extension
    
    if not old_path or not new_name:
        return jsonify({'error': 'Missing parameters'}), 400
        
    old_full_path = os.path.join(IMAGES_DIR, old_path)
    directory = os.path.dirname(old_full_path)
    old_ext = os.path.splitext(old_full_path)[1].lower()
    
    # Force new extension to be .png
    new_filename = new_name + '.png'
    new_full_path = os.path.join(directory, new_filename)
    
    # Rename image
    try:
        # Check if old file exists, if not check for png version (handling auto-converted files)
        if not os.path.exists(old_full_path) and old_ext != '.png':
            png_version = os.path.splitext(old_full_path)[0] + '.png'
            if os.path.exists(png_version):
                old_full_path = png_version
                old_ext = '.png'
                # Update old_path relative path for thumbnail handling
                base_rel, _ = os.path.splitext(old_path)
                old_path = base_rel + '.png'

        # If still doesn't exist, error
        if not os.path.exists(old_full_path):
            return jsonify({'error': 'File not found'}), 404

        # Perform rename and conversion if needed
        if old_ext != '.png':
             # Convert to PNG
             with Image.open(old_full_path) as img:
                 if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                     img = img.convert('RGBA')
                 else:
                     img = img.convert('RGB')
                 img.save(new_full_path, 'PNG')
             os.remove(old_full_path)
        else:
             # Just rename
             os.rename(old_full_path, new_full_path)
        
        # Rename txt if exists
        old_txt_path = os.path.splitext(old_full_path)[0] + '.txt'
        new_txt_path = os.path.splitext(new_full_path)[0] + '.txt'
        
        if os.path.exists(old_txt_path):
            os.rename(old_txt_path, new_txt_path)
            
        # Rename thumbnail if exists
        old_thumb_path = os.path.join(THUMBNAILS_DIR, old_path)
        new_thumb_path = os.path.join(THUMBNAILS_DIR, os.path.dirname(old_path), new_filename)
        if os.path.exists(old_thumb_path):
             os.rename(old_thumb_path, new_thumb_path)

        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete', methods=['POST'])
def api_delete():
    data = request.json
    file_path = data.get('path')
    
    if not file_path:
        return jsonify({'error': 'No path provided'}), 400
        
    full_path = os.path.join(IMAGES_DIR, file_path)
    txt_path = os.path.splitext(full_path)[0] + '.txt'
    thumb_path = os.path.join(THUMBNAILS_DIR, file_path)
    
    try:
        if os.path.exists(full_path):
            os.remove(full_path)
        if os.path.exists(txt_path):
            os.remove(txt_path)
        if os.path.exists(thumb_path):
            os.remove(thumb_path)
            
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folder/create', methods=['POST'])
def create_folder():
    data = request.json
    parent_path = data.get('parent_path', '')
    folder_name = data.get('name')
    
    if not folder_name:
        return jsonify({'error': 'No folder name provided'}), 400
        
    new_folder_path = os.path.join(IMAGES_DIR, parent_path, folder_name)
    try:
        os.makedirs(new_folder_path, exist_ok=True)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folder/rename', methods=['POST'])
def rename_folder():
    data = request.json
    path = data.get('path')
    new_name = data.get('new_name')
    
    if not path or not new_name:
        return jsonify({'error': 'Missing parameters'}), 400
        
    full_path = os.path.join(IMAGES_DIR, path)
    parent_dir = os.path.dirname(full_path)
    new_full_path = os.path.join(parent_dir, new_name)
    
    try:
        os.rename(full_path, new_full_path)
        
        # Also rename in thumbnails
        thumb_path = os.path.join(THUMBNAILS_DIR, path)
        new_thumb_path = os.path.join(THUMBNAILS_DIR, os.path.dirname(path), new_name)
        if os.path.exists(thumb_path):
            os.rename(thumb_path, new_thumb_path)
            
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folder/delete', methods=['POST'])
def delete_folder():
    data = request.json
    path = data.get('path')
    
    if not path:
        return jsonify({'error': 'No path provided'}), 400
        
    full_path = os.path.join(IMAGES_DIR, path)
    thumb_path = os.path.join(THUMBNAILS_DIR, path)
    
    try:
        if os.path.exists(full_path):
            shutil.rmtree(full_path)
        if os.path.exists(thumb_path):
            shutil.rmtree(thumb_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/upload', methods=['POST'])
def api_upload():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400
        
    file = request.files['image']
    filename = request.form.get('filename')
    prompt = request.form.get('prompt', '')
    folder_path = request.form.get('folder_path', '')
    
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
        
    # Ensure secure filename (simple version)
    filename = "".join([c for c in filename if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).rstrip()
    if not filename:
        filename = "untitled"
        
    # Get extension from uploaded file (just to check validity)
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        return jsonify({'error': 'Invalid file type'}), 400
        
    # Force PNG format as requested
    full_filename = filename + '.png'
    save_dir = os.path.join(IMAGES_DIR, folder_path)
    os.makedirs(save_dir, exist_ok=True)
    
    image_path = os.path.join(save_dir, full_filename)
    txt_path = os.path.join(save_dir, filename + '.txt')
    
    overwrite = request.form.get('overwrite', 'false') == 'true'

    # Check if exists (any supported extension)
    # The unit is identified by 'filename' (base_name). 
    # If '1.jpg' exists, we consider unit '1' exists.
    existing_any = False
    for ext_check in IMAGE_EXTENSIONS:
        path_check = os.path.join(save_dir, filename + ext_check)
        if os.path.exists(path_check):
            existing_any = True
            break
            
    if existing_any and not overwrite:
         return jsonify({'error': 'File already exists', 'code': 'EXISTS'}), 400
        
    try:
        # Cleanup other extensions if overwriting or creating new (to ensure uniqueness)
        for ext_check in IMAGE_EXTENSIONS:
            if ext_check == '.png': continue
            path_check = os.path.join(save_dir, filename + ext_check)
            if os.path.exists(path_check):
                os.remove(path_check)
                # Also remove thumbnail
                thumb_p = os.path.join(THUMBNAILS_DIR, folder_path, filename + ext_check)
                if os.path.exists(thumb_p):
                    os.remove(thumb_p)

        # Save as PNG using Pillow
        img = Image.open(file)
        # Handle transparency for PNG
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
             img = img.convert('RGBA')
        else:
             img = img.convert('RGB')
             
        img.save(image_path, 'PNG')
        
        # Save Prompt
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(prompt)
            
        # Generate thumbnail (force PNG for thumbnail too, or JPEG? usually JPEG for thumbs is smaller, but let's stick to logic)
        # generate_thumbnail converts to JPEG usually.
        # Let's keep generate_thumbnail as is (it saves as JPEG with original extension in path? No, check generate_thumbnail)
        
        # Check generate_thumbnail:
        # thumb_path = os.path.join(THUMBNAILS_DIR, thumb_relative_path)
        # It saves to thumb_path.
        # If thumb_relative_path ends in .png, it saves as JPEG? 
        # img.save(thumb_path, 'JPEG', quality=85)
        # This is fine, but the filename in thumbnails dir will be 1.png (content is jpeg).
        
        thumb_dir = os.path.join(THUMBNAILS_DIR, folder_path)
        thumb_path = os.path.join(thumb_dir, full_filename)
        generate_thumbnail(image_path, thumb_path)
        
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)
