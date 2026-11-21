from fastapi import Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    def __init__(self, code: str, message: str, *, status_code: int = 400, details: dict | None = None, retryable: bool = False):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details
        self.retryable = retryable
        super().__init__(message)


async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": exc.code,
            "message": exc.message,
            "details": exc.details,
            "field": None,
            "source": None,
            "run_id": None,
            "retryable": exc.retryable,
        },
    )
