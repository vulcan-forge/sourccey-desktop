use super::*;

#[test]
fn parses_prefixed_semver_tags() {
    assert_eq!(
        KioskUpdateService::parse_prefixed_semver("kiosk/1.2.3", "kiosk/"),
        Some(SimpleSemver {
            major: 1,
            minor: 2,
            patch: 3
        })
    );
    assert_eq!(
        KioskUpdateService::parse_prefixed_semver("kiosk/v0.5.0", "kiosk/"),
        Some(SimpleSemver {
            major: 0,
            minor: 5,
            patch: 0
        })
    );
    assert_eq!(
        KioskUpdateService::parse_prefixed_semver("kiosk/latest", "kiosk/"),
        None
    );
    assert_eq!(
        KioskUpdateService::parse_prefixed_semver("1.2.3", "kiosk/"),
        None
    );
    assert_eq!(
        KioskUpdateService::parse_prefixed_semver("v1.2.3", "kiosk/"),
        None
    );
}

#[test]
fn selects_latest_tag_for_prefix() {
    let selected = KioskUpdateService::select_latest_prefixed_tag(
        vec![
            LatestTagInfo {
                name: "vulcan/0.1.0".to_string(),
                commit_sha: Some("111".to_string()),
            },
            LatestTagInfo {
                name: "vulcan/0.3.0".to_string(),
                commit_sha: Some("333".to_string()),
            },
            LatestTagInfo {
                name: "v9.9.9".to_string(),
                commit_sha: Some("999".to_string()),
            },
            LatestTagInfo {
                name: "9.9.9".to_string(),
                commit_sha: Some("999".to_string()),
            },
            LatestTagInfo {
                name: "other/9.9.9".to_string(),
                commit_sha: Some("999".to_string()),
            },
            LatestTagInfo {
                name: "vulcan/0.2.5".to_string(),
                commit_sha: Some("225".to_string()),
            },
        ],
        "vulcan/",
    );
    assert_eq!(
        selected,
        Some(LatestTagInfo {
            name: "vulcan/0.3.0".to_string(),
            commit_sha: Some("333".to_string()),
        })
    );
}

#[test]
fn ignores_non_semver_prefixed_tags_when_selecting_latest() {
    let selected = KioskUpdateService::select_latest_prefixed_tag(
        vec![
            LatestTagInfo {
                name: "vulcan/latest".to_string(),
                commit_sha: Some("latest".to_string()),
            },
            LatestTagInfo {
                name: "vulcan/release".to_string(),
                commit_sha: Some("release".to_string()),
            },
            LatestTagInfo {
                name: "other/1.0.0".to_string(),
                commit_sha: Some("other".to_string()),
            },
        ],
        "vulcan/",
    );
    assert_eq!(selected, None);
}

#[test]
fn treats_head_that_contains_latest_tag_commit_as_up_to_date() {
    assert!(KioskUpdateService::is_repo_up_to_date_from_sources(
        None,
        Some("kiosk/1.1.0"),
        "kiosk/",
        Some(true),
    ));
}

#[test]
fn falls_back_to_tag_comparison_when_commit_check_cannot_confirm_currency() {
    assert!(!KioskUpdateService::is_repo_up_to_date_from_sources(
        None,
        Some("kiosk/1.1.0"),
        "kiosk/",
        Some(false),
    ));
    assert!(KioskUpdateService::is_repo_up_to_date_from_sources(
        Some("kiosk/1.1.0"),
        Some("kiosk/1.1.0"),
        "kiosk/",
        None,
    ));
}

#[test]
fn compares_current_and_latest_tags() {
    assert!(KioskUpdateService::is_current_tag_up_to_date(
        Some("kiosk/1.0.0"),
        Some("kiosk/1.0.0"),
        "kiosk/"
    ));
    assert!(KioskUpdateService::is_current_tag_up_to_date(
        Some("kiosk/1.1.0"),
        Some("kiosk/1.0.0"),
        "kiosk/"
    ));
    assert!(!KioskUpdateService::is_current_tag_up_to_date(
        Some("kiosk/1.0.0"),
        Some("kiosk/1.1.0"),
        "kiosk/"
    ));
    assert!(!KioskUpdateService::is_current_tag_up_to_date(
        None,
        Some("kiosk/1.1.0"),
        "kiosk/"
    ));
    assert!(KioskUpdateService::is_current_tag_up_to_date(
        Some("kiosk/non-semver"),
        Some("kiosk/non-semver"),
        "kiosk/"
    ));
}

#[test]
fn reuses_cached_tag_inside_ttl() {
    let mut cache: Option<KioskTagCacheEntry> = None;
    let start = Instant::now();
    let mut calls = 0;

    let first = KioskUpdateService::resolve_latest_tag_with_cache_entry(&mut cache, start, || {
        calls += 1;
        Ok(Some(LatestTagInfo {
            name: "kiosk/1.0.0".to_string(),
            commit_sha: Some("100".to_string()),
        }))
    })
    .expect("first call should succeed");
    assert_eq!(
        first,
        Some(LatestTagInfo {
            name: "kiosk/1.0.0".to_string(),
            commit_sha: Some("100".to_string()),
        })
    );
    assert_eq!(calls, 1);

    let second = KioskUpdateService::resolve_latest_tag_with_cache_entry(
        &mut cache,
        start + Duration::from_secs(120),
        || {
            calls += 1;
            Ok(Some(LatestTagInfo {
                name: "kiosk/2.0.0".to_string(),
                commit_sha: Some("200".to_string()),
            }))
        },
    )
    .expect("second call should reuse cache");
    assert_eq!(
        second,
        Some(LatestTagInfo {
            name: "kiosk/1.0.0".to_string(),
            commit_sha: Some("100".to_string()),
        })
    );
    assert_eq!(calls, 1);

    let third = KioskUpdateService::resolve_latest_tag_with_cache_entry(
        &mut cache,
        start + KioskUpdateService::TAG_CACHE_TTL + Duration::from_secs(1),
        || {
            calls += 1;
            Ok(Some(LatestTagInfo {
                name: "kiosk/2.0.0".to_string(),
                commit_sha: Some("200".to_string()),
            }))
        },
    )
    .expect("third call should refresh after ttl");
    assert_eq!(
        third,
        Some(LatestTagInfo {
            name: "kiosk/2.0.0".to_string(),
            commit_sha: Some("200".to_string()),
        })
    );
    assert_eq!(calls, 2);
}
