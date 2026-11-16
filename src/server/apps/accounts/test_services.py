"""Unit tests for the accounts service layer (``services.py``).

These tests call the service functions directly (unit level) rather than going
through the HTTP layer. They assert exact return values, the resulting DB rows
and any side effects, covering happy paths, malformed inputs, missing/blank
fields, duplicates and error branches.
"""
import io
from unittest import mock

import openpyxl
from django.test import TestCase

from server.apps.accounts import services
from server.apps.accounts.models import (
    Batch,
    Cohort,
    Stream,
    SubBatch,
    User,
)


class _NamedBytesIO(io.BytesIO):
    """BytesIO carrying a ``.name`` so the service can detect the file type."""

    def __init__(self, data=b"", name=""):
        super().__init__(data)
        self.name = name


def _xlsx_bytes(rows):
    """Build an in-memory .xlsx workbook and return its raw bytes."""
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class ServicesTestBase(TestCase):
    """Clears the module level sub-batch cache around every test."""

    def setUp(self):
        services._sub_batch_cache.clear()

    def tearDown(self):
        services._sub_batch_cache.clear()


# ---------------------------------------------------------------------------
# create_user
# ---------------------------------------------------------------------------
class CreateUserServiceTests(ServicesTestBase):
    def test_create_trainee_hashes_password_and_requires_change(self):
        data = {
            "username": "New Trainee",
            "email": "new.trainee@tcs.com",
            "password": "Pass@1234",
            "role": "TRAINEE",
            "employee_id": "1234567",
        }
        user = services.create_user(data)

        self.assertIsInstance(user, User)
        self.assertEqual(user.email, "new.trainee@tcs.com")
        self.assertEqual(user.role, "TRAINEE")
        self.assertEqual(user.employee_id, "1234567")
        self.assertTrue(user.check_password("Pass@1234"))
        self.assertNotEqual(user.password, "Pass@1234")
        self.assertTrue(user.must_change_password)
        self.assertEqual(User.objects.filter(email="new.trainee@tcs.com").count(), 1)
        self.assertNotIn("password", data)

    def test_create_non_staff_requires_change(self):
        user = services.create_user({
            "username": "TA User",
            "email": "ta.create@tcs.com",
            "password": "Pass@1234",
            "role": "TA",
        })
        self.assertEqual(user.role, "TA")
        self.assertTrue(user.must_change_password)

    def test_create_staff_admin_does_not_require_change(self):
        user = services.create_user({
            "username": "Admin User",
            "email": "adm.create@tcs.com",
            "password": "Pass@1234",
            "role": "ADMIN",
            "is_staff": True,
        })
        self.assertFalse(user.must_change_password)

    def test_missing_ids_default_to_blank(self):
        user = services.create_user({
            "username": "No Ids",
            "email": "no.ids@tcs.com",
            "password": "Pass@1234",
            "role": "TA",
        })
        self.assertIsNone(user.employee_id)
        self.assertEqual(user.accops_id, "")

    def test_explicit_none_ids_are_normalised(self):
        user = services.create_user({
            "username": "None Ids",
            "email": "none.ids@tcs.com",
            "password": "Pass@1234",
            "role": "TRAINEE",
            "employee_id": None,
            "accops_id": None,
        })
        self.assertIsNone(user.employee_id)
        self.assertEqual(user.accops_id, "")


# ---------------------------------------------------------------------------
# change_password / reset_password
# ---------------------------------------------------------------------------
class PasswordServiceTests(ServicesTestBase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            username="P User", email="pwd@tcs.com", password="Old@1234",
            role="TRAINEE", employee_id="7000001",
        )

    def test_change_password_updates_hash_and_clears_flag(self):
        self.user.must_change_password = True
        self.user.save()

        returned = services.change_password(self.user, "NewPass@1234")
        self.user.refresh_from_db()

        self.assertEqual(returned.pk, self.user.pk)
        self.assertTrue(self.user.check_password("NewPass@1234"))
        self.assertFalse(self.user.check_password("Old@1234"))
        self.assertFalse(self.user.must_change_password)

    def test_reset_password_updates_hash_and_sets_flag(self):
        self.user.must_change_password = False
        self.user.save()

        returned = services.reset_password(self.user, "Reset@1234")
        self.user.refresh_from_db()

        self.assertEqual(returned.pk, self.user.pk)
        self.assertTrue(self.user.check_password("Reset@1234"))
        self.assertFalse(self.user.check_password("Old@1234"))
        self.assertTrue(self.user.must_change_password)


# ---------------------------------------------------------------------------
# activate_user / deactivate_user
# ---------------------------------------------------------------------------
class ActivationServiceTests(ServicesTestBase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            username="A User", email="act@tcs.com", password="Pass@1234", role="TA",
        )

    def test_deactivate_then_activate(self):
        services.deactivate_user(self.user)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

        returned = services.activate_user(self.user)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)
        self.assertEqual(returned.pk, self.user.pk)


# ---------------------------------------------------------------------------
# sub_batch_name_clean
# ---------------------------------------------------------------------------
class SubBatchNameCleanTests(ServicesTestBase):
    def test_blank_and_null_markers_return_empty(self):
        for val in [None, "", "   ", "nan", "NAN", "NaN", "none", "None", "null", "NULL"]:
            with self.subTest(val=val):
                self.assertEqual(services.sub_batch_name_clean(val), "")

    def test_valid_values_are_trimmed(self):
        self.assertEqual(services.sub_batch_name_clean("A1"), "A1")
        self.assertEqual(services.sub_batch_name_clean("  B2 "), "B2")

    def test_numeric_values_are_stringified(self):
        self.assertEqual(services.sub_batch_name_clean(0), "0")
        self.assertEqual(services.sub_batch_name_clean(123), "123")


# ---------------------------------------------------------------------------
# normalize_header
# ---------------------------------------------------------------------------
class NormalizeHeaderTests(ServicesTestBase):
    def test_none_returns_empty(self):
        self.assertEqual(services.normalize_header(None), "")

    def test_known_aliases_are_mapped(self):
        cases = {
            "Name": "username",
            "Full Name": "username",
            "User Name": "username",
            "Trainee Name": "username",
            "Mail": "email",
            "Email ID": "email",
            "Emp ID": "employee_id",
            "ID": "employee_id",
            "Trainee ID": "employee_id",
            "empid": "employee_id",
            "employeeid": "employee_id",
            "User Role": "role",
            "SubBatch": "sub_batch",
            "Sub Batch Name": "sub_batch",
            "Section": "sub_batch",
            "Cohort Code": "cohort",
            "Stream Name": "stream",
            "Stream Code": "stream",
            "Track": "stream",
            "Elective": "stream",
            "Accops": "accops_id",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(services.normalize_header(raw), expected)

    def test_separators_are_normalised(self):
        self.assertEqual(services.normalize_header("Employee-ID"), "employee_id")
        self.assertEqual(services.normalize_header("  Spaced   Header  "), "spaced_header")

    def test_unknown_header_is_passed_through(self):
        self.assertEqual(services.normalize_header("Unknown Column"), "unknown_column")


# ---------------------------------------------------------------------------
# resolve_or_create_sub_batch
# ---------------------------------------------------------------------------
class ResolveOrCreateSubBatchTests(ServicesTestBase):
    def test_empty_inputs_return_none(self):
        self.assertIsNone(services.resolve_or_create_sub_batch(""))
        self.assertIsNone(services.resolve_or_create_sub_batch(None))

    def test_whitespace_only_input_is_not_treated_as_empty(self):
        # Guard checks ``not raw_batch_str`` on the *unstripped* value, so a
        # whitespace-only string slips through and yields an empty-named sub-batch.
        sb = services.resolve_or_create_sub_batch("   ")
        self.assertIsNotNone(sb)
        self.assertEqual(sb.name, "")
        self.assertEqual(sb.batch.cohort.code, "B50")

    def test_compound_code_with_hyphen(self):
        sb = services.resolve_or_create_sub_batch("B50-A1")
        self.assertEqual(sb.name, "A1")
        self.assertEqual(sb.batch.name, "A")
        self.assertEqual(sb.batch.cohort.code, "B50")
        self.assertEqual(sb.full_code, "B50-A-A1")

    def test_compound_code_with_separators(self):
        sb = services.resolve_or_create_sub_batch("B51-A-2")
        self.assertEqual(sb.name, "A2")
        self.assertEqual(sb.batch.name, "A")
        self.assertEqual(sb.batch.cohort.code, "B51")

    def test_compound_code_with_redundant_sub_batch_name(self):
        sb = services.resolve_or_create_sub_batch("B52-B-B1")
        self.assertEqual(sb.name, "B1")
        self.assertEqual(sb.batch.name, "B")
        self.assertEqual(sb.batch.cohort.code, "B52")

    def test_short_code_uses_defaults(self):
        sb = services.resolve_or_create_sub_batch("A1")
        self.assertEqual(sb.name, "A1")
        self.assertEqual(sb.batch.name, "A")
        self.assertEqual(sb.batch.cohort.code, "B50")

    def test_short_code_uses_cohort_hint(self):
        sb = services.resolve_or_create_sub_batch("C3", cohort_hint="B99", batch_hint="X")
        self.assertEqual(sb.name, "C3")
        # batch letter is derived from the short code itself
        self.assertEqual(sb.batch.name, "C")
        self.assertEqual(sb.batch.cohort.code, "B99")

    def test_unmatched_value_creates_default_hierarchy(self):
        sb = services.resolve_or_create_sub_batch("XYZ")
        self.assertEqual(sb.name, "XYZ")
        self.assertEqual(sb.batch.name, "A")
        self.assertEqual(sb.batch.cohort.code, "B50")

    def test_lowercase_and_whitespace_are_normalised(self):
        sb = services.resolve_or_create_sub_batch("  b53-a1  ")
        self.assertEqual(sb.batch.cohort.code, "B53")
        self.assertEqual(sb.batch.name, "A")
        self.assertEqual(sb.name, "A1")

    def test_reuses_existing_hierarchy(self):
        cohort = Cohort.objects.create(code="B60", name="Existing")
        batch = Batch.objects.create(cohort=cohort, name="A")
        existing = SubBatch.objects.create(batch=batch, name="A1")

        sb = services.resolve_or_create_sub_batch("B60-A1")

        self.assertEqual(sb.pk, existing.pk)
        self.assertEqual(Cohort.objects.filter(code="B60").count(), 1)
        self.assertEqual(Batch.objects.filter(cohort=cohort).count(), 1)
        self.assertEqual(SubBatch.objects.filter(batch=batch).count(), 1)

    def test_cache_returns_same_instance(self):
        first = services.resolve_or_create_sub_batch("B70-A5")
        second = services.resolve_or_create_sub_batch("B70-A5")

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(SubBatch.objects.filter(name="A5", batch__cohort__code="B70").count(), 1)

    def test_db_error_returns_none(self):
        with mock.patch.object(
            services.Cohort.objects, "get_or_create", side_effect=Exception("db down")
        ):
            self.assertIsNone(services.resolve_or_create_sub_batch("B80-A1"))


# ---------------------------------------------------------------------------
# _load_rows_from_file_or_text
# ---------------------------------------------------------------------------
class LoadRowsTests(ServicesTestBase):
    def test_string_is_parsed_as_csv(self):
        rows = services._load_rows_from_file_or_text("a,b\n1,2\n")
        self.assertEqual(rows, [["a", "b"], ["1", "2"]])

    def test_csv_file_handles_utf8_bom(self):
        f = _NamedBytesIO("name,email\nAlice,a@tcs.com\n".encode("utf-8-sig"), name="people.csv")
        rows = services._load_rows_from_file_or_text(f)
        self.assertEqual(rows[0], ["name", "email"])
        self.assertEqual(rows[1], ["Alice", "a@tcs.com"])

    def test_csv_file_falls_back_to_latin1(self):
        f = _NamedBytesIO("name\ncaf\u00e9\n".encode("latin-1"), name="people.csv")
        rows = services._load_rows_from_file_or_text(f)
        self.assertEqual(rows[1], ["caf\u00e9"])

    def test_xlsx_file_is_parsed(self):
        data = _xlsx_bytes([["username", "email"], ["Alice", "a@tcs.com"]])
        rows = services._load_rows_from_file_or_text(_NamedBytesIO(data, name="people.xlsx"))
        self.assertEqual(tuple(rows[0]), ("username", "email"))
        self.assertEqual(tuple(rows[1]), ("Alice", "a@tcs.com"))

    def test_non_excel_file_falls_back_to_csv(self):
        f = _NamedBytesIO(b"a,b\n1,2\n", name="data.txt")
        rows = services._load_rows_from_file_or_text(f)
        self.assertEqual(rows, [["a", "b"], ["1", "2"]])

    def test_non_excel_file_latin1_fallback(self):
        f = _NamedBytesIO("name\ncaf\u00e9\n".encode("latin-1"), name="data.txt")
        rows = services._load_rows_from_file_or_text(f)
        self.assertEqual(rows[1], ["caf\u00e9"])

    def test_non_bytes_stream_falls_back_to_str(self):
        class _StrReader:
            name = "data.txt"

            def seek(self, *args):
                pass

            def read(self):
                return "x,y\n3,4\n"

        rows = services._load_rows_from_file_or_text(_StrReader())
        self.assertEqual(rows, [["x", "y"], ["3", "4"]])


# ---------------------------------------------------------------------------
# bulk_create_users
# ---------------------------------------------------------------------------
class BulkCreateUsersTests(ServicesTestBase):
    def test_empty_input_returns_no_rows_error(self):
        res = services.bulk_create_users("")
        self.assertEqual(res, {
            "created_count": 0,
            "failed_count": 0,
            "errors": ["File contains no data rows."],
        })

    def test_header_only_returns_no_user_rows(self):
        res = services.bulk_create_users("username,email,role\n")
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 0)
        self.assertEqual(res["errors"], ["File contains no user rows."])

    def test_read_failure_is_reported(self):
        class _Boom:
            name = "boom.csv"

            def read(self):
                raise ValueError("nope")

        res = services.bulk_create_users(_Boom())
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 0)
        self.assertEqual(len(res["errors"]), 1)
        self.assertTrue(res["errors"][0].startswith("Failed to read file:"))
        self.assertIn("nope", res["errors"][0])

    def test_over_limit_is_rejected(self):
        rows = ["username,email,role"] + [f"U{i},u{i}@tcs.com,TA" for i in range(601)]
        res = services.bulk_create_users("\n".join(rows))
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 0)
        self.assertIn("maximum bulk upload limit is 600", res["errors"][0])
        self.assertEqual(User.objects.count(), 0)

    def test_valid_rows_created_with_defaults(self):
        stream = Stream.objects.create(code="AI", name="AI Engineering")
        csv_text = (
            "username,email,role,employee_id,sub_batch,stream,accops_id\n"
            "Alice Smith,alice@tcs.com,TRAINEE,2819001,A1,AI,VDI-1\n"
            "Bob Jones,bob@tcs.com,TA,,,,\n"
        )

        res = services.bulk_create_users(csv_text)

        self.assertEqual(res["created_count"], 2)
        self.assertEqual(res["failed_count"], 0)
        self.assertEqual(res["errors"], [])

        alice = User.objects.get(email="alice@tcs.com")
        self.assertEqual(alice.role, "TRAINEE")
        self.assertEqual(alice.employee_id, "2819001")
        self.assertEqual(alice.accops_id, "VDI-1")
        self.assertEqual(alice.sub_batch.name, "A1")
        self.assertEqual(alice.sub_batch.batch.cohort.code, "B50")
        self.assertEqual(alice.stream_id, stream.id)
        self.assertTrue(alice.must_change_password)
        self.assertTrue(alice.check_password("Temp@123"))

        bob = User.objects.get(email="bob@tcs.com")
        self.assertIsNone(bob.employee_id)
        self.assertIsNone(bob.sub_batch)
        self.assertIsNone(bob.stream)

    def test_header_aliases_are_resolved(self):
        csv_text = "Full Name,Email ID,Emp ID,User Role\nAlias Guy,alias@tcs.com,2819010,TRAINEE\n"
        res = services.bulk_create_users(csv_text)

        self.assertEqual(res["created_count"], 1)
        user = User.objects.get(email="alias@tcs.com")
        self.assertEqual(user.username, "Alias Guy")
        self.assertEqual(user.employee_id, "2819010")
        self.assertEqual(user.role, "TRAINEE")

    def test_missing_username_row_is_counted_as_failure(self):
        csv_text = "username,email,role\n,no.user@tcs.com,TRAINEE\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("Missing username", res["errors"][0])

    def test_invalid_email_is_rejected(self):
        csv_text = "username,email,role\nBad,bademail,TA\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("Invalid or missing email", res["errors"][0])

    def test_missing_email_is_rejected(self):
        csv_text = "username,email,role\nNoMail,,TA\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("Invalid or missing email", res["errors"][0])

    def test_invalid_role_is_rejected(self):
        csv_text = "username,email,role\nFac,fac@tcs.com,FACULTY\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("Invalid role 'FACULTY'", res["errors"][0])

    def test_blank_role_is_rejected(self):
        csv_text = "username,email,role\nBlank,blank@tcs.com,\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("Invalid role ''", res["errors"][0])

    def test_duplicate_email_in_file(self):
        csv_text = (
            "username,email,role,employee_id\n"
            "A,dup@tcs.com,TRAINEE,2819001\n"
            "B,dup@tcs.com,TRAINEE,2819002\n"
        )
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 1)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("already exists", res["errors"][0])

    def test_duplicate_email_existing_in_db(self):
        User.objects.create_user(
            username="Existing", email="ex@tcs.com", password="Pass@1234", role="TA",
        )
        csv_text = "username,email,role\nNew,ex@tcs.com,TA\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("already exists", res["errors"][0])

    def test_invalid_employee_id_is_rejected(self):
        csv_text = "username,email,role,employee_id\nShort,short@tcs.com,TRAINEE,12345\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("must be a 7-digit integer", res["errors"][0])

    def test_duplicate_employee_id_in_file(self):
        csv_text = (
            "username,email,role,employee_id\n"
            "A,a@tcs.com,TRAINEE,2819001\n"
            "B,b@tcs.com,TRAINEE,2819001\n"
        )
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 1)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("Employee ID '2819001' already exists", res["errors"][0])

    def test_duplicate_employee_id_existing_in_db(self):
        User.objects.create_user(
            username="E", email="e@tcs.com", password="Pass@1234",
            role="TA", employee_id="2819001",
        )
        csv_text = "username,email,role,employee_id\nN,n@tcs.com,TRAINEE,2819001\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("already exists", res["errors"][0])

    def test_trainee_requires_employee_id(self):
        csv_text = "username,email,role\nNoEmp,noemp@tcs.com,TRAINEE\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("7-digit Employee ID is required for trainees", res["errors"][0])

    def test_null_employee_marker_treated_as_missing(self):
        csv_text = "username,email,role,employee_id\nN,n@tcs.com,TRAINEE,NAN\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("7-digit Employee ID is required for trainees", res["errors"][0])

    def test_employee_id_taken_from_numeric_username(self):
        csv_text = "username,email,role\n2819555,dig@tcs.com,TRAINEE\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 1)
        user = User.objects.get(email="dig@tcs.com")
        self.assertEqual(user.username, "2819555")
        self.assertEqual(user.employee_id, "2819555")

    def test_dotted_employee_id_is_normalised(self):
        csv_text = "username,email,role,employee_id\nDot,dot@tcs.com,TA,2819003.0\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 1)
        self.assertEqual(User.objects.get(email="dot@tcs.com").employee_id, "2819003")

    def test_malformed_dotted_employee_id_is_rejected(self):
        # A value containing "." that cannot be coerced to a number must not
        # crash the row and is ultimately rejected by the 7-digit check.
        csv_text = "username,email,role,employee_id\nD,d@tcs.com,TA,12.3.4\n"
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("must be a 7-digit integer", res["errors"][0])

    def test_row_level_exception_is_captured(self):
        csv_text = (
            "username,email,role,employee_id,sub_batch\n"
            "Boom,boom@tcs.com,TRAINEE,2819001,A1\n"
        )
        with mock.patch.object(
            services, "resolve_or_create_sub_batch", side_effect=Exception("kaboom")
        ):
            res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 1)
        self.assertIn("kaboom", res["errors"][0])

    def test_sub_batch_with_cohort_and_batch_hints(self):
        csv_text = (
            "username,email,role,employee_id,cohort_code,batch_name,sub_batch\n"
            "Hint,hint@tcs.com,TRAINEE,2819004,B99,D,D1\n"
        )
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 1)
        user = User.objects.get(email="hint@tcs.com")
        self.assertEqual(user.sub_batch.name, "D1")
        self.assertEqual(user.sub_batch.batch.name, "D")
        self.assertEqual(user.sub_batch.batch.cohort.code, "B99")

    def test_sub_batch_compound_code_column(self):
        csv_text = (
            "username,email,role,employee_id,sub_batch\n"
            "Comp,comp@tcs.com,TRAINEE,2819005,B50-A2\n"
        )
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 1)
        user = User.objects.get(email="comp@tcs.com")
        self.assertEqual(user.sub_batch.name, "A2")
        self.assertEqual(user.sub_batch.batch.cohort.code, "B50")

    def test_stream_resolved_by_code_case_insensitive(self):
        Stream.objects.create(code="SPRINGBOOT", name="Spring Boot")
        csv_text = (
            "username,email,role,employee_id,stream\n"
            "S,s@tcs.com,TRAINEE,2819006,springboot\n"
        )
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 1)
        self.assertEqual(User.objects.get(email="s@tcs.com").stream.code, "SPRINGBOOT")

    def test_stream_null_marker_ignored(self):
        csv_text = (
            "username,email,role,employee_id,stream\n"
            "S2,s2@tcs.com,TRAINEE,2819007,none\n"
        )
        res = services.bulk_create_users(csv_text)
        self.assertEqual(res["created_count"], 1)
        self.assertIsNone(User.objects.get(email="s2@tcs.com").stream)

    def test_errors_are_truncated_to_thirty(self):
        rows = ["username,email,role"] + [f"U{i},bad{i},TA" for i in range(35)]
        res = services.bulk_create_users("\n".join(rows))
        self.assertEqual(res["created_count"], 0)
        self.assertEqual(res["failed_count"], 35)
        self.assertEqual(len(res["errors"]), 30)

    def test_bulk_create_from_xlsx_with_numeric_cells(self):
        data = _xlsx_bytes([
            ["username", "email", "role", "employee_id"],
            [None, None, None, None],
            [1234567.0, "num@tcs.com", "TRAINEE", 2819001.0],
        ])
        res = services.bulk_create_users(_NamedBytesIO(data, name="upload.xlsx"))

        self.assertEqual(res["created_count"], 1)
        self.assertEqual(res["failed_count"], 0)
        user = User.objects.get(email="num@tcs.com")
        self.assertEqual(user.username, "1234567")
        self.assertEqual(user.employee_id, "2819001")
