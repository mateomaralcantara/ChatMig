import argparse, sys, time
import requests

def ping(url):
    try:
        r = requests.get(url, timeout=5)
        return r.status_code, r.text[:200]
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"

def post(url, json, stream=False):
    try:
        r = requests.post(url, json=json, timeout=30, stream=stream)
        if stream:
            acc = []
            for chunk in r.iter_content(chunk_size=None):
                if not chunk: continue
                acc.append(chunk.decode("utf-8", errors="ignore"))
                if len("".join(acc)) > 500: break
            return r.status_code, "".join(acc)[:800]
        else:
            return r.status_code, r.text[:800]
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-base", default="http://127.0.0.1:8000")
    ap.add_argument("--query", default="Prueba ChatMig")
    args = ap.parse_args()

    base = args.api_base.rstrip("/")
    print(f"== Probar API en {base} ==\n")

    # 0) /docs
    code, body = ping(f"{base}/docs")
    print(f"[GET /docs] -> {code}  {body[:80]}")

    # 1) EL ENDPOINT QUE TIENES HOY (texto plano): /chat/complete_stream
    payload = {"query": args.query, "style": {"length_words": 300, "language": "es"}}
    code, body = post(f"{base}/chat/complete_stream", payload, stream=True)
    print(f"[POST /chat/complete_stream] -> {code}\n{body}\n")

    # 2) Si tu frontend llama a /llm/complete/stream, ¿existe?
    code, body = post(f"{base}/llm/complete/stream", payload, stream=True)
    print(f"[POST /llm/complete/stream] -> {code}\n{body}\n")

    # 3) ¿/llm/complete existe?
    code, body = post(f"{base}/llm/complete", payload, stream=False)
    print(f"[POST /llm/complete] -> {code}\n{body}\n")

    # 4) ¿/chat/plan existe?
    code, body = post(f"{base}/chat/plan", {"goal": args.query}, stream=False)
    print(f"[POST /chat/plan] -> {code}\n{body}\n")

if __name__ == "__main__":
    sys.exit(main())
