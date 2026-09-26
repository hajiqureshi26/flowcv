from __future__ import annotations

from io import BytesIO
from typing import Annotated
from zipfile import ZipFile, is_zipfile

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import ValidationError

from app.config.settings import get_settings
from app.schemas.resume import Resume
from app.services.import_service import import_service

router = APIRouter(prefix='/imports', tags=['imports'])


@router.post('/resume-json')
def import_resume_json(payload: dict[str, object]) -> Resume:
    try:
        return Resume.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail='Invalid resume JSON') from exc


async def _read_upload(file: UploadFile, expected_extension: str, accepted_types: set[str]) -> bytes:
    filename = file.filename or ''
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if extension != expected_extension:
        raise HTTPException(status_code=415, detail=f'Upload must be a .{expected_extension} file')

    content_type = (file.content_type or '').split(';', 1)[0].lower()
    if content_type not in accepted_types:
        raise HTTPException(status_code=415, detail='Unsupported upload content type')

    maximum_size = get_settings().import_max_file_size_bytes
    data = await file.read(maximum_size + 1)
    if len(data) > maximum_size:
        raise HTTPException(status_code=413, detail='Upload exceeds the configured size limit')

    if expected_extension == 'pdf' and b'%PDF-' not in data[:1024]:
        raise HTTPException(status_code=400, detail='Invalid PDF file')
    if expected_extension == 'docx':
        archive_buffer = BytesIO(data)
        if not is_zipfile(archive_buffer):
            raise HTTPException(status_code=400, detail='Invalid DOCX file')
        with ZipFile(archive_buffer) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(entry.file_size for entry in entries) > get_settings().import_max_archive_expanded_bytes:
                raise HTTPException(status_code=413, detail='Expanded DOCX content exceeds the configured size limit')
            required_parts = {'[Content_Types].xml', 'word/document.xml'}
            if not required_parts.issubset(archive.namelist()):
                raise HTTPException(status_code=400, detail='Invalid DOCX file')
    return data


@router.post('/pdf')
async def import_resume_pdf(file: Annotated[UploadFile, File(...)]) -> Resume:
    try:
        data = await _read_upload(file, 'pdf', {'application/pdf', 'application/x-pdf', 'application/octet-stream'})
        return import_service.import_from_pdf(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post('/docx')
async def import_resume_docx(file: Annotated[UploadFile, File(...)]) -> Resume:
    try:
        data = await _read_upload(
            file,
            'docx',
            {
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/octet-stream',
            },
        )
        return import_service.import_from_docx(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
