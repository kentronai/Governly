"""
PDF Text Extraction Service

Extracts text from various document formats (PDF, DOCX, TXT, etc.)
for policy analysis.
"""

from typing import Optional, BinaryIO
import io

try:
    import PyPDF2
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

try:
    from docx import Document
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False


class PDFExtractionError(Exception):
    """Error during PDF text extraction"""
    pass


class TextExtractor:
    """Extract text from various document formats"""
    
    @staticmethod
    def extract_from_pdf(file_data: bytes) -> str:
        """
        Extract text from PDF file
        
        Args:
            file_data: PDF file bytes
            
        Returns:
            Extracted text
        """
        if not PDF_AVAILABLE:
            raise PDFExtractionError("PyPDF2 not installed. Install with: pip install PyPDF2")
        
        try:
            pdf_file = io.BytesIO(file_data)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            text_parts = []
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    text = page.extract_text()
                    if text:
                        text_parts.append(text)
                except Exception as e:
                    print(f"Warning: Failed to extract page {page_num}: {e}")
                    continue
            
            return "\n\n".join(text_parts)
        
        except Exception as e:
            raise PDFExtractionError(f"Failed to extract text from PDF: {e}")
    
    @staticmethod
    def extract_from_docx(file_data: bytes) -> str:
        """
        Extract text from DOCX file
        
        Args:
            file_data: DOCX file bytes
            
        Returns:
            Extracted text
        """
        if not DOCX_AVAILABLE:
            raise PDFExtractionError("python-docx not installed. Install with: pip install python-docx")
        
        try:
            docx_file = io.BytesIO(file_data)
            doc = Document(docx_file)
            
            text_parts = []
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)
            
            return "\n\n".join(text_parts)
        
        except Exception as e:
            raise PDFExtractionError(f"Failed to extract text from DOCX: {e}")
    
    @staticmethod
    def extract_from_text(file_data: bytes, encoding: str = "utf-8") -> str:
        """
        Extract text from plain text file
        
        Args:
            file_data: Text file bytes
            encoding: Text encoding
            
        Returns:
            Extracted text
        """
        try:
            return file_data.decode(encoding)
        except UnicodeDecodeError:
            # Try alternative encodings
            for alt_encoding in ["latin-1", "cp1252", "iso-8859-1"]:
                try:
                    return file_data.decode(alt_encoding)
                except UnicodeDecodeError:
                    continue
            
            raise PDFExtractionError("Failed to decode text file with any known encoding")
    
    @classmethod
    def extract_text(cls, file_data: bytes, filename: str) -> str:
        """
        Extract text from file based on extension
        
        Args:
            file_data: File bytes
            filename: Original filename with extension
            
        Returns:
            Extracted text
        """
        # Get file extension
        ext = filename.lower().split('.')[-1]
        
        if ext == "pdf":
            return cls.extract_from_pdf(file_data)
        elif ext == "docx":
            return cls.extract_from_docx(file_data)
        elif ext in ["txt", "md", "yaml", "yml"]:
            return cls.extract_from_text(file_data)
        else:
            raise PDFExtractionError(f"Unsupported file format: {ext}")


# Global instance
def extract_text_from_file(file_data: bytes, filename: str) -> str:
    """
    Extract text from uploaded file
    
    Args:
        file_data: File bytes
        filename: Original filename
        
    Returns:
        Extracted text content
    """
    return TextExtractor.extract_text(file_data, filename)
