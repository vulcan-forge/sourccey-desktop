use super::*;

#[test]
fn parses_vulcan_semver_tags() {
    assert_eq!(
        LocalSetupService::parse_vulcan_semver("vulcan/0.1.0"),
        Some(SimpleSemver {
            major: 0,
            minor: 1,
            patch: 0
        })
    );
    assert_eq!(
        LocalSetupService::parse_vulcan_semver("vulcan/v1.2.3"),
        Some(SimpleSemver {
            major: 1,
            minor: 2,
            patch: 3
        })
    );
    assert_eq!(
        LocalSetupService::parse_vulcan_semver("vulcan/not-semver"),
        None
    );
    assert_eq!(LocalSetupService::parse_vulcan_semver("0.1.0"), None);
    assert_eq!(LocalSetupService::parse_vulcan_semver("v0.1.0"), None);
}

#[test]
fn selects_highest_vulcan_semver_and_ignores_other_tags() {
    let selected = LocalSetupService::select_latest_vulcan_tag(vec![
        LatestLerobotTagInfo {
            name: "release/5.0.0".to_string(),
            commit_sha: None,
        },
        LatestLerobotTagInfo {
            name: "1.9.9".to_string(),
            commit_sha: None,
        },
        LatestLerobotTagInfo {
            name: "vulcan/0.1.0".to_string(),
            commit_sha: Some("1111111".to_string()),
        },
        LatestLerobotTagInfo {
            name: "vulcan/0.3.0".to_string(),
            commit_sha: Some("3333333".to_string()),
        },
        LatestLerobotTagInfo {
            name: "vulcan/0.2.5".to_string(),
            commit_sha: Some("2222222".to_string()),
        },
    ]);

    assert_eq!(
        selected,
        Some(LatestLerobotTagInfo {
            name: "vulcan/0.3.0".to_string(),
            commit_sha: Some("3333333".to_string()),
        })
    );
}

#[test]
fn ignores_non_semver_vulcan_tags_when_selecting_latest() {
    let selected = LocalSetupService::select_latest_vulcan_tag(vec![
        LatestLerobotTagInfo {
            name: "vulcan/latest".to_string(),
            commit_sha: None,
        },
        LatestLerobotTagInfo {
            name: "vulcan/release".to_string(),
            commit_sha: None,
        },
        LatestLerobotTagInfo {
            name: "other/1.0.0".to_string(),
            commit_sha: None,
        },
    ]);
    assert_eq!(selected, None);
}

#[test]
fn compares_release_tags_with_semver() {
    assert_eq!(
        LocalSetupService::compare_vulcan_release_tags("vulcan/0.1.0", "vulcan/0.1.0"),
        Some(Ordering::Equal)
    );
    assert_eq!(
        LocalSetupService::compare_vulcan_release_tags("vulcan/0.2.0", "vulcan/0.1.0"),
        Some(Ordering::Greater)
    );
    assert_eq!(
        LocalSetupService::compare_vulcan_release_tags("vulcan/0.1.0", "vulcan/0.2.0"),
        Some(Ordering::Less)
    );
    assert_eq!(
        LocalSetupService::compare_vulcan_release_tags("vulcan/custom", "vulcan/0.2.0"),
        None
    );
}

#[test]
fn resolves_up_to_date_when_current_tag_matches_latest_release() {
    let current_release = CurrentLerobotReleaseInfo {
        source: CurrentLerobotReleaseSource::Marker,
        tag: Some("vulcan/0.3.0".to_string()),
        commit: Some("abc1234".to_string()),
    };
    let latest_release = LatestLerobotTagInfo {
        name: "vulcan/0.3.0".to_string(),
        commit_sha: Some("abc1234".to_string()),
    };
    let manifest_release = ManifestLerobotReleaseInfo {
        tag: Some("vulcan/0.3.0".to_string()),
        commit: Some("abc1234".to_string()),
    };

    let (state, message) = LocalSetupService::resolve_lerobot_release_state(
        &current_release,
        Some(&latest_release),
        Some(&manifest_release),
    );

    assert_eq!(state, LerobotReleaseState::UpToDate);
    assert_eq!(
        message,
        Some("Your LeRobot runtime is on the latest released tag.".to_string())
    );
}

#[test]
fn resolves_update_available_when_current_tag_is_behind() {
    let current_release = CurrentLerobotReleaseInfo {
        source: CurrentLerobotReleaseSource::Marker,
        tag: Some("vulcan/0.2.0".to_string()),
        commit: Some("abc1234".to_string()),
    };
    let latest_release = LatestLerobotTagInfo {
        name: "vulcan/0.3.0".to_string(),
        commit_sha: Some("def5678".to_string()),
    };
    let manifest_release = ManifestLerobotReleaseInfo {
        tag: Some("vulcan/0.3.0".to_string()),
        commit: Some("def5678".to_string()),
    };

    let (state, message) = LocalSetupService::resolve_lerobot_release_state(
        &current_release,
        Some(&latest_release),
        Some(&manifest_release),
    );

    assert_eq!(state, LerobotReleaseState::UpdateAvailable);
    assert_eq!(
        message,
        Some("A newer LeRobot release tag is available: vulcan/0.3.0.".to_string())
    );
}

#[test]
fn resolves_custom_build_for_untagged_git_checkout() {
    let current_release = CurrentLerobotReleaseInfo {
        source: CurrentLerobotReleaseSource::GitUntagged,
        tag: None,
        commit: Some("abc1234".to_string()),
    };
    let latest_release = LatestLerobotTagInfo {
        name: "vulcan/0.3.0".to_string(),
        commit_sha: Some("def5678".to_string()),
    };
    let manifest_release = ManifestLerobotReleaseInfo {
        tag: Some("vulcan/0.3.0".to_string()),
        commit: Some("def5678".to_string()),
    };

    let (state, message) = LocalSetupService::resolve_lerobot_release_state(
        &current_release,
        Some(&latest_release),
        Some(&manifest_release),
    );

    assert_eq!(state, LerobotReleaseState::CustomBuild);
    assert_eq!(
        message,
        Some("This runtime is on an untagged local checkout.".to_string())
    );
}

#[test]
fn resolves_unknown_when_manifest_is_missing_release_tag() {
    let current_release = CurrentLerobotReleaseInfo {
        source: CurrentLerobotReleaseSource::Marker,
        tag: Some("vulcan/0.2.0".to_string()),
        commit: Some("abc1234".to_string()),
    };
    let latest_release = LatestLerobotTagInfo {
        name: "vulcan/0.3.0".to_string(),
        commit_sha: Some("def5678".to_string()),
    };
    let manifest_release = ManifestLerobotReleaseInfo {
        tag: None,
        commit: Some("def5678".to_string()),
    };

    let (state, message) = LocalSetupService::resolve_lerobot_release_state(
        &current_release,
        Some(&latest_release),
        Some(&manifest_release),
    );

    assert_eq!(state, LerobotReleaseState::Unknown);
    assert_eq!(
        message,
        Some(
            "Release metadata is incomplete because latest.json is missing modules.lerobot-vulcan.tag."
                .to_string()
        )
    );
}

#[test]
fn reuses_cached_latest_tag_inside_ttl() {
    let mut cache: Option<LerobotTagCacheEntry> = None;
    let start = Instant::now();
    let mut fetch_calls = 0;

    let first = LocalSetupService::resolve_latest_tag_with_cache(&mut cache, start, || {
        fetch_calls += 1;
        Ok(Some(LatestLerobotTagInfo {
            name: "vulcan/0.2.0".to_string(),
            commit_sha: Some("abc1234".to_string()),
        }))
    })
    .expect("first cache resolution should succeed");
    assert_eq!(
        first,
        Some(LatestLerobotTagInfo {
            name: "vulcan/0.2.0".to_string(),
            commit_sha: Some("abc1234".to_string()),
        })
    );
    assert_eq!(fetch_calls, 1);

    let second = LocalSetupService::resolve_latest_tag_with_cache(
        &mut cache,
        start + Duration::from_secs(60),
        || {
            fetch_calls += 1;
            Ok(Some(LatestLerobotTagInfo {
                name: "vulcan/0.9.0".to_string(),
                commit_sha: Some("def5678".to_string()),
            }))
        },
    )
    .expect("second cache resolution should reuse cache");
    assert_eq!(
        second,
        Some(LatestLerobotTagInfo {
            name: "vulcan/0.2.0".to_string(),
            commit_sha: Some("abc1234".to_string()),
        })
    );
    assert_eq!(fetch_calls, 1);

    let third = LocalSetupService::resolve_latest_tag_with_cache(
        &mut cache,
        start + LocalSetupService::LEROBOT_TAG_CACHE_TTL + Duration::from_secs(1),
        || {
            fetch_calls += 1;
            Ok(Some(LatestLerobotTagInfo {
                name: "vulcan/0.9.0".to_string(),
                commit_sha: Some("def5678".to_string()),
            }))
        },
    )
    .expect("third cache resolution should refresh after ttl");
    assert_eq!(
        third,
        Some(LatestLerobotTagInfo {
            name: "vulcan/0.9.0".to_string(),
            commit_sha: Some("def5678".to_string()),
        })
    );
    assert_eq!(fetch_calls, 2);
}

#[test]
fn normalizes_real_git_commits_and_rejects_tags() {
    assert_eq!(
        LocalSetupService::normalize_git_commit_sha("ABCDEF1234"),
        Some("abcdef1234".to_string())
    );
    assert_eq!(
        LocalSetupService::normalize_git_commit_sha("vulcan/0.3.0"),
        None
    );
}

#[test]
fn uv_venv_args_pin_python_312() {
    assert_eq!(
        LocalSetupService::uv_venv_args(),
        ["venv", "--clear", "--python", "3.12"]
    );
}

#[test]
fn uv_pip_install_args_target_specific_python_and_extra() {
    #[cfg(windows)]
    let python_path = Path::new("C:\\venv\\Scripts\\python.exe");
    #[cfg(not(windows))]
    let python_path = Path::new("/tmp/venv/bin/python");

    let mut expected = vec![
        "pip".to_string(),
        "install".to_string(),
        "--python".to_string(),
        python_path.to_string_lossy().to_string(),
    ];
    #[cfg(windows)]
    {
        expected.push("--only-binary".to_string());
        expected.push("numpy".to_string());
    }
    expected.push("-e".to_string());
    expected.push(".[sourccey-desktop]".to_string());

    assert_eq!(
        LocalSetupService::uv_pip_install_args(python_path, Some("sourccey-desktop")),
        expected
    );
}
