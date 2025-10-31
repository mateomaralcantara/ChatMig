

from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[1]  # .../services/api
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import os, glob
from pydantic import BaseModel
from app.settings import get_settings
from openai import OpenAI

def chunk_text(t: str, max_chars=1200, overlap=200):
    t = " ".join(t.split())
    chunks = []
    i = 0
    while i < len(t):
        j = min(i + max_chars, len(t))
        chunks.append(t[i:j])
        i = j - overlap
        if i < 0: i = 0
    return chunks

def main():
    settings = get_settings()
    src_dir = os.path.join(os.path.dirname(__file__), "..", "knowledge_src")
    src_dir = os.path.abspath(src_dir)
    if not os.path.isdir(src_dir):
        os.makedirs(src_dir, exist_ok=True)

    files = [*glob.glob(os.path.join(src_dir, "*.md")), *glob.glob(os.path.join(src_dir, "*.txt"))]
    if not files:
        print("No hay archivos en knowledge_src/")
        return

    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    total_chunks = 0
    for fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            txt = f.read()
        chunks = chunk_text(txt)
        total_chunks += len(chunks)
        # ejemplo de embeddings (no sube a DB todavía)
        _ = client.embeddings.create(model=settings.EMBED_MODEL, input=chunks)
        print(f"Embeddings OK: {os.path.basename(fp)} -> {len(chunks)} chunks")

    print(f"Listo. Chunks totales: {total_chunks}")

if __name__ == "__main__":
    main()
