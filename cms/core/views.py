from django.db import connection
from django.http import JsonResponse


def health(request):
    """Liveness/readiness check for Fly and docker-compose."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        return JsonResponse({"status": "error", "database": "unreachable"}, status=503)
    return JsonResponse({"status": "ok"})
