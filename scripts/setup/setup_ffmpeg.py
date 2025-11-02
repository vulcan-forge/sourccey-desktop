#!/usr/bin/env python3
import os, sys, zipfile, tarfile, platform, urllib.request, shutil

# Output folder for ffmpeg
OUT_DIR = os.path.join("tools", "ffmpeg")
os.makedirs(OUT_DIR, exist_ok=True)

def download(url, filename):
    print(f"Downloading {url}...")
    urllib.request.urlretrieve(url, filename)

system = platform.system().lower()

if "linux" in system:
    url = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
    filename = "ffmpeg.tar.xz"
    download(url, filename)
    with tarfile.open(filename) as tar:
        tar.extractall(OUT_DIR)
    # Move the binary into tools/ffmpeg/ffmpeg
    for root, dirs, files in os.walk(OUT_DIR):
        if "ffmpeg" in files and not files[0].endswith(".exe"):
            src = os.path.join(root, "ffmpeg")
            dst = os.path.join(OUT_DIR, "ffmpeg")
            shutil.move(src, dst)
            break
    os.remove(filename)

elif "windows" in system:
    url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
    filename = "ffmpeg.zip"
    download(url, filename)
    with zipfile.ZipFile(filename, "r") as zip_ref:
        zip_ref.extractall(OUT_DIR)
    # Move the binary into tools/ffmpeg/ffmpeg.exe
    for root, dirs, files in os.walk(OUT_DIR):
        if "ffmpeg.exe" in files:
            src = os.path.join(root, "ffmpeg.exe")
            dst = os.path.join(OUT_DIR, "ffmpeg.exe")
            shutil.move(src, dst)
            break
    os.remove(filename)

elif "darwin" in system:
    url = "https://evermeet.cx/ffmpeg/ffmpeg-6.1.1.zip"
    filename = "ffmpeg.zip"
    download(url, filename)
    with zipfile.ZipFile(filename, "r") as zip_ref:
        zip_ref.extractall(OUT_DIR)
    # Move the binary into tools/ffmpeg/ffmpeg
    src = os.path.join(OUT_DIR, "ffmpeg")
    dst = os.path.join(OUT_DIR, "ffmpeg")
    if os.path.exists(dst):
        os.remove(dst)
    shutil.move(src, dst)
    os.remove(filename)

else:
    print(f"Unsupported system: {system}")
    sys.exit(1)

print(f"✅ FFmpeg installed to {os.path.abspath(OUT_DIR)}")
