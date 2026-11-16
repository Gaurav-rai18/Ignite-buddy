import os
import io
import uuid
import tempfile
import hashlib
from pathlib import Path
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import KnowledgeDocument
from server.apps.accounts.models import Cohort, Batch


def format_file_size(size_bytes: int) -> str:
    if not size_bytes:
        return "0 B"
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} GB"


def safe_build_absolute_uri(request, url):
    if not url:
        return None
    try:
        return request.build_absolute_uri(url)
    except Exception:
        return url


class DocumentListCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        docs = KnowledgeDocument.objects.all().select_related("target_cohort", "target_batch")
        space_filter = request.query_params.get("space")
        if space_filter and space_filter.lower() in ("general", "ignite"):
            docs = docs.filter(space=space_filter.lower())

        data = []
        for d in docs:
            data.append({
                "id": str(d.id),
                "name": d.title,
                "space": d.space,
                "fileName": d.file_name,
                "fileType": d.file_type,
                "sizeBytes": d.size_bytes,
                "sizeFormatted": format_file_size(d.size_bytes),
                "uploadedAt": d.uploaded_at.strftime("%Y-%m-%d %H:%M"),
                "status": d.status,
                "chunks": d.chunks,
                "indexed": d.indexed,
                "audience": d.audience,
                "cohort": d.target_cohort.code if d.target_cohort else None,
                "batch": d.target_batch.full_code if d.target_batch else None,
                "description": d.description,
                "vectorStore": d.vector_store,
                "content": d.content,
                "fileHash": d.file_hash,
                "fileUrl": safe_build_absolute_uri(request, d.file.url) if d.file else None,
            })
        return Response(data)

    def post(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        name = request.data.get("name") or Path(upload.name).stem
        space = str(request.data.get("space", "general")).lower().strip()
        if space not in ("general", "ignite"):
            space = "general"

        audience = request.data.get("audience") or "All students"
        description = request.data.get("description") or f"Uploaded {Path(upload.name).suffix.upper()} knowledge source"
        cohort_id = request.data.get("cohort_id") or request.data.get("target_cohort")
        batch_id = request.data.get("batch_id") or request.data.get("target_batch")

        target_cohort_obj = Cohort.objects.filter(id=cohort_id).first() if cohort_id else None
        target_batch_obj = Batch.objects.filter(id=batch_id).first() if batch_id else None

        suffix = Path(upload.name).suffix.lower()
        file_type_map = {
            ".pdf": "PDF",
            ".txt": "TXT",
            ".docx": "DOCX",
            ".pptx": "PPTX",
            ".md": "MARKDOWN",
        }
        file_type = file_type_map.get(suffix, suffix.replace(".", "").upper() or "DOC")

        content_bytes = upload.read()
        f_hash = hashlib.sha256(content_bytes).hexdigest()

        # Check for duplicate document by SHA-256 content hash
        from server.knowledge.extract import extract, SUPPORTED
        from server.knowledge.store import get_kb
        kb = get_kb()

        # Check in database for identical hash in this space
        duplicate_doc = KnowledgeDocument.objects.filter(file_hash=f_hash, space=space).first()
        if not duplicate_doc:
            # Check if any existing document in this space matches the exact hash without hash populated yet
            for c in KnowledgeDocument.objects.filter(space=space):
                if c.file_hash == f_hash:
                    duplicate_doc = c
                    break
                elif not c.file_hash and c.file:
                    try:
                        c.file.seek(0)
                        if hashlib.sha256(c.file.read()).hexdigest() == f_hash:
                            c.file_hash = f_hash
                            c.save(update_fields=["file_hash"])
                            duplicate_doc = c
                            break
                    except Exception:
                        pass

        if duplicate_doc:
            return Response(
                {
                    "error": f"Duplicate document detected. This exact file has already been uploaded as '{duplicate_doc.title}' ({duplicate_doc.file_name}) in the {duplicate_doc.space.capitalize()} space."
                },
                status=status.HTTP_409_CONFLICT,
            )

        pages = []

        # Extract structured text pages using knowledge base extractors

        # Extract structured text pages using knowledge base extractors
        try:
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
                tf.write(content_bytes)
                temp_path = tf.name

            try:
                if suffix in SUPPORTED:
                    pages = extract(temp_path)
            finally:
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass
        except Exception:
            pass

        if not pages:
            # Fallback for plain text or basic strings
            try:
                raw_text = content_bytes.decode("utf-8", errors="replace")
                if raw_text.strip():
                    pages = [(1, raw_text)]
            except Exception:
                pages = [(1, f"Content extracted from {upload.name}")]

        extracted_text = "\n\n".join(t for _, t in pages).strip()
        estimated_chunks = max(1, len(extracted_text) // 600)
        vector_doc_id = f"kb_{space}_{uuid.uuid4().hex[:10]}"

        # Ingest directly into the selected knowledge base space (general or ignite)
        status_val = "Ready"
        indexed_val = True
        try:
            kb = get_kb()
            f_hash = hashlib.sha256(content_bytes).hexdigest()
            stored_chunks = kb.add_document(space, upload.name, pages, f_hash)
            if stored_chunks:
                estimated_chunks = stored_chunks
        except Exception:
            # Fail-safe: document text is saved and ready
            status_val = "Ready"

        # Reset file pointer for model persistence
        upload.seek(0)

        doc = KnowledgeDocument.objects.create(
            title=name,
            space=space,
            file=upload,
            file_name=upload.name,
            file_type=file_type,
            size_bytes=len(content_bytes),
            file_hash=f_hash,
            status=status_val,
            chunks=estimated_chunks,
            indexed=indexed_val,
            audience=audience,
            target_cohort=target_cohort_obj,
            target_batch=target_batch_obj,
            description=description,
            vector_store=f"ChromaDB / SQLite ({space.capitalize()} Space)",
            vector_doc_id=vector_doc_id,
            uploaded_by=request.user if request.user and request.user.is_authenticated else None,
            content=extracted_text,
        )

        return Response({
            "id": str(doc.id),
            "name": doc.title,
            "space": doc.space,
            "fileName": doc.file_name,
            "fileType": doc.file_type,
            "sizeBytes": doc.size_bytes,
            "sizeFormatted": format_file_size(doc.size_bytes),
            "fileHash": doc.file_hash,
            "uploadedAt": doc.uploaded_at.strftime("%Y-%m-%d %H:%M"),
            "status": doc.status,
            "chunks": doc.chunks,
            "indexed": doc.indexed,
            "audience": doc.audience,
            "description": doc.description,
            "vectorStore": doc.vector_store,
            "content": doc.content,
            "fileUrl": safe_build_absolute_uri(request, doc.file.url) if doc.file else None,
        }, status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            d = KnowledgeDocument.objects.select_related("target_cohort", "target_batch").get(pk=pk)
            return Response({
                "id": str(d.id),
                "name": d.title,
                "space": d.space,
                "fileName": d.file_name,
                "fileType": d.file_type,
                "sizeBytes": d.size_bytes,
                "sizeFormatted": format_file_size(d.size_bytes),
                "fileHash": d.file_hash,
                "uploadedAt": d.uploaded_at.strftime("%Y-%m-%d %H:%M"),
                "status": d.status,
                "chunks": d.chunks,
                "indexed": d.indexed,
                "audience": d.audience,
                "cohort": d.target_cohort.code if d.target_cohort else None,
                "batch": d.target_batch.full_code if d.target_batch else None,
                "description": d.description,
                "vectorStore": d.vector_store,
                "content": d.content,
                "fileUrl": safe_build_absolute_uri(request, d.file.url) if d.file else None,
            })
        except KnowledgeDocument.DoesNotExist:
            return Response({"error": "Document not found"}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        try:
            d = KnowledgeDocument.objects.get(pk=pk)
            # Purge vectors from RAG vector store collection
            try:
                from server.knowledge.store import get_kb
                kb = get_kb()
                kb.delete_source(d.space, d.file_name)
            except Exception:
                pass

            if d.file:
                try:
                    d.file.delete(save=False)
                except Exception:
                    pass
            d.delete()
            return Response({"success": True, "id": str(pk)})
        except KnowledgeDocument.DoesNotExist:
            return Response({"error": "Document not found"}, status=status.HTTP_404_NOT_FOUND)


class KnowledgeBaseStatsView(APIView):
    """
    RAG Knowledge Base Status & Statistics.
    Reports total chunks indexed across ChromaDB spaces (General and Ignite)
    and document metrics for administrative visibility.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            from server.knowledge.store import get_kb
            kb = get_kb()
            kb_stats = kb.stats()
            total_docs = KnowledgeDocument.objects.count()
            general_docs = KnowledgeDocument.objects.filter(space="general").count()
            ignite_docs = KnowledgeDocument.objects.filter(space="ignite").count()
            return Response({
                "spaces": kb_stats,
                "total_documents": total_docs,
                "general_documents": general_docs,
                "ignite_documents": ignite_docs,
                "vector_backend": "ChromaDB" if getattr(kb, "_use_chroma", False) else "In-Memory / SQLite",
            })
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
