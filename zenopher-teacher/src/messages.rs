//! English text for message keys. Rules: state measured and expected values, one cause and one effect at most,
//! never "bad", "wrong" or "ugly". Explanations say why the rule exists.
use crate::finding::{Expected, MessageKey, Unit};

pub fn fmt_value(unit: Unit, v: f64) -> String {
    match unit {
        // Ratios are floored so "2.96" never reads as "3.0 needs 3.0".
        Unit::Ratio => format!("{:.1}", (v * 10.0).floor() / 10.0),
        Unit::Px | Unit::Mm => {
            if (v - v.round()).abs() < 0.05 {
                format!("{:.0}", v)
            } else {
                format!("{:.1}", v)
            }
        }
        Unit::Share => format!("{:.2}", v),
        Unit::Fraction => format!("{:.0}", v * 100.0),
        Unit::Count | Unit::Dpi => format!("{:.0}", v),
    }
}

pub fn fmt_expected(unit: Unit, e: &Expected) -> String {
    match e {
        Expected::AtLeast { value } | Expected::AtMost { value } | Expected::Exactly { value } => {
            fmt_value(unit, *value)
        }
        Expected::Range { lo, hi } => {
            format!("{} to {}", fmt_value(unit, *lo), fmt_value(unit, *hi))
        }
    }
}

fn arg<'a>(k: &'a MessageKey, name: &str) -> &'a str {
    k.args.get(name).map(|s| s.as_str()).unwrap_or("")
}

fn label(rule: &str) -> &'static str {
    match rule {
        "colour.families" => "The number of colour families",
        "colour.dominant_share" => "The dominant colour share",
        "colour.neutral_share" => "The neutral share",
        "colour.accent_share" => "The accent colour share",
        "shape.geometric_share" => "The share of geometric shapes",
        "grid.edge_share" => "The share of edges on a shared line",
        "balance.asymmetry" => "The asymmetry",
        "hierarchy.ratio" => "The ratio between the two largest text sizes",
        "text.count_sizes" => "The number of text sizes",
        _ => "This measurement",
    }
}

pub fn message(k: &MessageKey) -> String {
    let (m, e) = (arg(k, "measured"), arg(k, "expected"));
    match k.key.as_str() {
        "contrast.message" => format!("Contrast is {m}:1. Needs {e}:1."),
        "text_size.message" => format!("Text is {m} px. This page needs at least {e} px. Smaller text is hard to read."),
        "text.cropped.message" => format!("{m}% of this text sits outside the page. It will be cut off when exported."),
        "leading.message" => format!("Line spacing is {m} times the font size. Expected {e}."),
        "alignment.message" => format!("These objects are {m} px out of line. They look almost, but not quite, aligned."),
        "spacing.message" => format!("Gaps in this row vary by {m}%. Even gaps look more deliberate."),
        "overlap.message" => format!("These objects overlap by {m}% of the smaller one. Overlap can hide content."),
        "tangency.message" => format!("These objects are {m} px apart. Nearly touching can read as accidental. Align them or leave at least {} px.", arg(k, "suggest")),
        "distortion.message" => format!("This image is stretched by {m}%. Its proportions differ from the original."),
        "print.dpi.message" => format!("This image has {m} DPI at print size. Print needs at least {e}."),
        "print.bleed.message" => format!("Bleed is {m} mm. Print needs at least {e} mm. Edges may show a white strip after trimming."),
        "print.colour_mode.message" => "The document is RGB but is set for print. The printer's conversion may shift colours.".to_string(),
        "pattern.message" => format!("{} is {m}. This style targets {e}.", label(arg(k, "rule"))),
        other => other.to_string(),
    }
}

pub fn explanation(k: &MessageKey) -> String {
    let base = match k.key.as_str() {
        "contrast.explain" => "Readers need enough difference between text and background to read comfortably. The WCAG guideline asks for 4.5:1 for body text and 3:1 for large text.",
        "text_size.explain" => "Text below a minimum share of the page is hard to read once the design is shown at normal size.",
        "text.cropped.explain" => "Anything outside the page is not exported, so the text would be cut off.",
        "leading.explain" => "Lines set too close collide; lines set too far apart stop reading as one block.",
        "alignment.explain" => "A difference of a pixel or two is too small to look intentional but large enough to look untidy. Consistent edges give the layout a clear structure.",
        "spacing.explain" => "Repeated items with uneven gaps look unplanned. Equal gaps help the eye move along the row.",
        "overlap.explain" => "Overlapping text or shapes can hide content, and the result is hard to read or print cleanly.",
        "tangency.explain" => "Objects that almost touch create visual tension. A clear gap or a shared edge looks like a decision.",
        "distortion.explain" => "Stretching an image changes the shapes in it, which is most visible in faces and logos.",
        "print.dpi.explain" => "Print needs more pixels per inch than a screen. Low resolution prints soft or blocky.",
        "print.bleed.explain" => "Printers trim paper with a small tolerance. Bleed extends colour past the edge so no white strip appears.",
        "print.colour_mode.explain" => "Printers use CMYK. Bright screen colours can look duller after conversion, and how much depends on the print workflow.",
        "pattern.explain" => "This is measured against the selected style. Styles describe tendencies, so this is guidance and can be ignored.",
        _ => "",
    };
    if arg(k, "unsure") == "1" {
        format!("{base} The teacher is unsure about this measurement, so it is shown as optional.")
    } else {
        base.to_string()
    }
}

/// Panel text for a style that cannot be used (section 13.5). Base checks keep running in all three cases.
pub fn style_unavailable(reason: &str) -> &'static str {
    match reason {
        "not_downloaded" => "Style not downloaded. Connect to load it.",
        "not_found" => "This style version can't be loaded. Choose another style.",
        _ => "This style needs an app update.",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn no_judgemental_words() {
        let keys = [
            "contrast",
            "text_size",
            "text.cropped",
            "leading",
            "alignment",
            "spacing",
            "overlap",
            "tangency",
            "distortion",
            "print.dpi",
            "print.bleed",
            "print.colour_mode",
            "pattern",
        ];
        for k in keys {
            let mk = |s: &str| MessageKey {
                key: format!("{k}.{s}"),
                args: [
                    ("measured", "1"),
                    ("expected", "2"),
                    ("suggest", "12"),
                    ("rule", "balance.asymmetry"),
                ]
                .iter()
                .map(|(a, b)| (a.to_string(), b.to_string()))
                .collect(),
            };
            for text in [message(&mk("message")), explanation(&mk("explain"))] {
                let t = text.to_lowercase();
                for bad in [" bad", "wrong", "ugly"] {
                    assert!(!t.contains(bad), "{k}: {text}");
                }
                assert!(!text.is_empty(), "{k} has no text");
            }
        }
    }
    #[test]
    fn ratio_is_floored() {
        assert_eq!(fmt_value(Unit::Ratio, 2.96), "2.9");
        assert_eq!(fmt_value(Unit::Ratio, 4.5), "4.5");
    }
}
