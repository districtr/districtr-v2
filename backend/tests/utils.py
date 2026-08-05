def string_to_bool(booly: str):
    return booly.lower() not in ["false", "f", "no", "0"]


async def fake_verify_turnstile(*args, **kwargs):
    return True
