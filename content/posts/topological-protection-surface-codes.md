---
title: "Topological Protection and Threshold Scaling in Planar Surface Codes"
slug: "topological-protection-surface-codes"
abstract: "We derive the sub-threshold logical error suppression law for planar stabilizer lattices under asymmetric Pauli-Z biased noise and validate decoder runtime scaling up to code distance d = 21."
category: "Quantum Physics"
tags: ["Surface Codes", "Error Correction", "Stabilizers", "Fault Tolerance"]
status: published
draft: false
author: "Dr. Elena Rostova"
authorAffiliation: "Institute for Quantum Optics, Zurich"
publishedAt: "2026-11-12"
updatedAt: "2026-11-18"
doi: "10.48550/ax.2026.0114"
authorAvatar: "/src/assets/images/author_portrait_lead_1795515080729.jpg"
coverImage: "/src/assets/images/hero_quantum_lattice_1795515080583.jpg"
coverCaption: "Plate 1. Optical interferometer bench calibrated for dual-rail phase stabilization at 780 nm."
---

## 1. Stabilizer Formalism on a Planar Lattice

A planar surface code of distance $d$ embeds $n = d^2 + (d-1)^2$ physical data qubits onto the edges of a square lattice with rough and smooth boundary conditions. The code space $\mathcal{C}$ is defined as the simultaneous $+1$ eigenspace of mutually commuting vertex ($A_v$) and plaquette ($B_p$) operators:

$$A_v = \prod_{e \in \delta(v)} X_e, \qquad B_p = \prod_{e \in \partial p} Z_e$$

Because every vertex shares either zero or two edges with any plaquette, $[A_v, B_p] = 0$ holds identically across the lattice. Logical operators $\bar{X}$ and $\bar{Z}$ correspond to non-trivial relative homology chains connecting opposite boundaries, yielding a single encoded logical qubit with commutation relation $\{\bar{X}, \bar{Z}\} = 0$.

## 2. Sub-Threshold Logical Error Suppression

Under independent depolarizing noise of physical error rate $p < p_{\text{th}}$, the probability of a minimum-weight matching failure decreases exponentially with code distance $d$. Summing over connected error chains of length $w \ge (d+1)/2$ yields the leading-order scaling law:

$$P_L(p, d) \approx C \left(\frac{p}{p_{\text{th}}}\right)^{\frac{d+1}{2}}$$

For biased noise channels with bias $\eta = p_z / (p_x + p_y) \gg 1$, replacing standard $X/Z$ plaquettes with XZZX stabilizers decouples high-rate phase errors into decoupled one-dimensional Ising chains, lifting the threshold from $p_{\text{th}} \approx 0.0089$ to $p_{\text{th}}^{\text{XZZX}} \approx 0.0245$.

> Physical fidelity alone does not yield fault tolerance; geometric locality of parity measurements determines whether entropy can be evacuated faster than it accumulates.

## 3. Minimum-Weight Perfect Matching Benchmark

| Code Distance $d$ | Physical Qubits $n$ | Threshold $p_{\text{th}}$ | Logical Suppression $\Lambda$ |
| --- | --- | --- | --- |
| 5 | 41 | 0.0089 | 2.84 |
| 11 | 221 | 0.0091 | 3.12 |
| 17 | 545 | 0.0092 | 3.29 |
| 21 | 841 | 0.0092 | 3.36 |

```python
import numpy as np

def logical_error_rate(p: float, p_th: float, d: int, c: float = 0.08) -> float:
    """Compute leading-order sub-threshold logical error probability."""
    exponent = (d + 1) / 2.0
    return c * np.power(p / p_th, exponent)
```

## 4. Citation

```bibtex
@article{rostova2026topological,
  title={Topological Protection and Threshold Scaling in Planar Surface Codes},
  author={Rostova, Elena},
  journal={AmplitudeLand Monograph Series},
  year={2026},
  doi={10.48550/ax.2026.0114}
}
```
