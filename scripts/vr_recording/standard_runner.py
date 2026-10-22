"""Run stock LeRobot recording with desktop-owned dataset naming."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime

if __package__:
    from .naming import format_record_repo_id
else:
    from naming import format_record_repo_id


def main() -> None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--desktop_name_pattern", required=True)
    desktop_args, lerobot_args = parser.parse_known_args()

    from lerobot.configs.dataset import DatasetRecordConfig
    from lerobot.scripts import lerobot_record

    def stamp_repo_id(dataset: DatasetRecordConfig) -> None:
        if dataset.repo_id:
            dataset.repo_id = format_record_repo_id(
                dataset.repo_id,
                dataset.single_task,
                1,
                datetime.now().strftime("%Y%m%d_%H%M%S"),
                desktop_args.desktop_name_pattern,
            )

    # The stock recorder calls this hook before creating a new dataset. Keep
    # the customization in this process, leaving the LeRobot checkout clean.
    DatasetRecordConfig.stamp_repo_id = stamp_repo_id
    sys.argv = [sys.argv[0], *lerobot_args]
    lerobot_record.main()


if __name__ == "__main__":
    main()
