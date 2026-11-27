FROM rust:1.85-bookworm AS cfgen-builder
ARG NOSNITCHES_SHA=77ca4571e2b355b75919efa6259b9e559c9d1121
RUN git clone https://github.com/delusssion/nosnitches-cashflow.git /src/nosnitches \
    && git -C /src/nosnitches checkout "$NOSNITCHES_SHA"
WORKDIR /src/nosnitches/engine
RUN cargo build --locked --release -p cfgen

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend /app
RUN pip install --no-cache-dir .
COPY --from=cfgen-builder /src/nosnitches/engine/target/release/cfgen /opt/cfgen/cfgen
RUN useradd --create-home --uid 10001 npv && mkdir -p /app/artifacts && chown -R npv:npv /app /opt/cfgen
USER npv
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
