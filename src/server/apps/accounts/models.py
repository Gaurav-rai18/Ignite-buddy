"""
Accounts & TCS Ignite Hierarchy Models

Hierarchy:
    Cohort (e.g. B49, B50)
      └── Batch (e.g. A, B, C)
            └── SubBatch (e.g. A1, A2, B1, B2)
                  └── User (Trainee)
                  └── Home Lab (Physical Training Lab)

Elective Tracks:
    Stream (e.g. AI Engineering, Springboot, Angular - active in Month 4)
      └── Trainees (enrolled users)
      └── StreamFaculty (primary & backup faculty)

Curriculum:
    Subject (e.g. Incubator, BizSkill, Core Java, Cloud, DevOps)
"""
from django.contrib.auth.models import AbstractUser, UserManager
from django.core.validators import RegexValidator
from django.db import models


class CustomUserManager(UserManager):
    """
    Manager that ensures superusers and staff are automatically assigned
    the ADMIN role instead of defaulting to TRAINEE.
    """
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        extra_fields.setdefault("role", "ADMIN")
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("must_change_password", False)
        return super().create_superuser(username, email, password, **extra_fields)

    def create_user(self, username, email=None, password=None, **extra_fields):
        if extra_fields.get("is_superuser") or extra_fields.get("is_staff"):
            extra_fields.setdefault("role", "ADMIN")
        return super().create_user(username, email, password, **extra_fields)


class Cohort(models.Model):
    """
    TCS Ignite Program Cohort (e.g. B49, B50, B51).
    Top-level intake grouping representing 300-500 trainees across a 4-month program.
    """
    code = models.CharField(max_length=20, unique=True, db_index=True)  # e.g. "B50"
    name = models.CharField(max_length=100, blank=True)  # e.g. "Ignite Batch 50"
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-code"]

    def __str__(self):
        return self.code


class Batch(models.Model):
    """
    Major Track / Section within a Cohort (e.g. A, B, C).
    """
    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name="batches")
    name = models.CharField(max_length=20)  # e.g. "A", "B", "C"
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("cohort", "name")
        ordering = ["cohort__code", "name"]
        verbose_name_plural = "Batches"

    @property
    def full_code(self):
        return f"{self.cohort.code}-{self.name}"

    def __str__(self):
        return self.full_code


class Lab(models.Model):
    """
    Physical Computer Lab / Training Room / Work Area in the Ignite facility.
    e.g. Lab 1, Lab 2, WA (Work Area), TS (Training Suite), TR1, TR2, COE 2.
    """
    code = models.CharField(max_length=50, unique=True, blank=True)
    name = models.CharField(max_length=100, unique=True)
    capacity = models.PositiveIntegerField(default=35)
    location = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.code:
            base_code = self.name.strip().replace(" ", "-").upper()[:40] or "LAB"
            code = base_code
            counter = 1
            while Lab.objects.filter(code__iexact=code).exclude(pk=self.pk).exists():
                code = f"{base_code}-{counter}"
                counter += 1
            self.code = code
        super().save(*args, **kwargs)

    @classmethod
    def get_or_create_by_name(cls, loc_str):
        clean_name = str(loc_str or "WA").strip()
        if not clean_name:
            clean_name = "WA"
        # 1. Exact or case-insensitive match by name or code
        lab = cls.objects.filter(name__iexact=clean_name).first() or cls.objects.filter(code__iexact=clean_name).first()
        if lab:
            return lab
        # 2. Match without whitespace/punctuation
        normalized = clean_name.replace(" ", "").upper()
        for existing in cls.objects.all():
            if existing.name.replace(" ", "").upper() == normalized or existing.code.replace(" ", "").upper() == normalized:
                return existing
        # 3. Create safely with a unique code
        base_code = clean_name.replace(" ", "-").upper()[:40] or "LAB"
        code = base_code
        counter = 1
        while cls.objects.filter(code__iexact=code).exists():
            code = f"{base_code}-{counter}"
            counter += 1
        lab, _ = cls.objects.get_or_create(
            name=clean_name,
            defaults={"code": code, "capacity": 35}
        )
        return lab

    def __str__(self):
        return f"{self.name} ({self.code})"


class SubBatch(models.Model):
    """
    Hands-on Practical / Lab Group of 20-35 trainees (e.g. A1, A2, B1, B2).
    """
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name="sub_batches")
    name = models.CharField(max_length=20)  # e.g. "A1", "A2", "B1"
    home_lab = models.ForeignKey(Lab, null=True, blank=True, on_delete=models.SET_NULL, related_name="home_sub_batches")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("batch", "name")
        ordering = ["batch__cohort__code", "name"]
        verbose_name_plural = "Sub Batches"

    @property
    def full_code(self):
        return f"{self.batch.full_code}-{self.name}"

    def __str__(self):
        return self.full_code


class Stream(models.Model):
    """
    Elective Technical Specialization Track for Month 4.
    e.g. AI Engineering, Springboot, Angular, Automation, PLSQL, DevOps, Cloud, Cybersecurity, .NET, Data Engineering.
    """
    code = models.CharField(max_length=50, unique=True, db_index=True)  # e.g. "AI_ENG", "SPRINGBOOT"
    name = models.CharField(max_length=100)                             # e.g. "AI Engineering"
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def get_or_create_by_name(cls, st_name):
        clean_name = str(st_name or "General").strip()
        stream = cls.objects.filter(name__iexact=clean_name).first() or cls.objects.filter(code__iexact=clean_name).first()
        if stream:
            return stream
        base_code = clean_name.replace(" ", "_").upper()[:40] or "STREAM"
        code = base_code
        counter = 1
        while cls.objects.filter(code__iexact=code).exists():
            code = f"{base_code}_{counter}"
            counter += 1
        stream, _ = cls.objects.get_or_create(
            name=clean_name,
            defaults={"code": code}
        )
        return stream

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Subject(models.Model):
    """
    Master Curriculum Course / Subject entity.
    Covers Months 1-3 Core (Incubator, BizSkill) and Month 4 Technical Specializations.
    """
    code = models.CharField(max_length=50, unique=True, db_index=True)  # e.g. "INCUBATOR", "BIZSKILL", "AI_ENG"
    name = models.CharField(max_length=100)                             # e.g. "Incubator", "BizSkill"
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class User(AbstractUser):
    """
    Custom User Model for Ignite Buddy.
    Supports Role-Based Access Control, normalized SubBatch hierarchy, and Month 4 Stream assignment.
    """
    ROLE_CHOICES = (
        ("ADMIN", "Admin"),
        ("TRAINEE", "Trainee"),
        ("TA", "Teaching Assistant"),
        ("FACULTY", "Faculty / Instructor"),
        ("OWNER", "Batch / Track Owner"),
        ("HR", "Human Resources"),
        ("MANAGER", "Manager"),
    )

    username = models.CharField(
        max_length=150,
        unique=False,
        blank=True,
        validators=[
            RegexValidator(
                regex=r"^[\w\s.@+-]+$",
                message="Enter a valid username. Letters, digits, spaces, and @/./+/-/_ characters are allowed.",
            )
        ],
    )
    email = models.EmailField(unique=True, db_index=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="TRAINEE", db_index=True)

    # Trainees belong strictly to a Sub-Batch (e.g. B50-A1). Batch and Cohort are derived dynamically.
    sub_batch = models.ForeignKey(
        SubBatch, null=True, blank=True, on_delete=models.SET_NULL, related_name="trainees"
    )

    # Elective Stream track (assigned in Month 4)
    stream = models.ForeignKey(
        Stream, null=True, blank=True, on_delete=models.SET_NULL, related_name="trainees"
    )

    employee_id = models.CharField(
        max_length=7,
        unique=True,
        null=True,
        blank=True,
        validators=[
            RegexValidator(
                regex=r"^\d{7}$",
                message="Employee ID must be a 7-digit integer.",
            )
        ],
    )
    accops_id = models.CharField(max_length=128, blank=True)  # Accops VDI identifier
    department = models.CharField(max_length=100, blank=True, default="TCS Ignite Training")
    designation = models.CharField(max_length=100, blank=True, default="")
    profile_picture = models.TextField(blank=True, default="")
    last_active_at = models.DateTimeField(null=True, blank=True)
    must_change_password = models.BooleanField(default=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    objects = CustomUserManager()

    def clean(self):
        super().clean()
        if not self.employee_id:
            self.employee_id = None
        elif isinstance(self.employee_id, str):
            self.employee_id = self.employee_id.strip()

    def save(self, *args, **kwargs):
        if not self.employee_id:
            self.employee_id = None
        elif isinstance(self.employee_id, str):
            self.employee_id = self.employee_id.strip()
        if (self.is_superuser or self.is_staff) and self.role == "TRAINEE":
            self.role = "ADMIN"
        if self.is_superuser:
            self.must_change_password = False
        super().save(*args, **kwargs)

    @property
    def cohort_code(self):
        return self.sub_batch.batch.cohort.code if self.sub_batch else ""

    @property
    def batch_code(self):
        return self.sub_batch.batch.name if self.sub_batch else ""

    @property
    def sub_batch_code(self):
        return self.sub_batch.name if self.sub_batch else ""

    @property
    def full_batch_name(self):
        return self.sub_batch.full_code if self.sub_batch else "Unassigned"

    @property
    def stream_name(self):
        return self.stream.name if self.stream else ""

    def __str__(self):
        return f"{self.email} ({self.role})"


class SubBatchStaff(models.Model):
    """
    Governance and staffing assignments per Sub-Batch.
    Captures Primary TA, Backup TA, and Batch Owner as mapped in the campus timetable.
    """
    STAFF_ROLE_CHOICES = (
        ("PRIMARY_TA", "Primary TA"),
        ("BACKUP_TA", "Backup TA"),
        ("OWNER", "Batch Owner / Lead"),
    )
    sub_batch = models.ForeignKey(SubBatch, on_delete=models.CASCADE, related_name="staff_assignments")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sub_batch_roles")
    role = models.CharField(max_length=20, choices=STAFF_ROLE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("sub_batch", "user", "role")

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} - {self.role} for {self.sub_batch.full_code}"


class StreamFaculty(models.Model):
    """
    Faculty allocations for technical streams (Month 4).
    Captures primary and backup faculty.
    """
    stream = models.ForeignKey(Stream, on_delete=models.CASCADE, related_name="faculty_assignments")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="stream_roles")
    is_primary = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("stream", "user")

    def __str__(self):
        role_label = "Primary Faculty" if self.is_primary else "Backup Faculty"
        return f"{self.user.get_full_name() or self.user.username} ({role_label}) - {self.stream.name}"
