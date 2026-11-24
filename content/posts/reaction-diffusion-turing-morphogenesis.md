---
title: "Linear Stability Criteria for Two-Component Turing Morphogenesis"
slug: "reaction-diffusion-turing-morphogenesis"
abstract: "Necessary and sufficient Jacobian conditions for diffusion-driven spatial symmetry breaking in coupled activator-inhibitor biochemical networks."
category: "Computational Biology"
tags: ["Turing Patterns", "Morphogenesis", "Dynamical Systems"]
status: published
draft: false
author: "Dr. Samuel Okafor"
authorAffiliation: "Wellcome Centre for Quantitative Biology"
publishedAt: "2026-10-08"
updatedAt: "2026-10-12"
doi: "10.48550/ax.2026.0052"
---

## 1. Coupled Activator-Inhibitor PDEs

Consider an activator concentration $u(\mathbf{x}, t)$ and a rapidly diffusing inhibitor $v(\mathbf{x}, t)$ satisfying:

$$\frac{\partial u}{\partial t} = f(u, v) + D_u \nabla^2 u, \qquad \frac{\partial v}{\partial t} = g(u, v) + D_v \nabla^2 v$$

Linearizing around a homogeneous steady state $(u^*, v^*)$ with wavenumber $k$ yields the dispersion matrix $J_k = J_0 - k^2 \operatorname{diag}(D_u, D_v)$.

## 2. Diffusion-Driven Instability

For the steady state to remain stable when $k=0$ yet destabilize at finite $k > 0$, the diffusivity ratio $d = D_v / D_u$ must exceed the critical threshold:

$$d > d_c = \frac{1}{f_u^2}\left(f_u g_v - 2 f_v g_u + 2\sqrt{-f_v g_u (f_u g_v - f_v g_u)}\right)$$
