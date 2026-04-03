from pathlib import Path

from fastapi import UploadFile


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


async def save_upload_file(upload_file: UploadFile, destination: Path, max_bytes: int) -> int:
    ensure_directory(destination.parent)
    written = 0
    chunk_size = 1024 * 1024

    with destination.open("wb") as target:
        while True:
            chunk = await upload_file.read(chunk_size)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                target.close()
                destination.unlink(missing_ok=True)
                raise ValueError("O arquivo enviado excede o limite maximo permitido.")
            target.write(chunk)

    await upload_file.close()
    return written
