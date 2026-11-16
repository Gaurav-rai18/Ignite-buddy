"""
URL routing configuration for Ignite Buddy unified server.
Includes Admin Console APIs, Trainee Assistant authentication, DRF Spectacular API documentation, and health checks.
"""
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

from server.apps.accounts.permissions import IsAdmin
from server.apps.buddy_controller.views import get_or_update_buddy_setting
from server.apps.dashboard.views import DashboardSummaryView
from server.apps.accounts.views import SystemPreferencesView, DataExportView
from server.api.views import HealthView, LoginView as TraineeLoginView

urlpatterns = [
    # Django Administration
    path("admin/", admin.site.urls),

    # OpenAPI 3.0 Schema & Interactive Documentation (Restricted to Django Admins)
    path(
        "api/schema/",
        SpectacularAPIView.as_view(permission_classes=[IsAdmin]),
        name="schema",
    ),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema", permission_classes=[IsAdmin]),
        name="swagger-ui",
    ),
    path(
        "api/docs/swagger/",
        SpectacularSwaggerView.as_view(url_name="schema", permission_classes=[IsAdmin]),
        name="swagger-ui-alias",
    ),
    path(
        "api/docs/redoc/",
        SpectacularRedocView.as_view(url_name="schema", permission_classes=[IsAdmin]),
        name="redoc",
    ),

    # Health & Assistant auth
    path("health", HealthView.as_view(), name="health"),
    path("auth/login", TraineeLoginView.as_view(), name="trainee-auth-login"),

    # Admin Console REST APIs
    path("", include("server.api.urls")),
    path("api/accounts/", include("server.apps.accounts.urls")),
    path("api/notifications/", include("server.apps.notifications.urls")),
    path("api/buddy/", include("server.apps.buddy_controller.urls")),
    path("api/settings/buddy/", get_or_update_buddy_setting, name="buddy-setting"),
    path("api/settings/preferences/", SystemPreferencesView.as_view(), name="system-preferences"),
    path("api/settings/export/", DataExportView.as_view(), name="data-export"),
    path("api/schedules/", include("server.apps.schedules.urls")),
    path("api/documents/", include("server.apps.documents.urls")),
    path("api/dashboard/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("api/assignments/", include("server.apps.assignments.urls")),
]
