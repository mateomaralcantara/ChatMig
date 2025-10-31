class StatsModelsBackend:
    # Placeholder para integración futura
    pass

def setup():
    from ..registry import register
    register("statsmodels", StatsModelsBackend())
