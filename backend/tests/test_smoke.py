def test_app_loads_and_registers_routes():
    from app.main import app

    paths = {route.path for route in app.routes}
    assert "/health" in paths
    assert any(p.startswith("/api/vehicle") for p in paths)
