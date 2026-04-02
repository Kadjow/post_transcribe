from fastapi import APIRouter

from app.api.v1.endpoints.pdfs import router as pdfs_router

router = APIRouter()
router.include_router(pdfs_router, prefix="/pdfs", tags=["pdfs"])
