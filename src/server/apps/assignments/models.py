from django.db import models
from django.conf import settings


class Assignment(models.Model):
    STATUS_CHOICES = (
        ("DRAFT", "Draft"),
        ("PUBLISHED", "Published"),
        ("ARCHIVED", "Archived"),
    )

    RECIPIENT_CHOICES = (
        ("ALL", "All Users"),
        ("COHORT", "Cohort"),
        ("BATCH", "Batch"),
        ("SUB_BATCH", "Sub Batch"),
        ("STREAM", "Stream"),
    )

    topic = models.CharField(max_length=255)
    subject = models.ForeignKey(
        "accounts.Subject",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="assignments"
    )
    platform_link = models.URLField(blank=True)
    platform_name = models.CharField(max_length=100, blank=True)
    message = models.TextField(blank=True)

    recipient_mode = models.CharField(
        max_length=20,
        choices=RECIPIENT_CHOICES,
        default="ALL"
    )

    start_date = models.DateField()
    deadline = models.DateField(db_index=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="PUBLISHED"
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_assignments"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    cohort = models.ForeignKey(
        "accounts.Cohort",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assignments"
    )

    batches = models.ManyToManyField(
        "accounts.Batch",
        blank=True,
        related_name="assignments"
    )

    sub_batches = models.ManyToManyField(
        "accounts.SubBatch",
        blank=True,
        related_name="assignments"
    )

    streams = models.ManyToManyField(
        "accounts.Stream",
        blank=True,
        related_name="assignments"
    )

    class Meta:
        ordering = ["-created_at"]

    @property
    def subject_name(self):
        return self.subject.name if self.subject else ""

    def __str__(self):
        return f"{self.topic} ({self.subject_name})"
