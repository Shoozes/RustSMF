//! Three.js matrix decomposition and quaternion conventions (see THREE_LICENSE.txt).
use crate::sampler::{matrix, multiply, TransformV1};
pub type V = [f64; 3];
pub type Q = [f64; 4];
pub type M = [f64; 16];
pub const ID: Q = [0., 0., 0., 1.];
pub fn add(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] + b[i])
}
pub fn sub(a: V, b: V) -> V {
    std::array::from_fn(|i| a[i] - b[i])
}
pub fn scale(a: V, s: f64) -> V {
    a.map(|v| v * s)
}
pub fn dot(a: V, b: V) -> f64 {
    (0..3).map(|i| a[i] * b[i]).sum()
}
pub fn length(a: V) -> f64 {
    libm::sqrt(dot(a, a))
}
pub fn unit(a: V) -> V {
    let n = length(a);
    if n == 0. {
        a
    } else {
        scale(a, 1. / n)
    }
}
pub fn norm(q: Q) -> Q {
    let n = libm::sqrt(q.iter().map(|v| v * v).sum());
    if n == 0. {
        ID
    } else {
        let inverse = 1. / n;
        q.map(|v| v * inverse)
    }
}
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
pub fn axis_angle(axis: V, angle: f64) -> Q {
    let s = libm::sin(angle / 2.);
    [axis[0] * s, axis[1] * s, axis[2] * s, libm::cos(angle / 2.)]
}
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
pub fn slerp(a: Q, mut b: Q, t: f64) -> Q {
    if t == 0. {
        return a;
    }
    if t == 1. {
        return b;
    }
    let mut cosine: f64 = a.iter().zip(b).map(|(a, b)| a * b).sum();
    if cosine < 0. {
        b = b.map(|v| -v);
        cosine = -cosine;
    }
    if cosine >= 1. {
        return a;
    }
    let sin_sq = 1. - cosine * cosine;
    if sin_sq <= f64::EPSILON {
        return norm(std::array::from_fn(|i| (1. - t) * a[i] + t * b[i]));
    }
    let sine = libm::sqrt(sin_sq);
    let angle = libm::atan2(sine, cosine);
    let x = libm::sin((1. - t) * angle) / sine;
    let y = libm::sin(t * angle) / sine;
    std::array::from_fn(|i| a[i] * x + b[i] * y)
}
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
pub fn angle(a: Q, b: Q) -> f64 {
    2. * libm::acos(
        a.iter()
            .zip(b)
            .map(|(a, b)| a * b)
            .sum::<f64>()
            .clamp(-1., 1.)
            .abs(),
    )
}
pub fn inv(q: Q) -> Q {
    [-q[0], -q[1], -q[2], q[3]]
}
pub fn mul(a: Q, b: Q) -> Q {
    [
        a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
        a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
        a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ]
}
pub fn rotate(q: Q, v: V) -> V {
    crate::rotate(q, v)
}
pub fn between(a: V, b: V) -> Q {
    let r = dot(a, b) + 1.;
    if r < f64::EPSILON {
        if a[0].abs() > a[2].abs() {
            norm([-a[1], a[0], 0., 0.])
        } else {
            norm([0., -a[2], a[1], 0.])
        }
    } else {
        let c = crate::cross(a, b);
        norm([c[0], c[1], c[2], r])
    }
}
pub fn rotation(m: M) -> Q {
    let (m11, m12, m13, m21, m22, m23, m31, m32, m33) =
        (m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]);
    let trace = m11 + m22 + m33;
    if trace > 0. {
        let s = 0.5 / libm::sqrt(trace + 1.);
        [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s]
    } else if m11 > m22 && m11 > m33 {
        let s = 2. * libm::sqrt(1. + m11 - m22 - m33);
        [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s]
    } else if m22 > m33 {
        let s = 2. * libm::sqrt(1. + m22 - m11 - m33);
        [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s]
    } else {
        let s = 2. * libm::sqrt(1. + m33 - m11 - m22);
        [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s]
    }
}
pub fn decompose_q(mut m: M) -> Q {
    let determinant = m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2])
        + m[8] * (m[1] * m[6] - m[5] * m[2]);
    for col in 0..3 {
        let mut n = length([m[col * 4], m[col * 4 + 1], m[col * 4 + 2]]);
        if col == 0 && determinant < 0. {
            n = -n;
        }
        for row in 0..3 {
            m[col * 4 + row] *= 1. / n;
        }
    }
    rotation(m)
}
pub fn point(m: M) -> V {
    [m[12], m[13], m[14]]
}
pub fn inverse_point(m: M, v: V) -> V {
    let (a, b, c, d, e, f, g, h, i) = (m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]);
    let det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if det == 0. {
        return [0.; 3];
    }
    let [x, y, z] = sub(v, point(m));
    [
        ((e * i - f * h) * x + (c * h - b * i) * y + (b * f - c * e) * z) / det,
        ((f * g - d * i) * x + (a * i - c * g) * y + (c * d - a * f) * z) / det,
        ((d * h - e * g) * x + (b * g - a * h) * y + (a * e - b * d) * z) / det,
    ]
}
#[cfg(any(not(target_arch = "wasm32"), feature = "advanced-bake"))]
pub fn inverse_affine(m: M) -> M {
    let (n11, n21, n31, n12, n22, n32, n13, n23, n33, n14, n24, n34) = (
        m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10], m[12], m[13], m[14],
    );
    let t11 = -n23 * n32 + n22 * n33;
    let t12 = n13 * n32 - n12 * n33;
    let t13 = -n13 * n22 + n12 * n23;
    let t14 =
        n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34
            - n12 * n23 * n34;
    let det = n11 * t11 + n21 * t12 + n31 * t13;
    if det == 0. {
        return [0.; 16];
    }
    let d = 1. / det;
    [
        t11 * d,
        (n23 * n31 - n21 * n33) * d,
        (-n22 * n31 + n21 * n32) * d,
        0.,
        t12 * d,
        (-n13 * n31 + n11 * n33) * d,
        (n12 * n31 - n11 * n32) * d,
        0.,
        t13 * d,
        (n13 * n21 - n11 * n23) * d,
        (-n12 * n21 + n11 * n22) * d,
        0.,
        t14 * d,
        (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34
            + n11 * n23 * n34)
            * d,
        (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34
            - n11 * n22 * n34)
            * d,
        1.,
    ]
}
pub fn worlds(s: &crate::SkeletonSnapshotV1, local: &[TransformV1]) -> Vec<M> {
    let mut out = Vec::with_capacity(local.len());
    for (i, t) in local.iter().enumerate() {
        let m = matrix(t);
        out.push(s.nodes[i].parent.map_or(m, |p| multiply(&out[p], &m)));
    }
    out
}
pub fn sample(t: &crate::sampler::TrackV1, time: f64) -> Vec<f64> {
    if t.property != "quaternion" || t.interpolation != "linear" {
        return crate::sampler::track(t, time);
    }
    let upper = t.times.partition_point(|v| *v as f64 <= time);
    if upper == 0 || upper == t.times.len() {
        let i = upper.saturating_sub(1).min(t.times.len() - 1);
        return t.values[i * 4..i * 4 + 4]
            .iter()
            .map(|v| *v as f64)
            .collect();
    }
    let lo = upper - 1;
    let a: Q = std::array::from_fn(|i| t.values[lo * 4 + i] as f64);
    let mut b: Q = std::array::from_fn(|i| t.values[upper * 4 + i] as f64);
    let p = (time - t.times[lo] as f64) / (t.times[upper] as f64 - t.times[lo] as f64);
    let mut dot: f64 = a.iter().zip(b).map(|(a, b)| a * b).sum();
    if a == b || p == 0. {
        return a.to_vec();
    }
    if dot < 0. {
        dot = -dot;
        b = b.map(|v| -v);
    }
    let q = if dot < 0.9995 {
        let theta = libm::acos(dot);
        let sine = libm::sin(theta);
        let s = libm::sin((1. - p) * theta) / sine;
        let p = libm::sin(p * theta) / sine;
        std::array::from_fn(|i| a[i] * s + b[i] * p)
    } else {
        norm(std::array::from_fn(|i| a[i] * (1. - p) + b[i] * p))
    };
    q.map(|v| (v as f32) as f64).to_vec()
}
