import re
def basic_features(msg: str) -> dict:
    return {
        "len": len(msg),
        "qm": msg.count("?"),
        "em": msg.count("!"),
        "polite": int(any(x in msg.lower() for x in ["por favor","gracias","te late","¿te parece?"])),
    }
