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
        "release/5.0.0".to_string(),
        "1.9.9".to_string(),
        "v2.0.0".to_string(),
        "vulcan/0.1.0".to_string(),
        "vulcan/0.3.0".to_string(),
        "vulcan/0.2.5".to_string(),
    ]);
    assert_eq!(selected, Some("vulcan/0.3.0".to_string()));
}

#[test]
fn ignores_non_semver_vulcan_tags_when_selecting_latest() {
    let selected = LocalSetupService::select_latest_vulcan_tag(vec![
        "vulcan/latest".to_string(),
        "vulcan/release".to_string(),
        "other/1.0.0".to_string(),
    ]);
    assert_eq!(selected, None);
}

#[test]
fn compares_tags_with_semver_and_exact_fallback() {
    assert!(LocalSetupService::is_current_tag_up_to_date(
        Some("vulcan/0.1.0"),
        Some("vulcan/0.1.0")
    ));
    assert!(LocalSetupService::is_current_tag_up_to_date(
        Some("vulcan/0.2.0"),
        Some("vulcan/0.1.0")
    ));
    assert!(!LocalSetupService::is_current_tag_up_to_date(
        Some("vulcan/0.1.0"),
        Some("vulcan/0.2.0")
    ));
    assert!(LocalSetupService::is_current_tag_up_to_date(
        Some("vulcan/release"),
        Some("vulcan/release")
    ));
    assert!(!LocalSetupService::is_current_tag_up_to_date(
        Some("vulcan/release-a"),
        Some("vulcan/release-b")
    ));
}

#[test]
fn reuses_cached_latest_tag_inside_ttl() {
    let mut cache: Option<LerobotTagCacheEntry> = None;
    let start = Instant::now();
    let mut fetch_calls = 0;

    let first = LocalSetupService::resolve_latest_tag_with_cache(&mut cache, start, || {
        fetch_calls += 1;
        Ok(Some("vulcan/0.2.0".to_string()))
    })
    .expect("first cache resolution should succeed");
    assert_eq!(first, Some("vulcan/0.2.0".to_string()));
    assert_eq!(fetch_calls, 1);

    let second =
        LocalSetupService::resolve_latest_tag_with_cache(&mut cache, start + Duration::from_secs(60), || {
            fetch_calls += 1;
            Ok(Some("vulcan/0.9.0".to_string()))
        })
        .expect("second cache resolution should reuse cache");
    assert_eq!(second, Some("vulcan/0.2.0".to_string()));
    assert_eq!(fetch_calls, 1);

    let third = LocalSetupService::resolve_latest_tag_with_cache(
        &mut cache,
        start + LocalSetupService::LEROBOT_TAG_CACHE_TTL + Duration::from_secs(1),
        || {
            fetch_calls += 1;
            Ok(Some("vulcan/0.9.0".to_string()))
        },
    )
    .expect("third cache resolution should refresh after ttl");
    assert_eq!(third, Some("vulcan/0.9.0".to_string()));
    assert_eq!(fetch_calls, 2);
}

#[test]
fn uv_venv_args_pin_python_312() {
    assert_eq!(
        LocalSetupService::uv_venv_args(),
        ["venv", "--clear", "--python", "3.12"]
    );
}
