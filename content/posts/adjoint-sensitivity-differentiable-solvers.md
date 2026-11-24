---
title: "Adjoint Sensitivity Analysis for Implicit Runge-Kutta Physics Solvers"
slug: "adjoint-sensitivity-differentiable-solvers"
abstract: "Draft benchmark comparing discrete reverse-mode checkpointing against continuous adjoint ODE integration for stiff Hamiltonian systems."
category: "Fluid Dynamics"
tags: ["Differentiable Physics", "Adjoint Method", "Numerical Analysis"]
status: draft
draft: true
author: "Prof. Henrik Lindqvist"
authorAffiliation: "Nordic Center for Continuum Mechanics"
publishedAt: "2026-11-21"
updatedAt: "2026-11-23"
---

## 1. Continuous Adjoint Formulation

Given state trajectory $\dot{\mathbf{y}} = \mathbf{f}(\mathbf{y}, \theta, t)$ and scalar loss $\mathcal{L}(\mathbf{y}(T))$, the adjoint state $\boldsymbol{\lambda}(t)$ satisfies the backward ODE:

$$\frac{d\boldsymbol{\lambda}}{dt} = -\left(\frac{\partial \mathbf{f}}{\partial \mathbf{y}}\right)^\top \boldsymbol{\lambda}, \qquad \boldsymbol{\lambda}(T) = \nabla_{\mathbf{y}} \mathcal{L}(\mathbf{y}(T))$$

Parameter gradients then follow from a single quadrature along the reverse trajectory without storing intermediate Newton iterates.
