import os
from PIL import Image, ImageDraw

def create_dummy_image(path, color, text):
    img = Image.new('RGB', (800, 600), color=color)
    d = ImageDraw.Draw(img)
    d.text((10,10), text, fill=(255,255,255))
    img.save(path)

def create_dummy_txt(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

base_dir = 'imageData/images'
os.makedirs(base_dir, exist_ok=True)

# Folder 1: Anime
os.makedirs(os.path.join(base_dir, 'Anime'), exist_ok=True)
create_dummy_image(os.path.join(base_dir, 'Anime', 'girl.png'), 'blue', 'Anime Girl')
create_dummy_txt(os.path.join(base_dir, 'Anime', 'girl.txt'), '1girl, anime style, blue theme, high quality')

create_dummy_image(os.path.join(base_dir, 'Anime', 'boy.jpg'), 'red', 'Anime Boy')
create_dummy_txt(os.path.join(base_dir, 'Anime', 'boy.txt'), '1boy, anime style, red theme, cool')

# Folder 2: Landscape
os.makedirs(os.path.join(base_dir, 'Landscape'), exist_ok=True)
create_dummy_image(os.path.join(base_dir, 'Landscape', 'mountain.png'), 'green', 'Mountain')
create_dummy_txt(os.path.join(base_dir, 'Landscape', 'mountain.txt'), 'mountain, nature, landscape, 4k')

# Root files
create_dummy_image(os.path.join(base_dir, 'random.png'), 'purple', 'Random')
create_dummy_txt(os.path.join(base_dir, 'random.txt'), 'random stuff, purple')

print("Dummy data created.")
