from django.urls import path

from galleries import api

app_name = "galleries"

urlpatterns = [
    path("", api.gallery_list, name="list"),
    path("<slug:slug>", api.gallery_detail, name="detail"),
]
