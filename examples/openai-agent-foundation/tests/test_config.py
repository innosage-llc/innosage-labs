"""Private optional operator configuration is inert until separately authorized."""
import pytest
from backend import serve

def test_private_config_requires_owner_only_file(tmp_path,monkeypatch):
    config=tmp_path/"model.env"
    monkeypatch.setattr(serve,"MODEL_CONFIG",config)
    config.write_text("FOUNDATION_ALLOW_BILLABLE=explicitly-authorized\nOPENAI_API_KEY=test-only-not-real\n",encoding="utf-8")
    config.chmod(0o644)
    with pytest.raises(SystemExit):
        serve.load_private_model_config()
    config.chmod(0o600)
    assert serve.load_private_model_config() is True
    assert serve.os.environ["OPENAI_API_KEY"]=="test-only-not-real"
    assert serve.os.environ["FOUNDATION_ALLOW_BILLABLE"]=="explicitly-authorized"
    monkeypatch.delenv("OPENAI_API_KEY",raising=False)
    monkeypatch.delenv("FOUNDATION_ALLOW_BILLABLE",raising=False)

def test_private_config_rejects_unknown_directives(tmp_path,monkeypatch):
    config=tmp_path/"model.env"
    monkeypatch.setattr(serve,"MODEL_CONFIG",config)
    config.write_text("MALICIOUS_DIRECTIVE=command\n",encoding="utf-8")
    config.chmod(0o600)
    with pytest.raises(SystemExit):
        serve.load_private_model_config()
