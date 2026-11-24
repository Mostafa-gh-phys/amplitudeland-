import { countLatexEquations, estimateReadingTime } from './frontmatter.ts';
import type { Article, CategoryMeta, CommitRecord } from './types.ts';

export const SEED_CATEGORIES: CategoryMeta[] = [
  {
    name: 'Quantum Physics',
    slug: 'quantum-physics',
    description: 'Fault-tolerant architectures, topological stabilizer codes, and optical interferometry.',
  },
  {
    name: 'Fluid Dynamics',
    slug: 'fluid-dynamics',
    description: 'Vorticity cascades, boundary-layer stability, and spectral Navier-Stokes solvers.',
  },
  {
    name: 'Mathematics',
    slug: 'mathematics',
    description: 'Higher category theory, differential topology, and homological invariants.',
  },
  {
    name: 'Thermodynamics',
    slug: 'thermodynamics',
    description: 'Stochastic entropy production, Landauer bounds, and non-equilibrium statistical mechanics.',
  },
  {
    name: 'Computational Biology',
    slug: 'computational-biology',
    description: 'Reaction-diffusion morphogenesis and stochastic gene-regulatory kinetics.',
  },
];

interface RawSeed {
  id: string;
  slug: string;
  title: string;
  abstract: string;
  category: string;
  tags: string[];
  status: 'published' | 'draft';
  author: string;
  authorAffiliation: string;
  authorAvatar?: string;
  publishedAt: string;
  updatedAt: string;
  doi?: string;
  coverImage?: string;
  coverCaption?: string;
  commitSha: string;
  commitMessage: string;
  body: string;
}

const RAW_SEEDS: RawSeed[] = [
  {
    id: 'art-1',
    slug: 'topological-protection-surface-codes',
    title: 'Topological Protection and Threshold Scaling in Planar Surface Codes',
    abstract:
      'We derive the sub-threshold logical error suppression law for planar stabilizer lattices under asymmetric Pauli-Z biased noise and validate decoder runtime scaling up to code distance d = 21.',
    category: 'Quantum Physics',
    tags: ['Surface Codes', 'Error Correction', 'Stabilizers', 'Fault Tolerance'],
    status: 'published',
    author: 'Dr. Elena Rostova',
    authorAffiliation: 'Institute for Quantum Optics, Zurich',
    authorAvatar: '/src/assets/images/author_portrait_lead_1795515080729.jpg',
    publishedAt: '2026-11-12',
    updatedAt: '2026-11-18',
    doi: '10.48550/ax.2026.0114',
    coverImage: '/src/assets/images/hero_quantum_lattice_1795515080583.jpg',
    coverCaption: 'Plate 1. Optical interferometer bench calibrated for dual-rail phase stabilization at 780 nm.',
    commitSha: '9c4e1b8',
    commitMessage: 'cms(publish): finalize threshold scaling proof for distance d=21',
    body: `## 1. Stabilizer Formalism on a Planar Lattice

A planar surface code of distance $d$ embeds $n = d^2 + (d-1)^2$ physical data qubits onto the edges of a square lattice with rough and smooth boundary conditions. The code space $\\mathcal{C}$ is defined as the simultaneous $+1$ eigenspace of mutually commuting vertex ($A_v$) and plaquette ($B_p$) operators:

$$A_v = \\prod_{e \\in \\delta(v)} X_e, \\qquad B_p = \\prod_{e \\in \\partial p} Z_e$$

Because every vertex shares either zero or two edges with any plaquette, $[A_v, B_p] = 0$ holds identically across the lattice. Logical operators $\\bar{X}$ and $\\bar{Z}$ correspond to non-trivial relative homology chains connecting opposite boundaries, yielding a single encoded logical qubit with commutation relation $\\{\\bar{X}, \\bar{Z}\\} = 0$.

## 2. Sub-Threshold Logical Error Suppression

Under independent depolarizing noise of physical error rate $p < p_{\\text{th}}$, the probability of a minimum-weight matching failure decreases exponentially with code distance $d$. Summing over connected error chains of length $w \\ge (d+1)/2$ yields the leading-order scaling law:

$$P_L(p, d) \\approx C \\left(\\frac{p}{p_{\\text{th}}}\\right)^{\\frac{d+1}{2}}$$

For biased noise channels with bias $\\eta = p_z / (p_x + p_y) \\gg 1$, replacing standard $X/Z$ plaquettes with XZZX stabilizers decouples high-rate phase errors into decoupled one-dimensional Ising chains, lifting the threshold from $p_{\\text{th}} \\approx 0.0089$ to $p_{\\text{th}}^{\\text{XZZX}} \\approx 0.0245$.

> Physical fidelity alone does not yield fault tolerance; geometric locality of parity measurements determines whether entropy can be evacuated faster than it accumulates.

## 3. Minimum-Weight Perfect Matching Benchmark

| Code Distance $d$ | Physical Qubits $n$ | Threshold $p_{\\text{th}}$ | Logical Suppression $\\Lambda$ |
| --- | --- | --- | --- |
| 5 | 41 | 0.0089 | 2.84 |
| 11 | 221 | 0.0091 | 3.12 |
| 17 | 545 | 0.0092 | 3.29 |
| 21 | 841 | 0.0092 | 3.36 |

\`\`\`python
import numpy as np

def logical_error_rate(p: float, p_th: float, d: int, c: float = 0.08) -> float:
    """Compute leading-order sub-threshold logical error probability."""
    exponent = (d + 1) / 2.0
    return c * np.power(p / p_th, exponent)
\`\`\`

## 4. Citation

\`\`\`bibtex
@article{rostova2026topological,
  title={Topological Protection and Threshold Scaling in Planar Surface Codes},
  author={Rostova, Elena},
  journal={AmplitudeLand Monograph Series},
  year={2026},
  doi={10.48550/ax.2026.0114}
}
\`\`\``,
  },
  {
    id: 'art-2',
    slug: 'vorticity-stretching-navier-stokes',
    title: 'Vorticity Stretching and Energy Cascades in Incompressible Turbulence',
    abstract:
      'An analytical decomposition of the three-dimensional enstrophy budget examining alignment between the vorticity vector and the intermediate strain-rate eigenvector.',
    category: 'Fluid Dynamics',
    tags: ['Navier-Stokes', 'Turbulence', 'Vorticity', 'PDEs'],
    status: 'published',
    author: 'Prof. Henrik Lindqvist',
    authorAffiliation: 'Nordic Center for Continuum Mechanics',
    publishedAt: '2026-11-04',
    updatedAt: '2026-11-09',
    doi: '10.48550/ax.2026.0098',
    coverImage: '/src/assets/images/article_navier_stokes_1795515079471.jpg',
    coverCaption: 'Plate 2. Streamline transition from laminar shear into coherent vortical filaments.',
    commitSha: '4f2a90c',
    commitMessage: 'cms(publish): add enstrophy alignment derivation and spectral table',
    body: `## 1. The Vorticity Transport Equation

Taking the curl of the incompressible Navier-Stokes momentum equation eliminates pressure and isolates the evolution of the vorticity vector $\\boldsymbol{\\omega} = \\nabla \\times \\mathbf{u}$:

$$\\frac{\\partial \\boldsymbol{\\omega}}{\\partial t} + (\\mathbf{u} \\cdot \\nabla)\\boldsymbol{\\omega} = (\\boldsymbol{\\omega} \\cdot \\nabla)\\mathbf{u} + \\nu \\nabla^2 \\boldsymbol{\\omega}$$

In two dimensions, the vortex-stretching term $(\\boldsymbol{\\omega} \\cdot \\nabla)\\mathbf{u}$ vanishes identically. In three dimensions, contracting with $\\boldsymbol{\\omega}$ produces the enstrophy production equation:

$$\\frac{1}{2} \\frac{D |\\boldsymbol{\\omega}|^2}{Dt} = \\omega_i S_{ij} \\omega_j - \\nu |\\nabla \\boldsymbol{\\omega}|^2$$

where $S_{ij} = \\frac{1}{2}(\\partial_i u_j + \\partial_j u_i)$ is the symmetric rate-of-strain tensor with ordered eigenvalues $\\lambda_1 \\ge \\lambda_2 \\ge \\lambda_3$ satisfying $\\lambda_1 + \\lambda_2 + \\lambda_3 = 0$.

## 2. Kolmogorov Inertial Scaling

Within the inertial range $\\eta \\ll r \\ll L$, dimensional homogeneity of the mean energy dissipation rate $\\varepsilon$ yields the classical $-5/3$ kinetic energy spectrum:

$$E(k) = C_K \\varepsilon^{2/3} k^{-5/3}, \\qquad \\eta = \\left(\\frac{\\nu^3}{\\varepsilon}\\right)^{1/4}$$

### Strain Eigenframe Alignment

Direct numerical simulations consistently demonstrate that $\\boldsymbol{\\omega}$ aligns preferentially with the intermediate eigenvector $\\mathbf{e}_2$ rather than the maximal stretching axis $\\mathbf{e}_1$, because positive $\\lambda_2 > 0$ sustains sheet-to-tube roll-up without destabilizing axial shear.`,
  },
  {
    id: 'art-3',
    slug: 'kan-extensions-monoidal-categories',
    title: 'Kan Extensions as Universal Approximations in Monoidal Categories',
    abstract:
      'A structural exposition showing how left and right Kan extensions unify sheafification, Fourier-like integral transforms, and enriched profunctor composition.',
    category: 'Mathematics',
    tags: ['Category Theory', 'Kan Extensions', 'Functors', 'Topology'],
    status: 'published',
    author: 'Dr. Kenji Takahashi',
    authorAffiliation: 'Kyoto Research Institute for Mathematical Sciences',
    publishedAt: '2026-10-27',
    updatedAt: '2026-11-01',
    doi: '10.48550/ax.2026.0081',
    coverImage: '/src/assets/images/article_category_theory_1795515079069.jpg',
    coverCaption: 'Plate 3. Alabaster and slate manifold model illustrating intersecting fiber bundles.',
    commitSha: '7d81c3e',
    commitMessage: 'cms(publish): verify Yoneda coend identity formatting',
    body: `## 1. Universal Property of Left Kan Extensions

Given functors $F: \\mathcal{C} \\to \\mathcal{E}$ and $K: \\mathcal{C} \\to \\mathcal{D}$, a left Kan extension of $F$ along $K$ is a functor $\\operatorname{Lan}_K F: \\mathcal{D} \\to \\mathcal{E}$ equipped with a natural transformation $\\eta: F \\Rightarrow (\\operatorname{Lan}_K F) \\circ K$ satisfying the universal bijection:

$$\\operatorname{Nat}(\\operatorname{Lan}_K F, G) \\cong \\operatorname{Nat}(F, G \\circ K)$$

for every functor $G: \\mathcal{D} \\to \\mathcal{E}$.

## 2. Pointwise Formula via Coends

When $\\mathcal{E}$ is cocomplete and $\\mathcal{C}$ is small, $\\operatorname{Lan}_K F$ can be computed pointwise as a coend weighted by the hom-bifunctor in $\\mathcal{D}$:

$$(\\operatorname{Lan}_K F)(d) \\cong \\int^{c \\in \\mathcal{C}} \\mathcal{D}(Kc, d) \\cdot Fc$$

### Adjunctions as Kan Extensions

Every adjunction $L \\dashv R$ arises as a Kan extension of the identity functor: specifically, $L \\cong \\operatorname{Lan}_R(\\mathrm{id}_{\\mathcal{C}})$ whenever the unit $\\eta: \\mathrm{id}_{\\mathcal{C}} \\Rightarrow RL$ is preserved by $L$.`,
  },
  {
    id: 'art-4',
    slug: 'stochastic-thermodynamics-landauer-bound',
    title: 'Finite-Time Corrections to Landauer Erasure in Overdamped Potentials',
    abstract:
      'Using optimal transport on Wasserstein-2 manifolds, we compute the exact minimum dissipated heat required to reset a symmetric double-well bit in finite duration tau.',
    category: 'Thermodynamics',
    tags: ['Landauer Limit', 'Optimal Transport', 'Stochastic Physics'],
    status: 'published',
    author: 'Dr. Clara Moreau',
    authorAffiliation: 'Ecole Normale Superieure, Paris',
    publishedAt: '2026-10-19',
    updatedAt: '2026-10-22',
    doi: '10.48550/ax.2026.0067',
    commitSha: '2a19d44',
    commitMessage: 'cms(publish): publish Wasserstein-2 dissipation proof',
    body: `## 1. The Thermodynamic Cost of Bit Erasure

Erasure of a single symmetric memory bit reduces Shannon entropy by $\\Delta S = -k_B \\ln 2$. In the quasistatic limit $\\tau \\to \\infty$, the average work obeys Landauer's principle:

$$\\langle W \\rangle \\ge k_B T \\ln 2$$

## 2. Finite-Time Optimal Transport Bound

For an overdamped Brownian particle with mobility $\\mu$ evolving from probability density $\\rho_0$ to $\\rho_\\tau$ over finite duration $\\tau$, the minimum excess dissipation is governed by the squared $L^2$-Wasserstein distance $\\mathcal{W}_2(\\rho_0, \\rho_\\tau)^2$:

$$\\langle W_{\\text{diss}} \\rangle_{\\min} = \\frac{\\mathcal{W}_2(\\rho_0, \\rho_\\tau)^2}{\\mu \\tau}$$

Combining both regimes gives the tight finite-time bound $\\langle W \\rangle \\ge k_B T \\ln 2 + \\frac{\\mathcal{W}_2^2}{\\mu \\tau}$, verified experimentally in feedback optical tweezers.`,
  },
  {
    id: 'art-5',
    slug: 'reaction-diffusion-turing-morphogenesis',
    title: 'Linear Stability Criteria for Two-Component Turing Morphogenesis',
    abstract:
      'Necessary and sufficient Jacobian conditions for diffusion-driven spatial symmetry breaking in coupled activator-inhibitor biochemical networks.',
    category: 'Computational Biology',
    tags: ['Turing Patterns', 'Morphogenesis', 'Dynamical Systems'],
    status: 'published',
    author: 'Dr. Samuel Okafor',
    authorAffiliation: 'Wellcome Centre for Quantitative Biology',
    publishedAt: '2026-10-08',
    updatedAt: '2026-10-12',
    doi: '10.48550/ax.2026.0052',
    commitSha: 'e03b771',
    commitMessage: 'cms(publish): add Turing instability dispersion relation',
    body: `## 1. Coupled Activator-Inhibitor PDEs

Consider an activator concentration $u(\\mathbf{x}, t)$ and a rapidly diffusing inhibitor $v(\\mathbf{x}, t)$ satisfying:

$$\\frac{\\partial u}{\\partial t} = f(u, v) + D_u \\nabla^2 u, \\qquad \\frac{\\partial v}{\\partial t} = g(u, v) + D_v \\nabla^2 v$$

Linearizing around a homogeneous steady state $(u^*, v^*)$ with wavenumber $k$ yields the dispersion matrix $J_k = J_0 - k^2 \\operatorname{diag}(D_u, D_v)$.

## 2. Diffusion-Driven Instability

For the steady state to remain stable when $k=0$ yet destabilize at finite $k > 0$, the diffusivity ratio $d = D_v / D_u$ must exceed the critical threshold:

$$d > d_c = \\frac{1}{f_u^2}\\left(f_u g_v - 2 f_v g_u + 2\\sqrt{-f_v g_u (f_u g_v - f_v g_u)}\\right)$$` ,
  },
  {
    id: 'art-6',
    slug: 'chern-simons-topological-field-notes',
    title: 'Working Notes: Framing Anomaly in Abelian Chern-Simons Theory',
    abstract:
      'Draft derivation of the gravitational framing phase under surgery on 3-manifolds and its relation to the Witten-Reshetikhin-Turaev invariant.',
    category: 'Mathematics',
    tags: ['TQFT', 'Chern-Simons', 'Manifolds'],
    status: 'draft',
    author: 'Dr. Kenji Takahashi',
    authorAffiliation: 'Kyoto Research Institute for Mathematical Sciences',
    publishedAt: '2026-11-22',
    updatedAt: '2026-11-23',
    commitSha: 'b51c09a',
    commitMessage: 'cms(draft): outline gravitational eta-invariant cancellation',
    body: `## 1. Classical Action and Level Quantization

On an oriented closed 3-manifold $M$, the Abelian $U(1)$ Chern-Simons action at integer level $k \\in \\mathbb{Z}$ takes the metric-independent form:

$$S_{\\text{CS}}[A] = \\frac{k}{4\\pi} \\int_M A \\wedge dA$$

Under a large gauge transformation, $S_{\\text{CS}}$ shifts by $2\\pi k \\mathbb{Z}$, ensuring that $\\exp(i S_{\\text{CS}})$ remains single-valued.

## 2. Pending Section: One-Loop Eta Invariant

TODO: Complete the Atiyah-Patodi-Singer signature theorem derivation before publishing to the main monograph feed.`,
  },
  {
    id: 'art-7',
    slug: 'adjoint-sensitivity-differentiable-solvers',
    title: 'Adjoint Sensitivity Analysis for Implicit Runge-Kutta Physics Solvers',
    abstract:
      'Draft benchmark comparing discrete reverse-mode checkpointing against continuous adjoint ODE integration for stiff Hamiltonian systems.',
    category: 'Fluid Dynamics',
    tags: ['Differentiable Physics', 'Adjoint Method', 'Numerical Analysis'],
    status: 'draft',
    author: 'Prof. Henrik Lindqvist',
    authorAffiliation: 'Nordic Center for Continuum Mechanics',
    publishedAt: '2026-11-21',
    updatedAt: '2026-11-23',
    commitSha: '8c12f6e',
    commitMessage: 'cms(draft): draft continuous adjoint Lagrange multiplier setup',
    body: `## 1. Continuous Adjoint Formulation

Given state trajectory $\\dot{\\mathbf{y}} = \\mathbf{f}(\\mathbf{y}, \\theta, t)$ and scalar loss $\\mathcal{L}(\\mathbf{y}(T))$, the adjoint state $\\boldsymbol{\\lambda}(t)$ satisfies the backward ODE:

$$\\frac{d\\boldsymbol{\\lambda}}{dt} = -\\left(\\frac{\\partial \\mathbf{f}}{\\partial \\mathbf{y}}\\right)^\\top \\boldsymbol{\\lambda}, \\qquad \\boldsymbol{\\lambda}(T) = \\nabla_{\\mathbf{y}} \\mathcal{L}(\\mathbf{y}(T))$$

Parameter gradients then follow from a single quadrature along the reverse trajectory without storing intermediate Newton iterates.`,
  },
];

export const SEED_ARTICLES: Article[] = RAW_SEEDS.map((raw) => ({
  ...raw,
  filePath: `content/posts/${raw.slug}.md`,
  readingTimeMinutes: estimateReadingTime(raw.body),
  equationCount: countLatexEquations(raw.body),
}));

export const SEED_COMMITS: CommitRecord[] = RAW_SEEDS.map((raw) => ({
  sha: raw.commitSha,
  message: raw.commitMessage,
  author: raw.author,
  timestamp: `${raw.updatedAt}T14:20:00Z`,
  filePath: `content/posts/${raw.slug}.md`,
  action: raw.status === 'published' ? 'publish' : 'create',
  syncedToGitHub: false,
}));
