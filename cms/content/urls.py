from django.urls import path

from content import api

app_name = "content"

urlpatterns = [
    path("<str:content_type>/slug/<slug:slug>", api.content_detail, name="detail"),
    path("<str:content_type>/list", api.content_list, name="list"),
]
