class ProphetBackend:
    # Placeholder para series temporales (retos/engagement)
    pass

def setup():
    from ..registry import register
    register("prophet", ProphetBackend())
