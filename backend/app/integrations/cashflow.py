from __future__ import annotations

import csv
import hashlib
import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings
from app.domain.generator import NOSNITCHES_HEADERS, validate_deal_rows


@dataclass
class CashflowResult:
    status: str
    events: list[dict]
    issues: list[dict]
    stdout: str
    stderr: str
    artifact_dir: Path
    binary_checksum: str | None


class CashflowEngineAdapter:
    def __init__(self, binary: str | None = None, timeout: int | None = None):
        settings = get_settings()
        self.binary = Path(binary or settings.cfgen_bin)
        self.timeout = timeout or settings.cfgen_timeout_seconds

    def available(self) -> bool:
        return self.binary.is_file() and os.access(self.binary, os.X_OK)

    def checksum(self) -> str | None:
        if not self.available():
            return None
        digest = hashlib.sha256()
        with self.binary.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def validate_deals(self, rows: list[dict]) -> list[dict]:
        return validate_deal_rows(rows)

    def healthcheck_by_smoke_test(self, deals_path: Path, rates_path: Path) -> dict:
        if not self.available():
            return {"available": False, "status": "Недоступно", "reason": f"Бинарник cfgen не найден: {self.binary}"}
        with tempfile.TemporaryDirectory(prefix="npv-cfgen-smoke-") as temp:
            out = Path(temp) / "out"
            command = [str(self.binary), "run", "--deals", str(deals_path), "--rates", str(rates_path), "--out-dir", str(out)]
            process = subprocess.run(command, capture_output=True, text=True, timeout=self.timeout, check=False)
            cashflow = out / "cashflow.csv"
            return {
                "available": process.returncode == 0 and cashflow.is_file(),
                "status": "Доступно" if process.returncode == 0 and cashflow.is_file() else "Ошибка",
                "return_code": process.returncode,
                "events": max(0, sum(1 for _ in cashflow.open(encoding="utf-8")) - 1) if cashflow.is_file() else 0,
                "stderr": process.stderr[-2000:],
                "binary_checksum": self.checksum(),
            }

    def calculate(self, rows: list[dict], rates_path: Path, run_id: str, *, extra_args: list[str] | None = None) -> CashflowResult:
        issues = self.validate_deals(rows)
        if any(issue["severity"] == "error" for issue in issues):
            return CashflowResult("failed", [], issues, "", "Серверная валидация не пройдена", Path(""), self.checksum())
        if not self.available():
            return CashflowResult(
                "failed", [],
                [{"deal_id": None, "severity": "error", "code": "CFGEN_UNAVAILABLE", "field": None, "message": f"Бинарник cfgen не найден: {self.binary}"}],
                "", "", Path(""), None,
            )
        settings = get_settings()
        root = settings.artifacts_dir.resolve() / run_id
        root.mkdir(parents=True, exist_ok=False)
        deals_path = root / "deals.csv"
        out_dir = root / "output"
        summary_path = root / "summary.json"
        with deals_path.open("w", newline="", encoding="utf-8") as target:
            writer = csv.DictWriter(target, fieldnames=NOSNITCHES_HEADERS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        command = [
            str(self.binary), "run", "--deals", str(deals_path), "--rates", str(rates_path),
            "--out-dir", str(out_dir), "--summary", str(summary_path),
        ]
        if extra_args:
            command.extend(extra_args)
        try:
            process = subprocess.run(command, capture_output=True, text=True, timeout=self.timeout, check=False)
        except subprocess.TimeoutExpired as exc:
            return CashflowResult("failed", [], [{"deal_id": None, "severity": "error", "code": "CFGEN_TIMEOUT", "field": None, "message": f"Таймаут {self.timeout} секунд"}], exc.stdout or "", exc.stderr or "", root, self.checksum())
        events = self._read_csv(out_dir / "cashflow.csv")
        engine_issues = self._read_csv(out_dir / "errors.csv")
        issues.extend(engine_issues)
        error_deals = {item.get("deal_id") for item in engine_issues if item.get("severity") == "error"}
        calculated_deals = {item.get("deal_id") for item in events}
        expected_deals = {item.get("deal_id") for item in rows}
        if process.returncode != 0 or not events:
            status = "failed"
        elif calculated_deals != expected_deals or error_deals:
            status = "partial"
        else:
            status = "succeeded"
        (root / "command.json").write_text(json.dumps({"argv": command[1:], "return_code": process.returncode}, ensure_ascii=False, indent=2), encoding="utf-8")
        return CashflowResult(status, events, issues, process.stdout, process.stderr, root, self.checksum())

    @staticmethod
    def _read_csv(path: Path) -> list[dict]:
        if not path.is_file() or path.stat().st_size > 512 * 1024 * 1024:
            return []
        with path.open(newline="", encoding="utf-8") as source:
            return list(csv.DictReader(source))
