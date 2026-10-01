"""Bounded local load smoke for stateless API, import, and PDF paths.

This is a controlled workload, not a capacity certification. It never calls AI
providers and refuses non-loopback URLs so credentials/data cannot be sent off-host.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import defaultdict
from io import BytesIO
import ipaddress
import json
import statistics
import time
from urllib.parse import urlparse

import httpx
from docx import Document


RESUME = {
    'id': 'stage6-load-fixture',
    'updatedAt': '2026-10-01T00:00:00Z',
    'personal': {'name': 'Stage Six Load Fixture'},
    'profile': {'type': 'doc', 'content': []},
}


def loopback_base_url(value: str) -> str:
    parsed = urlparse(value)
    try:
        loopback = parsed.hostname is not None and ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        loopback = False
    if parsed.scheme != 'http' or not loopback:
        raise argparse.ArgumentTypeError('base URL must use http:// and a loopback IP address')
    return value.rstrip('/')


def fixtures() -> tuple[bytes, bytes]:
    # A small standards-compliant PDF containing extractable text.
    stream = b'BT /F1 18 Tf 72 720 Td (Stage Six Load Fixture) Tj ET'
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
    ]
    pdf = bytearray(b'%PDF-1.4\n')
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf.extend(f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n')
    xref_offset = len(pdf)
    pdf.extend(f'xref\n0 {len(objects) + 1}\n'.encode())
    pdf.extend(b'0000000000 65535 f \n')
    for offset in offsets[1:]:
        pdf.extend(f'{offset:010d} 00000 n \n'.encode())
    pdf.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n'.encode())
    docx = BytesIO()
    document = Document()
    document.add_paragraph('Stage Six Load Fixture')
    document.save(docx)
    return bytes(pdf), docx.getvalue()


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', type=loopback_base_url, default='http://127.0.0.1:8000')
    parser.add_argument('--requests', type=int, default=30)
    parser.add_argument('--concurrency', type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.requests <= 500 or not 1 <= args.concurrency <= 20:
        parser.error('requests must be 1..500 and concurrency must be 1..20')

    pdf_bytes, docx_bytes = fixtures()
    samples: dict[str, list[float]] = defaultdict(list)
    statuses: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    semaphore = asyncio.Semaphore(args.concurrency)
    timeout = httpx.Timeout(30)

    async with httpx.AsyncClient(base_url=args.base_url, timeout=timeout, follow_redirects=False) as client:
        health = await client.get('/health')
        redis = await client.get('/health/redis')
        print(f"health={health.status_code} redis={redis.status_code}")

        async def sample(name: str, request) -> None:
            async with semaphore:
                started = time.perf_counter()
                response = await request()
                samples[name].append((time.perf_counter() - started) * 1000)
                statuses[name][response.status_code] += 1

        work = []
        for index in range(args.requests):
            work.extend([
                sample('pdf', lambda: client.post(f'/api/resumes/load-{index}/pdf', json=RESUME)),
                sample('import_pdf', lambda: client.post('/api/imports/pdf', files={'file': ('fixture.pdf', pdf_bytes, 'application/pdf')})),
                sample('import_docx', lambda: client.post('/api/imports/docx', files={'file': ('fixture.docx', docx_bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')})),
            ])
        load_started = time.perf_counter()
        await asyncio.gather(*work)
        elapsed = time.perf_counter() - load_started

    total_requests = sum(len(values) for values in samples.values())
    failures = sum(count for path in statuses.values() for status, count in path.items() if status < 200 or status >= 300)
    print(f"workload: requests_per_path={args.requests} concurrency={args.concurrency} total={total_requests} elapsed_seconds={elapsed:.2f} throughput_rps={total_requests / elapsed:.2f} error_rate={failures / total_requests:.3%}")
    for name, values in sorted(samples.items()):
        ordered = sorted(values)
        p95 = ordered[min(len(ordered) - 1, int(len(ordered) * .95))]
        p99 = ordered[min(len(ordered) - 1, int(len(ordered) * .99))]
        print(json.dumps({'path': name, 'responses': dict(statuses[name]), 'latency_ms': {'p50': round(statistics.median(values), 1), 'p95': round(p95, 1), 'p99': round(p99, 1), 'max': round(max(values), 1)}}))


if __name__ == '__main__':
    asyncio.run(main())
