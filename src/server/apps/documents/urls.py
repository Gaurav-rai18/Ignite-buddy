from django.urls import path
from .views import DocumentListCreateView, DocumentDetailView, KnowledgeBaseStatsView

urlpatterns = [
    path("", DocumentListCreateView.as_view(), name="documents-list-create"),
    path("stats/", KnowledgeBaseStatsView.as_view(), name="documents-stats"),
    path("<int:pk>/", DocumentDetailView.as_view(), name="documents-detail"),
]
