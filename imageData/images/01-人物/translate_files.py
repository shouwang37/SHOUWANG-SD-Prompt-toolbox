import os
import sys
import io
import time
import requests
import random
from concurrent.futures import ThreadPoolExecutor

# ================= 编码修复区 =================
# 强制标准输出使用 UTF-8 编码，解决终端显示乱码 (适合 VS Code/CMD/PowerShell)
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# ================= 配置区 =================
# 在此填入你的智谱 AI API Key
API_KEY = '9346d659288343038c53575b75b65fad.l3pi1PBCe4oTpQuy'
MODEL = "glm-4-flash"

# 线程数：GLM-4-Flash 免费版并发较高，建议 5-10
MAX_WORKERS = 5 
# 支持的图片后缀
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
# ==========================================

def glm_translate(query):
    """使用 GLM-4-Flash 模型进行翻译"""
    if not query.strip() or query.isdigit():
        return query

    url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system", 
                "content": "你是一个专业的文件名翻译助手。请将用户提供的英文单词或短语翻译成中文。注意：只输出翻译后的文本，不要包含引号、标点符号、解释说明。如果是中文则原样返回。"
            },
            {
                "role": "user", 
                "content": query
            }
        ],
        "temperature": 0.1
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code == 200:
            result = response.json()['choices'][0]['message']['content'].strip()
            # 过滤掉非法字符和可能的引号
            for char in '<>:"/\\|?*\'':
                result = result.replace(char, '')
            return result
        return None
    except Exception:
        return None

def process_files_in_dir(subdir):
    """处理特定目录下的文件翻译重命名"""
    try:
        files = [f for f in os.listdir(subdir) if os.path.isfile(os.path.join(subdir, f))]
    except OSError:
        return

    file_groups = {}
    for f in files:
        name, ext = os.path.splitext(f)
        ext = ext.lower()
        if ext == '.txt' or ext in IMAGE_EXTENSIONS:
            file_groups.setdefault(name, []).append(f)
    
    for base_name, file_list in file_groups.items():
        translated_name = glm_translate(base_name)
        if translated_name and translated_name != base_name:
            for old_file in file_list:
                _, ext = os.path.splitext(old_file)
                new_file = f"{translated_name}{ext}"
                old_path = os.path.join(subdir, old_file)
                new_path = os.path.join(subdir, new_file)
                
                if os.path.exists(new_path) and old_path != new_path:
                    new_path = os.path.join(subdir, f"{translated_name}_{random.randint(1,999)}{ext}")
                
                try:
                    os.rename(old_path, new_path)
                    print(f"  [文件成功] {old_file} -> {os.path.basename(new_path)}")
                except Exception as e:
                    print(f"  [文件失败] {old_file}: {e}")

def main():
    root_dir = os.getcwd()
    
    # 获取所有子文件夹，topdown=False 确保从最深层开始处理
    all_subdirs = []
    for subdir, dirs, _ in os.walk(root_dir, topdown=False):
        if subdir != root_dir:
            all_subdirs.append(subdir)

    if not all_subdirs:
        print("未发现子文件夹，请确保脚本放在含有子文件夹的根目录下。")
        return

    print(f"--- 步骤 1: 正在并发处理 {len(all_subdirs)} 个文件夹内的文件 ---")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        executor.map(process_files_in_dir, all_subdirs)

    print("\n--- 步骤 2: 开始重命名文件夹本身 ---")
    # 文件夹重命名必须基于最新路径，因此这里需要逐级向上重命名
    # 注意：之前的 all_subdirs 存储的是旧路径，重命名父级后子级路径会变
    # 再次使用 topdown=False 的逻辑进行顺序重命名
    for subdir, dirs, files in os.walk(root_dir, topdown=False):
        if subdir == root_dir:
            continue
            
        parent_path, old_folder_name = os.path.split(subdir)
        translated_folder_name = glm_translate(old_folder_name)
        
        if translated_folder_name and translated_folder_name != old_folder_name:
            new_subdir = os.path.join(parent_path, translated_folder_name)
            
            if os.path.exists(new_subdir) and subdir != new_subdir:
                new_subdir = f"{new_subdir}_{random.randint(1,99)}"
            
            try:
                os.rename(subdir, new_subdir)
                print(f"  [文件夹成功] {old_folder_name} -> {os.path.basename(new_subdir)}")
            except Exception as e:
                print(f"  [文件夹失败] {old_folder_name}: {e}")

if __name__ == '__main__':
    if API_KEY == '你的_GLM_API_KEY':
        print("错误：请先在代码中填写你的 GLM API KEY")
    else:
        start_time = time.time()
        main()
        print(f"\n任务全部完成！耗时: {time.time() - start_time:.2f} 秒")