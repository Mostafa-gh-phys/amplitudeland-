---
title: "Vorticity Stretching and Energy Cascades in Incompressible Turbulence"
slug: "vorticity-stretching-navier-stokes"
abstract: "An analytical decomposition of the three-dimensional enstrophy budget examining alignment between the vorticity vector and the intermediate strain-rate eigenvector."
category: "Fluid Dynamics"
tags: ["Navier-Stokes", "Turbulence", "Vorticity", "PDEs"]
status: published
draft: false
author: "Prof. Henrik Lindqvist"
authorAffiliation: "Nordic Center for Continuum Mechanics"
publishedAt: "2026-11-04"
updatedAt: "2026-11-09"
doi: "10.48550/ax.2026.0098"
coverImage: "/src/assets/images/article_navier_stokes_1795515079471.jpg"
coverCaption: "Plate 2. Streamline transition from laminar shear into coherent vortical filaments."
---

## 1. The Vorticity Transport Equation

Taking the curl of the incompressible Navier-Stokes momentum equation eliminates pressure and isolates the evolution of the vorticity vector $\boldsymbol{\omega} = \nabla \times \mathbf{u}$:

$$\frac{\partial \boldsymbol{\omega}}{\partial t} + (\mathbf{u} \cdot \nabla)\boldsymbol{\omega} = (\boldsymbol{\omega} \cdot \nabla)\mathbf{u} + \nu \nabla^2 \boldsymbol{\omega}$$

In two dimensions, the vortex-stretching term $(\boldsymbol{\omega} \cdot \nabla)\mathbf{u}$ vanishes identically. In three dimensions, contracting with $\boldsymbol{\omega}$ produces the enstrophy production equation:

$$\frac{1}{2} \frac{D |\boldsymbol{\omega}|^2}{Dt} = \omega_i S_{ij} \omega_j - \nu |\nabla \boldsymbol{\omega}|^2$$

where $S_{ij} = \frac{1}{2}(\partial_i u_j + \partial_j u_i)$ is the symmetric rate-of-strain tensor with ordered eigenvalues $\lambda_1 \ge \lambda_2 \ge \lambda_3$ satisfying $\lambda_1 + \lambda_2 + \lambda_3 = 0$.

## 2. Kolmogorov Inertial Scaling

Within the inertial range $\eta \ll r \ll L$, dimensional homogeneity of the mean energy dissipation rate $\varepsilon$ yields the classical $-5/3$ kinetic energy spectrum:

$$E(k) = C_K \varepsilon^{2/3} k^{-5/3}, \qquad \eta = \left(\frac{\nu^3}{\varepsilon}\right)^{1/4}$$

### Strain Eigenframe Alignment

Direct numerical simulations consistently demonstrate that $\boldsymbol{\omega}$ aligns preferentially with the intermediate eigenvector $\mathbf{e}_2$ rather than the maximal stretching axis $\mathbf{e}_1$, because positive $\lambda_2 > 0$ sustains sheet-to-tube roll-up without destabilizing axial shear.
