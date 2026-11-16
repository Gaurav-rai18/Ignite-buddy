from django.urls import path

from .views import (
    AssignmentListView,
    AssignmentCreateView,
    AssignmentDetailView,
    MyAssignmentsView,
    OthersAssignmentsView,
    UpdateDeadlineView,
    DeleteAssignmentView,
)

urlpatterns = [
    path(
        "",
        AssignmentListView.as_view(),
        name="assignment-list-create"
    ),
    path(
        "create/",
        AssignmentCreateView.as_view(),
        name="assignment-create"
    ),
    path(
        "mine/",
        MyAssignmentsView.as_view(),
        name="assignment-mine"
    ),
    path(
        "others/",
        OthersAssignmentsView.as_view(),
        name="assignment-others"
    ),
    path(
        "<int:pk>/",
        AssignmentDetailView.as_view(),
        name="assignment-detail"
    ),
    path(
        "<int:pk>/deadline/",
        UpdateDeadlineView.as_view(),
        name="assignment-deadline"
    ),
    path(
        "<int:pk>/delete/",
        DeleteAssignmentView.as_view(),
        name="assignment-delete"
    ),
]
