"""
API tests for the documents (RAG knowledge base) app.

Covers listing, space filtering, upload validation, detail retrieval, deletion
and the knowledge-base statistics endpoint, plus authentication requirements.
Files are written to a temporary MEDIA_ROOT so the repository is never polluted.
"""
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import User, Cohort, Batch
from server.apps.documents.models import KnowledgeDocument
from server.apps.documents.views import format_file_size
from server.knowledge.store import KnowledgeBase, set_kb


def auth_client(user):
    client = APIClient()
    token = RefreshToken.for_user(user).access_token
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


class FormatFileSizeTests(TestCase):
    def test_human_readable_sizes(self):
        self.assertEqual(format_file_size(0), "0 B")
        self.assertEqual(format_file_size(512), "512.0 B")
        self.assertEqual(format_file_size(2048), "2.0 KB")
        self.assertEqual(format_file_size(1024 * 1024), "1.0 MB")


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="ignite_test_media_"))
class DocumentApiTests(TestCase):
    def setUp(self):
        self._test_kb_dir = tempfile.mkdtemp(prefix="ignite_test_kb_")
        set_kb(KnowledgeBase(path=self._test_kb_dir))
        self.admin = User.objects.create_user(
            username="Doc Admin", email="admin.docapi@tcs.com", password="Pass@1234",
            role="ADMIN", is_staff=True,
        )
        self.trainee = User.objects.create_user(
            username="Doc Trainee", email="t.docapi@tcs.com", password="Pass@1234",
            role="TRAINEE",
        )
        self.client = auth_client(self.admin)

    def tearDown(self):
        set_kb(None)

    def _upload(self, name="notes.txt", content=b"hello ignite", space="general", **extra):
        f = SimpleUploadedFile(name, content, content_type="text/plain")
        payload = {"file": f, "name": name, "space": space}
        payload.update(extra)
        return self.client.post("/api/documents/", payload, format="multipart")

    def test_list_requires_authentication(self):
        res = APIClient().get("/api/documents/")
        self.assertEqual(res.status_code, 401)

    def test_upload_requires_file(self):
        res = self.client.post("/api/documents/", {"name": "No file"}, format="multipart")
        self.assertEqual(res.status_code, 400)

    def test_upload_success_returns_metadata(self):
        res = self._upload()
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["name"], "notes.txt")
        self.assertEqual(res.data["space"], "general")
        self.assertEqual(res.data["fileType"], "TXT")
        self.assertEqual(res.data["sizeFormatted"], "12.0 B")
        self.assertIn("fileHash", res.data)

    def test_invalid_space_falls_back_to_general(self):
        res = self._upload(space="bogus")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["space"], "general")

    def test_list_returns_uploads_and_space_filter(self):
        self._upload(name="a.txt", content=b"aaa", space="general")
        self._upload(name="b.txt", content=b"bbb", space="ignite")

        res = self.client.get("/api/documents/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

        res = self.client.get("/api/documents/?space=ignite")
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["space"], "ignite")

    def test_upload_links_cohort_and_batch(self):
        cohort = Cohort.objects.create(code="B50", name="Ignite 50")
        batch = Batch.objects.create(cohort=cohort, name="A")
        res = self._upload(name="scoped.txt", content=b"scoped", cohort_id=cohort.id, batch_id=batch.id)
        self.assertEqual(res.status_code, 201)

        doc = KnowledgeDocument.objects.get(id=res.data["id"])
        self.assertEqual(doc.target_cohort, cohort)
        self.assertEqual(doc.target_batch, batch)

    def test_detail_get_and_404(self):
        created = self._upload()
        doc_id = created.data["id"]

        res = self.client.get(f"/api/documents/{doc_id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["name"], "notes.txt")

        self.assertEqual(self.client.get("/api/documents/999999/").status_code, 404)

    def test_delete_removes_document(self):
        created = self._upload()
        doc_id = created.data["id"]

        res = self.client.delete(f"/api/documents/{doc_id}/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["success"])
        self.assertFalse(KnowledgeDocument.objects.filter(id=doc_id).exists())

    def test_delete_missing_returns_404(self):
        self.assertEqual(self.client.delete("/api/documents/999999/").status_code, 404)

    def test_stats_endpoint_reports_counts(self):
        self._upload(name="a.txt", content=b"aaa", space="general")
        self._upload(name="b.txt", content=b"bbb", space="ignite")

        res = self.client.get("/api/documents/stats/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["total_documents"], 2)
        self.assertEqual(res.data["general_documents"], 1)
        self.assertEqual(res.data["ignite_documents"], 1)
        self.assertIn("spaces", res.data)
