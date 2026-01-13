import os
import urllib.request

ASSETS = [
    {
        "url": "https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css",
        "path": "static/lib/css/animate.min.css"
    },
    {
        "url": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
        "path": "static/lib/css/all.min.css"
    },
    {
        "url": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2",
        "path": "static/lib/webfonts/fa-solid-900.woff2"
    },
    {
        "url": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.ttf",
        "path": "static/lib/webfonts/fa-solid-900.ttf"
    },
     {
        "url": "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2",
        "path": "static/lib/webfonts/fa-regular-400.woff2"
    }
]

def download_file(url, path):
    print(f"Downloading {url} to {path}...")
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        urllib.request.urlretrieve(url, path)
        print("Success!")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    for asset in ASSETS:
        download_file(asset["url"], asset["path"])
