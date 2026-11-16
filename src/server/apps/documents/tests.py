import io
import hashlib
import tempfile
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from server.apps.accounts.models import User
from server.apps.documents.models import KnowledgeDocument
from server.knowledge.store import KnowledgeBase, set_kb


class DocumentDuplicatePreventionTests(TestCase):
    def setUp(self):
        self._test_kb_dir = tempfile.mkdtemp(prefix="ignite_test_kb_")
        set_kb(KnowledgeBase(path=self._test_kb_dir))
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="Admin Tester",
            email="admin.doc.test@tcs.com",
            password="SecurePassword@123",
            role="ADMIN",
            employee_id="20001",
            is_staff=True,
        )
        refresh = RefreshToken.for_user(self.admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.access_token}")

    def tearDown(self):
        set_kb(None)

    def test_upload_document_saves_sha256_hash(self):
        content = b"TCS Ignite Training Guidelines and Lab Protocols 2026."
        file_obj = SimpleUploadedFile("guidelines.txt", content, content_type="text/plain")

        res = self.client.post(
            "/api/documents/",
            {
                "file": file_obj,
                "name": "Ignite Guidelines",
                "space": "ignite",
                "description": "Onboarding handbook",
            },
            format="multipart",
        )
        self.assertEqual(res.status_code, 201)
        expected_hash = hashlib.sha256(content).hexdigest()
        self.assertEqual(res.data.get("fileHash"), expected_hash)

        doc = KnowledgeDocument.objects.get(id=res.data["id"])
        self.assertEqual(doc.file_hash, expected_hash)
        self.assertEqual(doc.space, "ignite")

    def test_duplicate_document_upload_rejected_with_409(self):
        content = b"Python Advanced AsyncIO and Multiprocessing Handbook."
        file_obj_1 = SimpleUploadedFile("async_guide.txt", content, content_type="text/plain")

        res1 = self.client.post(
            "/api/documents/",
            {
                "file": file_obj_1,
                "name": "Async Programming",
                "space": "general",
            },
            format="multipart",
        )
        self.assertEqual(res1.status_code, 201)

        # Upload exact same content under a different file name
        file_obj_2 = SimpleUploadedFile("duplicate_guide.txt", content, content_type="text/plain")
        res2 = self.client.post(
            "/api/documents/",
            {
                "file": file_obj_2,
                "name": "Another Copy of Async",
                "space": "general",
            },
            format="multipart",
        )
        self.assertEqual(res2.status_code, 409)
        self.assertIn("error", res2.data)
        self.assertIn("Duplicate document detected", res2.data["error"])
        self.assertIn("Async Programming", res2.data["error"])

        # Ensure only 1 document is in the database
        expected_hash = hashlib.sha256(content).hexdigest()
        self.assertEqual(KnowledgeDocument.objects.filter(file_hash=expected_hash).count(), 1)

    def test_upload_different_content_succeeds(self):
        content_1 = b"Document Content Number One."
        content_2 = b"Document Content Number Two with Different Text."

        file_1 = SimpleUploadedFile("doc1.txt", content_1, content_type="text/plain")
        file_2 = SimpleUploadedFile("doc2.txt", content_2, content_type="text/plain")

        res1 = self.client.post("/api/documents/", {"file": file_1, "name": "Doc One"}, format="multipart")
        self.assertEqual(res1.status_code, 201)

        res2 = self.client.post("/api/documents/", {"file": file_2, "name": "Doc Two"}, format="multipart")
        self.assertEqual(res2.status_code, 201)

        self.assertEqual(KnowledgeDocument.objects.count(), 2)

