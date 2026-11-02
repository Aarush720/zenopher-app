//! All thresholds are data. A style profile may override some of them within fixed ranges.
use serde::{Deserialize, Serialize};

macro_rules! cfg_struct {
    ($name:ident { $($f:ident : $t:ty = $d:expr),* $(,)? }) => {
        #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
        #[serde(default)]
        pub struct $name { $(pub $f: $t),* }
        impl Default for $name { fn default() -> Self { $name { $($f: $d),* } } }
    };
}

cfg_struct!(ContrastCfg {
    large_text_px: f32 = 24.0,
    large_bold_px: f32 = 18.7,
    required_large: f32 = 3.0,
    required_normal: f32 = 4.5,
    fix_margin: f32 = 0.02
});
cfg_struct!(TextSizeCfg {
    min_ratio_of_short_side: f32 = 0.015
});
cfg_struct!(LeadingCfg {
    min: f32 = 1.0,
    max: f32 = 2.0,
    fix_to: f32 = 1.2
});
cfg_struct!(AlignmentCfg {
    neighbourhood_ratio: f32 = 0.05,
    tolerance_ratio: f32 = 0.002,
    epsilon_px: f32 = 0.05
});
cfg_struct!(SpacingCfg {
    cv_threshold: f32 = 0.15,
    must_min_objects: usize = 5
});
cfg_struct!(OverlapCfg {
    text_text_ratio: f32 = 0.10,
    shape_shape_ratio: f32 = 0.25
});
cfg_struct!(TangencyCfg {
    max_gap_px: f32 = 6.0,
    suggest_gap_px: f32 = 12.0
});
cfg_struct!(DistortionCfg {
    max_deviation: f32 = 0.02
});
cfg_struct!(ColourCfg {
    chroma_neutral: f32 = 0.04,
    chroma_accent: f32 = 0.20,
    hue_merge_deg: f32 = 20.0,
    min_family_share: f32 = 0.02
});
cfg_struct!(ConfidenceCfg {
    must_min_measurement: f32 = 0.6
});
cfg_struct!(OrchestrationCfg {
    idle_ms: u64 = 400,
    apply_all_max_passes: u8 = 3,
    rules_per_slice: usize = 4
});
cfg_struct!(CritiqueCfg {
    max_image_px: u32 = 1024,
    max_points: usize = 6,
    max_comment_chars: usize = 240
});
cfg_struct!(BackgroundCfg {
    low_spread: f32 = 0.03,
    high_spread: f32 = 0.12,
    max_samples: usize = 64
});
cfg_struct!(PrintCfg {
    dpi_must: f32 = 150.0,
    dpi_optional: f32 = 300.0,
    min_bleed_mm: f32 = 3.0
});
cfg_struct!(HintCfg {
    familiar_after_applies: u32 = 3,
    demote_after_dismissals: u32 = 3
});

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    pub contrast: ContrastCfg,
    pub text_size: TextSizeCfg,
    pub leading: LeadingCfg,
    pub alignment: AlignmentCfg,
    pub spacing: SpacingCfg,
    pub overlap: OverlapCfg,
    pub tangency: TangencyCfg,
    pub distortion: DistortionCfg,
    pub colour: ColourCfg,
    pub confidence: ConfidenceCfg,
    pub orchestration: OrchestrationCfg,
    pub critique: CritiqueCfg,
    pub background: BackgroundCfg,
    pub print: PrintCfg,
    pub hints: HintCfg,
}

/// The keys a style may override, with the range each must stay inside.
pub fn override_range(key: &str) -> Option<(f64, f64)> {
    Some(match key {
        "spacing.cv_threshold" => (0.05, 0.40),
        "alignment.tolerance_ratio" => (0.0005, 0.005),
        "overlap.shape_shape_ratio" => (0.05, 0.60),
        "tangency.max_gap_px" => (2.0, 12.0),
        "leading.fix_to" => (1.1, 1.6),
        "colour.chroma_accent" => (0.10, 0.40),
        "colour.chroma_neutral" => (0.01, 0.08),
        _ => return None,
    })
}

impl Config {
    /// Apply validated overrides on top of the base. Unknown keys are ignored here; the style loader rejects them.
    pub fn with_overrides(&self, overrides: &[(String, f64)]) -> Config {
        let mut c = self.clone();
        for (k, v) in overrides {
            let v32 = *v as f32;
            match k.as_str() {
                "spacing.cv_threshold" => c.spacing.cv_threshold = v32,
                "alignment.tolerance_ratio" => c.alignment.tolerance_ratio = v32,
                "overlap.shape_shape_ratio" => c.overlap.shape_shape_ratio = v32,
                "tangency.max_gap_px" => c.tangency.max_gap_px = v32,
                "leading.fix_to" => c.leading.fix_to = v32,
                "colour.chroma_accent" => c.colour.chroma_accent = v32,
                "colour.chroma_neutral" => c.colour.chroma_neutral = v32,
                _ => {}
            }
        }
        c
    }
}
