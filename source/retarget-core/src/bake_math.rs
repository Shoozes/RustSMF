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
        q.map(|v| v / n)
    }
}
pub fn inv(q: Q) -> Q {
    [-q[0], -q[1], -q[2], q[3]]
}
pub fn mul(a: Q, b: Q) -> Q {
    crate::qmul(a, b)
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
            m[col * 4 + row] /= n;
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
pub fn worlds(s: &crate::SkeletonSnapshotV1, local: &[TransformV1]) -> Vec<M> {
    let mut out = Vec::with_capacity(local.len());
    for (i, t) in local.iter().enumerate() {
        let m = matrix(t);
        out.push(s.nodes[i].parent.map_or(m, |p| multiply(&out[p], &m)));
    }
    out
}
