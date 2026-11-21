from redis import Redis
from rq import Worker

from app.core.config import get_settings


if __name__ == "__main__":
    connection = Redis.from_url(get_settings().redis_url)
    Worker(["npv"], connection=connection).work(with_scheduler=False)
