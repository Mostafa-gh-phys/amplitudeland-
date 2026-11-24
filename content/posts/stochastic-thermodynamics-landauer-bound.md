---
title: "Finite-Time Corrections to Landauer Erasure in Overdamped Potentials"
slug: "stochastic-thermodynamics-landauer-bound"
abstract: "Using optimal transport on Wasserstein-2 manifolds, we compute the exact minimum dissipated heat required to reset a symmetric double-well bit in finite duration tau."
category: "Thermodynamics"
tags: ["Landauer Limit", "Optimal Transport", "Stochastic Physics"]
status: published
draft: false
author: "Dr. Clara Moreau"
authorAffiliation: "Ecole Normale Superieure, Paris"
publishedAt: "2026-10-19"
updatedAt: "2026-10-22"
doi: "10.48550/ax.2026.0067"
---

## 1. The Thermodynamic Cost of Bit Erasure

Erasure of a single symmetric memory bit reduces Shannon entropy by $\Delta S = -k_B \ln 2$. In the quasistatic limit $\tau \to \infty$, the average work obeys Landauer's principle:

$$\langle W \rangle \ge k_B T \ln 2$$

## 2. Finite-Time Optimal Transport Bound

For an overdamped Brownian particle with mobility $\mu$ evolving from probability density $\rho_0$ to $\rho_\tau$ over finite duration $\tau$, the minimum excess dissipation is governed by the squared $L^2$-Wasserstein distance $\mathcal{W}_2(\rho_0, \rho_\tau)^2$:

$$\langle W_{\text{diss}} \rangle_{\min} = \frac{\mathcal{W}_2(\rho_0, \rho_\tau)^2}{\mu \tau}$$

Combining both regimes gives the tight finite-time bound $\langle W \rangle \ge k_B T \ln 2 + \frac{\mathcal{W}_2^2}{\mu \tau}$, verified experimentally in feedback optical tweezers.
