import json
from pathlib import Path

from app.db import Base, SessionLocal, engine
from app.schemas import CurveImportRequest
from app.services import import_curve


def main() -> None:
    path = Path(__file__).resolve().parents[1] / "fixtures" / "quantum_snapshot_2026-11-20.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    request = CurveImportRequest.model_validate({
        "source": payload["source"],
        "external_id": payload["external_id"],
        "trade_date": payload["trade_date"],
        "source_sha": payload["source_sha"],
        "convention": payload["convention"],
        "points": payload["points"],
    })
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        snapshot = import_curve(session, request)
        print(f"Loaded verified QuantumTeam snapshot {snapshot.id} ({snapshot.trade_date})")


if __name__ == "__main__":
    main()
