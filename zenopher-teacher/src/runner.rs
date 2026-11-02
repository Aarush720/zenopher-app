//! Turns raw rule output into classified findings (spec section 6).
use crate::config::Config;
use crate::finding::*;
use crate::messages::{fmt_expected, fmt_value};
use crate::rules::Raw;
use std::collections::BTreeMap;

/// Severity rules, in order:
/// 1. pattern findings are never must; 2. professional findings are never must;
/// 3. a base finding is must when measurement confidence >= 0.6 and the check's default is must;
/// 4. otherwise optional. A must that fell to rule 4 for low confidence is marked `unsure`.
pub fn classify(raw: Raw, class: Class, cfg: &Config) -> Finding {
    let (severity, unsure) = match class {
        Class::Pattern | Class::Professional => (Severity::Optional, false),
        Class::Base => match raw.default {
            Severity::Must if raw.confidence >= cfg.confidence.must_min_measurement => {
                (Severity::Must, false)
            }
            Severity::Must => (Severity::Optional, true),
            Severity::Optional => (Severity::Optional, false),
        },
    };
    let mut layers = raw.layers.clone();
    layers.sort_unstable();
    let mut args: BTreeMap<String, String> = raw.args.clone();
    args.insert(
        "measured".into(),
        fmt_value(raw.measured.unit, raw.measured.value),
    );
    args.insert(
        "expected".into(),
        fmt_expected(raw.measured.unit, &raw.expected),
    );
    let (mkey, ekey) = if class == Class::Base {
        (
            format!("{}.message", raw.rule),
            format!("{}.explain", raw.rule),
        )
    } else {
        args.insert("rule".into(), raw.rule.clone());
        ("pattern.message".to_string(), "pattern.explain".to_string())
    };
    let mut eargs = args.clone();
    if unsure {
        eargs.insert("unsure".into(), "1".into());
    }
    Finding {
        rule: raw.rule,
        class,
        severity,
        layers,
        measured: raw.measured,
        expected: raw.expected,
        score: raw.score,
        measurement_confidence: raw.confidence,
        message: MessageKey { key: mkey, args },
        explanation: MessageKey {
            key: ekey,
            args: eargs,
        },
        fix: raw.fix,
        unsure,
        extra: raw.extra,
    }
}
