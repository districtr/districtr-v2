def string_to_bool(booly: str):
    return booly.lower() not in ["false", "f", "no", "0"]


async def fake_verify_recaptcha(*args, **kwargs):
    return True


async def fake_verify_auth(*args, **kwargs):
    return {
        "sub": "test_user",
        "scope": [
            "create:content",
            "read:content",
            "update:content",
            "delete:content",
            "update:update-all",
            "delete:delete-all",
        ],
    }
