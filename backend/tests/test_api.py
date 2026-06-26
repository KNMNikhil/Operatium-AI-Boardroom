import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_metrics():
    response = client.get("/api/metrics")
    assert response.status_code == 200
    assert "version" in response.json()

def test_get_roles():
    response = client.get("/api/knowledge/roles")
    assert response.status_code == 200
    data = response.json()
    assert "roles" in data
    assert "CEO" in data["roles"]
    assert response.headers.get("Cache-Control") == "public, max-age=3600"
