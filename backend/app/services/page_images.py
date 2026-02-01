"""Page image extraction and highlighting service."""
import os
import re
import hashlib
from pathlib import Path
from typing import List, Optional, Tuple
import fitz  # PyMuPDF


# Directory for storing page images
# Use /app/page_images in Docker, or project root locally
_app_dir = Path("/app")
if _app_dir.exists() and (_app_dir / "app").exists():
    PAGE_IMAGES_DIR = _app_dir / "page_images"
else:
    PAGE_IMAGES_DIR = Path(__file__).parent.parent.parent.parent / "page_images"
THUMBNAILS_DIR = PAGE_IMAGES_DIR / "thumbnails"
FULLSIZE_DIR = PAGE_IMAGES_DIR / "fullsize"
HIGHLIGHTED_DIR = PAGE_IMAGES_DIR / "highlighted"

# Create directories
for dir_path in [PAGE_IMAGES_DIR, THUMBNAILS_DIR, FULLSIZE_DIR, HIGHLIGHTED_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)


def sanitize_filename(filename: str) -> str:
    """Create a safe filename from document name."""
    # Remove extension and sanitize
    name = Path(filename).stem
    # Replace spaces and special chars with underscores
    safe_name = re.sub(r'[^\w\-]', '_', name)
    return safe_name[:100]  # Limit length


def get_page_image_paths(document_name: str, page_number: int) -> dict:
    """Get paths for thumbnail and fullsize images."""
    safe_name = sanitize_filename(document_name)
    return {
        'thumbnail': THUMBNAILS_DIR / f"{safe_name}_page_{page_number}.png",
        'fullsize': FULLSIZE_DIR / f"{safe_name}_page_{page_number}.png",
    }


def extract_page_images(pdf_path: str, document_name: str) -> List[dict]:
    """Extract all pages from a PDF as images.

    Returns list of dicts with page_number, thumbnail_path, fullsize_path.
    """
    doc = fitz.open(pdf_path)
    results = []

    safe_name = sanitize_filename(document_name)

    for page_num in range(len(doc)):
        page = doc[page_num]
        actual_page = page_num + 1

        # Thumbnail (300px width)
        thumb_matrix = fitz.Matrix(0.4, 0.4)  # ~300px for standard PDF
        thumb_pix = page.get_pixmap(matrix=thumb_matrix)
        thumb_path = THUMBNAILS_DIR / f"{safe_name}_page_{actual_page}.png"

        # Save as PNG
        thumb_pix.save(str(thumb_path))

        # Fullsize (1200px width for good readability)
        full_matrix = fitz.Matrix(1.5, 1.5)  # ~1200px
        full_pix = page.get_pixmap(matrix=full_matrix)
        full_path = FULLSIZE_DIR / f"{safe_name}_page_{actual_page}.png"
        full_pix.save(str(full_path))

        results.append({
            'page_number': actual_page,
            'thumbnail_path': str(thumb_path),
            'fullsize_path': str(full_path),
        })

    doc.close()
    return results


def get_highlighted_page(
    pdf_path: str,
    document_name: str,
    page_number: int,
    search_terms: List[str],
    highlight_color: Tuple[float, float, float] = (1, 1, 0)  # Yellow
) -> str:
    """Generate a page image with search terms highlighted.

    Returns path to the highlighted image.
    """
    # Create a hash of the search terms for caching
    terms_hash = hashlib.md5('_'.join(sorted(search_terms)).encode()).hexdigest()[:8]
    safe_name = sanitize_filename(document_name)

    highlighted_path = HIGHLIGHTED_DIR / f"{safe_name}_page_{page_number}_{terms_hash}.png"

    # Return cached if exists
    if highlighted_path.exists():
        return str(highlighted_path)

    # Open the PDF and get the page
    doc = fitz.open(pdf_path)

    if page_number < 1 or page_number > len(doc):
        doc.close()
        raise ValueError(f"Page {page_number} not found in document")

    page = doc[page_number - 1]

    # Search and highlight each term
    for term in search_terms:
        # Search for text (case-insensitive)
        text_instances = page.search_for(term, quads=True)

        for inst in text_instances:
            # Add highlight annotation
            highlight = page.add_highlight_annot(inst)
            highlight.set_colors(stroke=highlight_color)
            highlight.update()

    # Render the page with highlights
    matrix = fitz.Matrix(1.5, 1.5)
    pix = page.get_pixmap(matrix=matrix)
    pix.save(str(highlighted_path))

    doc.close()
    return str(highlighted_path)


def extract_key_terms(text: str) -> List[str]:
    """Extract key terms from text for highlighting.

    Focuses on specific values, numbers, and important words.
    """
    terms = []

    # Extract numbers with units (e.g., "6.6 qt", "33 psi")
    number_patterns = re.findall(r'\d+\.?\d*\s*(?:qt|quart|psi|mile|km|liter|gallon|inch|mm|°)', text, re.IGNORECASE)
    terms.extend(number_patterns)

    # Extract capitalized phrases (likely important terms)
    cap_words = re.findall(r'\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\b', text)
    terms.extend([w for w in cap_words if len(w) > 3])

    # Extract quoted text
    quoted = re.findall(r'"([^"]+)"', text)
    terms.extend(quoted)

    # Remove duplicates and limit
    seen = set()
    unique_terms = []
    for term in terms:
        if term.lower() not in seen and len(term) > 2:
            seen.add(term.lower())
            unique_terms.append(term)

    return unique_terms[:10]  # Limit to 10 terms


def get_pdf_path_for_document(document_name: str) -> Optional[str]:
    """Find the PDF path for a given document name."""
    # Check both docs and uploads directories
    base_dir = Path(__file__).parent.parent.parent.parent
    search_dirs = [base_dir / "docs", base_dir / "uploads"]

    for search_dir in search_dirs:
        if not search_dir.exists():
            continue

        # Try exact match first
        pdf_path = search_dir / document_name
        if pdf_path.exists():
            return str(pdf_path)

        # Try with .pdf extension
        if not document_name.endswith('.pdf'):
            pdf_path = search_dir / f"{document_name}.pdf"
            if pdf_path.exists():
                return str(pdf_path)

        # Search for partial match
        for file in search_dir.glob("*.pdf"):
            if sanitize_filename(document_name) in sanitize_filename(file.name):
                return str(file)

    return None


def cleanup_highlighted_cache(max_age_hours: int = 24):
    """Remove old highlighted images from cache."""
    import time

    current_time = time.time()
    max_age_seconds = max_age_hours * 3600

    for file_path in HIGHLIGHTED_DIR.glob("*.png"):
        if current_time - file_path.stat().st_mtime > max_age_seconds:
            file_path.unlink()
