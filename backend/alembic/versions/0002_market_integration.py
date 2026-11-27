"""Версии истории и прогноза ставок, входы расчёта."""

from alembic import op
import sqlalchemy as sa

from app.models import IndicatorDataset

revision = "0002_market_integration"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    # Первая миграция строит схему из текущих моделей при чистой установке.
    IndicatorDataset.__table__.create(connection, checkfirst=True)
    columns = sa.inspect(connection).get_columns("calculation_runs")
    if all(column["name"] != "inputs" for column in columns):
        op.add_column("calculation_runs", sa.Column("inputs", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_table("indicator_datasets")
    with op.batch_alter_table("calculation_runs") as batch:
        batch.drop_column("inputs")
