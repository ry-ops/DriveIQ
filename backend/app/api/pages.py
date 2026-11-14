"""API endpoints for page images."""
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path
from typing import List, Optional

from app.services.page_images import (
    get_page_image_paths,
    get_highlighted_page,
    get_pdf_path_for_document,
    THUMBNAILS_DIR,
    FULLSIZE_DIR,
    sanitize_filename,
)

router = APIRouter()


@router.get("/{document_name}/{page_number}/thumbnail")
async def get_page_thumbnail(document_name: str, page_number: int):
    """Get thumbnail image for a document page."""
    paths = get_page_image_paths(document_name, page_number)

    if not paths['thumbnail'].exists():
        raise HTTPException(
            status_code=404,
            detail=f"Thumbnail not found for {document_name} page {page_number}"
        )

    return FileResponse(
        paths['thumbnail'],
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"}  # Cache for 24 hours
    )


@router.get("/{document_name}/{page_number}/full")
async def get_page_fullsize(document_name: str, page_number: int):
    """Get full-size image for a document page."""
    paths = get_page_image_paths(document_name, page_number)

    if not paths['fullsize'].exists():
        raise HTTPException(
            status_code=404,
            detail=f"Full-size image not found for {document_name} page {page_number}"
        )

    return FileResponse(
        paths['fullsize'],
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"}
    )


@router.get("/{document_name}/{page_number}/highlighted")
async def get_page_highlighted(
    document_name: str,
    page_number: int,
    terms: List[str] = Query(default=[], description="Search terms to highlight")
):
    """Get page image with search terms highlighted."""
    if not terms:
        # No terms to highlight, return regular fullsize
        return await get_page_fullsize(document_name, page_number)

    # Find the PDF
    pdf_path = get_pdf_path_for_document(document_name)
    if not pdf_path:
        raise HTTPException(
            status_code=404,
            detail=f"PDF not found for {document_name}"
        )

    try:
        highlighted_path = get_highlighted_page(
            pdf_path,
            document_name,
            page_number,
            terms
        )

        return FileResponse(
            highlighted_path,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=3600"}  # Cache for 1 hour
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating highlighted image: {str(e)}")


@router.get("/{document_name}/pages")
async def list_document_pages(document_name: str):
    """List all available page images for a document."""
    safe_name = sanitize_filename(document_name)

    # Find all thumbnails for this document
    thumbnails = list(THUMBNAILS_DIR.glob(f"{safe_name}_page_*.png"))

    if not thumbnails:
        raise HTTPException(
            status_code=404,
            detail=f"No page images found for {document_name}"
        )

    # Extract page numbers and sort
    pages = []
    for thumb_path in thumbnails:
        # Extract page number from filename
        parts = thumb_path.stem.split('_page_')
        if len(parts) == 2:
            try:
                page_num = int(parts[1])
                pages.append({
                    'page_number': page_num,
                    'thumbnail_url': f"/api/pages/{document_name}/{page_num}/thumbnail",
                    'fullsize_url': f"/api/pages/{document_name}/{page_num}/full",
                })
            except ValueError:
                continue

    pages.sort(key=lambda x: x['page_number'])

    return {
        'document_name': document_name,
        'total_pages': len(pages),
        'pages': pages
    }
