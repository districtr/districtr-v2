from django.http import HttpResponse


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
