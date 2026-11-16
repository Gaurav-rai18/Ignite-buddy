"""
Normalized Schedule & TimetableSlot Models for Ignite Buddy (1NF)
Supports Phase 1 (Months 1-3 Foundation) and Phase 2 (Month 4 Specialization).
Eliminates unstructured JSON blobs with indexed relational slots.
"""
from django.db import models
from server.apps.accounts.models import User, Cohort, SubBatch, Stream, Lab, Subject


DAY_CODE_MAP = {
    0: "mon",
    1: "tue",
    2: "wed",
    3: "thu",
    4: "fri",
    5: "sat",
    6: "sun",
}


class Schedule(models.Model):
    PHASE_CHOICES = (
        ("FOUNDATION", "Months 1-3 (Foundation)"),
        ("SPECIALIZATION", "Month 4 (Specialization)"),
    )

    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, null=True, blank=True, related_name="schedules")
    title = models.CharField(max_length=255)
    effective_from = models.DateField(null=True, blank=True, db_index=True)
    effective_until = models.DateField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    phase = models.CharField(max_length=20, choices=PHASE_CHOICES, default="FOUNDATION", db_index=True)
    status = models.CharField(max_length=20, default="PUBLISHED")
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-is_active", "-effective_from", "-created_at"]

    def __str__(self):
        return f"{self.title} ({self.effective_from} to {self.effective_until})"

    @property
    def target_cohort(self):
        return self.cohort

    @property
    def grid_data(self):
        """
        Dynamically constructs structured timetable grid dictionary from normalized slots
        for JSON APIs and backward-compatible consumers.
        """
        sub_batches_dict = {}
        streams_dict = {}
        test_slots = []

        all_slots = self.slots.select_related("sub_batch", "stream", "lab", "subject", "evaluator").all()

        for slot in all_slots:
            day_code = DAY_CODE_MAP.get(slot.day_of_week, "mon")
            start_str = slot.start_time.strftime("%H:%M") if slot.start_time else "08:30"
            end_str = slot.end_time.strftime("%H:%M") if slot.end_time else "09:30"
            loc_str = slot.lab.name if slot.lab else "WA"

            # 12-hour AM/PM label for presentation
            start_12h = slot.start_time.strftime("%I:%M %p") if slot.start_time else "08:30 AM"
            end_12h = slot.end_time.strftime("%I:%M %p") if slot.end_time else "09:30 AM"

            slot_payload = {
                "id": slot.id,
                "title": slot.title or (slot.subject.name if slot.subject else "Lecture"),
                "subject": slot.subject.name if slot.subject else slot.title,
                "location": loc_str,
                "room": loc_str,
                "lab_code": slot.lab.code if slot.lab else loc_str,
                "start": start_str,
                "end": end_str,
                "start_12h": start_12h,
                "end_12h": end_12h,
                "time_label": f"{start_12h} - {end_12h}",
                "is_test": slot.is_assessment,
                "platform": slot.platform if slot.platform else None,
                "evaluator": slot.evaluator.get_full_name() if slot.evaluator else "",
            }

            if slot.sub_batch:
                sb_code = slot.sub_batch.name
                if sb_code not in sub_batches_dict:
                    sub_batches_dict[sb_code] = {"mon": [], "tue": [], "wed": [], "thu": [], "fri": [], "sat": []}
                sub_batches_dict[sb_code][day_code].append(slot_payload)

            if slot.stream:
                st_code = slot.stream.name
                if st_code not in streams_dict:
                    streams_dict[st_code] = {"mon": [], "tue": [], "wed": [], "thu": [], "fri": [], "sat": []}
                streams_dict[st_code][day_code].append(slot_payload)

            if slot.is_assessment:
                test_slots.append({
                    **slot_payload,
                    "day": day_code,
                    "sub_batch": slot.sub_batch.name if slot.sub_batch else "",
                    "stream": slot.stream.name if slot.stream else "",
                })

        return {
            "cohort": self.cohort.code if self.cohort else "B50",
            "phase": self.phase,
            "sub_batches": sub_batches_dict,
            "streams": streams_dict,
            "test_slots": test_slots,
        }

    @grid_data.setter
    def grid_data(self, value):
        self._pending_grid_data = value

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if getattr(self, "_pending_grid_data", None) is not None:
            from server.apps.schedules.views import _save_slots_from_payload
            _save_slots_from_payload(self, {"grid_data": self._pending_grid_data})
            self._pending_grid_data = None


class TimetableSlot(models.Model):
    """
    Atomic 1NF Lecture or Assessment Slot in the Weekly Timetable.
    """
    WEEKDAY_CHOICES = (
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
    )

    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name="slots")
    sub_batch = models.ForeignKey(SubBatch, on_delete=models.CASCADE, null=True, blank=True, related_name="slots")
    stream = models.ForeignKey(Stream, on_delete=models.CASCADE, null=True, blank=True, related_name="slots")

    day_of_week = models.IntegerField(choices=WEEKDAY_CHOICES, db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()

    subject = models.ForeignKey(Subject, null=True, blank=True, on_delete=models.SET_NULL, related_name="slots")
    title = models.CharField(max_length=150)  # e.g. "Incubator", "BizSkill", "Stream", "IO Exit"
    lab = models.ForeignKey(Lab, on_delete=models.PROTECT, related_name="slots")

    is_assessment = models.BooleanField(default=False, db_index=True)
    platform = models.CharField(max_length=100, blank=True, null=True, default=None)
    evaluator = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="proctored_slots")

    class Meta:
        ordering = ["day_of_week", "start_time"]
        indexes = [
            models.Index(fields=["sub_batch", "day_of_week", "start_time"]),
            models.Index(fields=["stream", "day_of_week", "start_time"]),
            models.Index(fields=["lab", "day_of_week", "start_time"]),
            models.Index(fields=["is_assessment", "day_of_week"]),
        ]

    def __str__(self):
        target = self.sub_batch.full_code if self.sub_batch else (self.stream.name if self.stream else "All")
        return f"[{self.get_day_of_week_display()} {self.start_time}-{self.end_time}] {self.title} @ {self.lab.name} ({target})"
