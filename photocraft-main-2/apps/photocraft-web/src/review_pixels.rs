//! Detect flat colours during the existing PNG export; never infer them from a thumbnail.
#[derive(Default)]
pub struct UniformRgba {
    first: Option<[u8; 4]>,
    varied: bool,
}
impl UniformRgba {
    pub fn observe(&mut self, pixel: [u8; 4]) {
        if self.varied {
            return;
        }
        match self.first {
            None => self.first = Some(pixel),
            Some(first) => self.varied = first != pixel,
        }
    }
    pub fn hex(&self) -> Option<String> {
        if self.varied {
            return None;
        }
        let [r, g, b, a] = self.first?;
        Some(format!("#{r:02x}{g:02x}{b:02x}{a:02x}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_identical_pixels_including_alpha_are_flat() {
        let mut flat = UniformRgba::default();
        assert_eq!(flat.hex(), None);
        for _ in 0..100 {
            flat.observe([255, 255, 255, 255]);
        }
        assert_eq!(flat.hex().as_deref(), Some("#ffffffff"));
        flat.observe([255, 255, 255, 0]);
        assert_eq!(flat.hex(), None);
        flat.observe([255, 255, 255, 255]);
        assert_eq!(flat.hex(), None, "later pixels cannot erase variation");
    }
    #[test]
    fn gradients_and_photo_pixels_are_not_flat() {
        let mut pixels = UniformRgba::default();
        pixels.observe([255, 0, 0, 255]);
        pixels.observe([254, 0, 0, 255]);
        assert_eq!(pixels.hex(), None);
    }
}
