from resource import struct_rusage

from redis import Redis
from rq import Worker
from rq.job import Job

from app.calculations import fail_background_run
from app.core.config import get_settings


def mark_interrupted_run(job: Job, process_id: int, exit_code: int, usage: struct_rusage) -> None:
    fail_background_run(job, job.connection)


if __name__ == "__main__":
    connection = Redis.from_url(get_settings().redis_url)
    Worker(["npv"], connection=connection, work_horse_killed_handler=mark_interrupted_run).work(with_scheduler=False)
