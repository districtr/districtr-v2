from contextvars import ContextVar

from django.http import HttpResponse

# The signed-in user for code with no request in reach — StreamField block
# choice callables (content/blocks.py::districtr_map_slug_choices). None
# outside a request.
current_user: ContextVar = ContextVar("current_user", default=None)


class HealthCheckMiddleware:
    """Answer /healthz before host validation: the ALB probes tasks by IP,
    which ALLOWED_HOSTS rejects for real requests. Static 200, no DB — a DB
    blip must not make ECS cycle otherwise-healthy tasks (mirrors the
    backend target group's health-check choice in infra/alb.ts). /health
    (with DB check) remains for monitoring."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == "/healthz":
            return HttpResponse("ok")
        return self.get_response(request)


class CurrentUserMiddleware:
    """Expose request.user via ``current_user`` for the request's duration
    (reset after, so a worker thread never carries it into the next one)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = current_user.set(getattr(request, "user", None))
        try:
            return self.get_response(request)
        finally:
            current_user.reset(token)
