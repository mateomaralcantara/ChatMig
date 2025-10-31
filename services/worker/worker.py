import os, time, json
import requests
from rq import Queue
from redis import Redis

redis = Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
q = Queue(connection=redis)

def send_reminder(payload: dict):
    # Stub: integra Twilio/Email/etc.
    print("Reminder:", json.dumps(payload, ensure_ascii=False))

if __name__ == "__main__":
    print("Worker ready. (stub)")
    while True:
        time.sleep(5)
