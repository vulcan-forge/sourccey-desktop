from pathlib import Path
import sys
import time

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from setup.kiosk.components.setup_build import BuildManager


def _noop(*_args, **_kwargs):
    return None


def test_find_latest_deb_prefers_newest_artifact(tmp_path):
    manager = BuildManager(
        project_root=tmp_path,
        app_info={},
        print_status=_noop,
        print_success=_noop,
        print_warning=_noop,
        print_error=_noop,
    )

    old_dir = tmp_path / "old-cache" / "release" / "bundle" / "deb"
    new_dir = tmp_path / "fresh-build" / "release" / "bundle" / "deb"
    old_dir.mkdir(parents=True, exist_ok=True)
    new_dir.mkdir(parents=True, exist_ok=True)

    old_deb = old_dir / "VulcanStudio_0.0.6_arm64.deb"
    new_deb = new_dir / "VulcanStudio_0.0.6_arm64.deb"
    old_deb.write_text("old")
    new_deb.write_text("new")

    now = time.time()
    # Ensure deterministic ordering by forcing old/new mtimes.
    old_mtime = now - 120
    new_mtime = now - 5
    old_deb.touch()
    new_deb.touch()
    old_deb = old_deb.resolve()
    new_deb = new_deb.resolve()
    import os

    os.utime(old_deb, (old_mtime, old_mtime))
    os.utime(new_deb, (new_mtime, new_mtime))

    selected = manager.find_latest_deb(
        deb_locations=[old_dir, new_dir],
        product_patterns=["VulcanStudio*.deb"],
    )

    assert selected == new_deb


def test_recommend_cargo_jobs_for_4gb_pi(tmp_path):
    manager = BuildManager(
        project_root=tmp_path,
        app_info={},
        print_status=_noop,
        print_success=_noop,
        print_warning=_noop,
        print_error=_noop,
    )

    assert manager.recommend_cargo_jobs(total_mem_gib=4.0) == 2
    assert manager.recommend_cargo_jobs(total_mem_gib=2.0) == 1
