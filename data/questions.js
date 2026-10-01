/**
 * MCQ question bank.
 * ---------------------------------------------------------------------------
 * Every question is tagged with a syllabus `itemId` OR a `match` object that
 * the loader resolves to the nearest matching item. The `solve` field holds a
 * beginner-friendly, exam-focused explanation containing:
 *     correct    why it is correct
 *     concept    short concept explanation
 *     wrong      why the chosen answer was wrong
 *     formula    relevant formula/concept (optional)
 *
 * This bank is intentionally SMALL and hand-written rather than large and
 * generated. It exists so the practice/mistake-bank/feedback loop is real, and
 * so the planner has genuine accuracy data to react to. Add more by copying an
 * entry — `id` must be unique.
 */

export const QUESTION_BANK = [
  /* ---------------- Mathematics ---------------- */
  {
    id: 'M001',
    itemId: 'MATH-U4-T1-S1',
    q: 'The equation of the straight line passing through the point (2, 3) with slope 2 is:',
    options: ['y = 2x + 1', 'y = 2x − 1', 'y = 2x − 3', 'y = 2x'],
    answer: 0,
    solve: {
      correct: 'y − 3 = 2(x − 2) simplifies to y = 2x − 1, which is option (a).',
      concept:
        'Point–slope form: y − y₁ = m(x − x₁). Substituting (2, 3) and m = 2 gives y − 3 = 2(x − 2).',
      wrong:
        'The other options either change the slope, or pass through the origin/different y-intercept, so they miss the given point (2, 3) or the slope.',
      formula: 'y − y₁ = m(x − x₁)',
    },
  },
  {
    id: 'M002',
    itemId: 'MATH-U4-T1-S1',
    q: 'The pair of straight lines joining the origin to the points of intersection of the curve x² + 4y² = 4 with the line x + y = 1 is given by:',
    options: [
      'x² + 4y² − (x + y)² = 0',
      '4x² + y² − (x + y)² = 0',
      'x² + 4y² + (x + y)² = 0',
      'x² − 4y² − (x + y)² = 0',
    ],
    answer: 0,
    solve: {
      correct:
        'The pair of lines joining the origin to the intersection of S₁ = 0 and S₂ = 0 is S₁ + λS₂ = 0. Here S₁ = x² + 4y² − 4 and S₂ = x + y − 1. Setting λ = −1 gives S₁ − S₂ = 0; the constant terms combine, producing the option-1 shape.',
      concept:
        'Lines from the origin to the intersection points of a conic and a line: replace the constant term of the conic using the line equation.',
      wrong:
        'Options 2, 3 and 4 change the relative weight of x² and y² or the sign of the subtracted square, so they describe different line pairs.',
      formula: 'Pair of lines through origin: S₁ − S₂ = 0 when the second curve is linear.',
    },
  },
  {
    id: 'M003',
    itemId: 'MATH-U2-T1-S1',
    q: 'If A = [[1, 2], [3, 4]], then |A| is:',
    options: ['−2', '2', '10', '−10'],
    answer: 0,
    solve: {
      correct: '|A| = (1)(4) − (2)(3) = 4 − 6 = −2.',
      concept:
        'For a 2×2 matrix the determinant is the product of the leading diagonal minus the product of the other diagonal.',
      wrong: 'Adding instead of subtracting the cross products gives 10, which is the wrong sign convention.',
      formula: '|a b; c d| = ad − bc',
    },
  },
  {
    id: 'M004',
    itemId: 'MATH-U5-T2-S1',
    q: 'The derivative of y = x³ − 3x with respect to x at x = 2 is:',
    options: ['6', '9', '3', '12'],
    answer: 1,
    solve: {
      correct: 'dy/dx = 3x² − 3. At x = 2: 3(4) − 3 = 12 − 3 = 9.',
      concept: 'Power rule: d/dx (xⁿ) = n·xⁿ⁻¹. Differentiate term by term, then substitute.',
      wrong: 'Forgetting to substitute x = 2 gives 3x² − 3 rather than 9; using 3x instead of 3x² gives the other distractors.',
      formula: "d/dx (xⁿ) = n·xⁿ⁻¹",
    },
  },
  {
    id: 'M005',
    itemId: 'MATH-U5-T1-S1',
    q: 'The value of lim(x→0) sin x / x is:',
    options: ['0', '1', 'x', '∞'],
    answer: 1,
    solve: {
      correct: 'The standard trigonometric limit lim(x→0) sin x / x = 1.',
      concept:
        'This is the fundamental trigonometric limit. L’Hôpital also works: lim cos x / 1 = 1.',
      wrong: 'Substituting x = 0 directly gives 0/0, which is an indeterminate form, not the answer.',
      formula: 'lim(x→0) sin x / x = 1',
    },
  },
  {
    id: 'M006',
    itemId: 'MATH-U7-T3-S1',
    q: 'If two events A and B are independent and P(A) = 0.4, P(B) = 0.5, then P(A ∩ B) is:',
    options: ['0.2', '0.9', '0.45', '0.1'],
    answer: 0,
    solve: {
      correct: 'For independent events, P(A ∩ B) = P(A)·P(B) = 0.4 × 0.5 = 0.2.',
      concept:
        'Independence means one event does not affect the other, so the joint probability is the product.',
      wrong: '0.9 is P(A ∪ B) = 0.4 + 0.5 − 0.2. Multiplying incorrectly or confusing union with intersection are the usual traps.',
      formula: 'P(A ∩ B) = P(A)P(B)  (independent)',
    },
  },
  {
    id: 'M007',
    itemId: 'MATH-U6-T2-S1',
    q: 'The scalar product of two vectors is zero. Then the vectors are:',
    options: [
      'Perpendicular',
      'Parallel',
      'Equal in magnitude',
      'Opposite in direction',
    ],
    answer: 0,
    solve: {
      correct:
        'a·b = |a||b|cosθ. If this is 0 (and both are non-zero) then cosθ = 0, so θ = 90° — the vectors are perpendicular.',
      concept: 'Zero dot product means zero component of b along a.',
      wrong: 'Parallel or opposite vectors give cosθ = ±1, so the dot product is ±|a||b|, not 0.',
      formula: 'a · b = |a||b|cosθ',
    },
  },
  {
    id: 'M008',
    itemId: 'MATH-U3-T1-S1',
    q: 'The general solution of sin x = 0 is:',
    options: ['x = nπ', 'x = (2n + 1)π/2', 'x = 2nπ', 'x = nπ/2'],
    answer: 0,
    solve: {
      correct: 'sin x = 0 when x is any integer multiple of π, i.e. x = nπ.',
      concept: 'sin x = 0 at 0, π, 2π, 3π … — the zeros of sine are integer multiples of π.',
      wrong: '(2n + 1)π/2 is the general solution of cos x = 0, not sin x = 0.',
      formula: 'sin x = 0 ⇒ x = nπ',
    },
  },
  {
    id: 'M009',
    itemId: 'MATH-U1-T2-S1',
    q: 'A function f is both injective and surjective. Then f is called:',
    options: ['Bijective', 'Injective only', 'Surjective only', 'Continuous'],
    answer: 0,
    solve: {
      correct: 'Injective + surjective = bijective. A bijection has an inverse function.',
      concept:
        'Injective: no two inputs give the same output. Surjective: every value in the codomain is hit. Both together = bijective.',
      wrong: 'Continuity is unrelated to injectivity/surjectivity; a continuous function need not be either.',
      formula: 'bijective ⇔ has an inverse',
    },
  },
  {
    id: 'M010',
    itemId: 'MATH-U5-T3-S1',
    q: '∫₀¹ x² dx equals:',
    options: ['1/2', '1/3', '1', '2/3'],
    answer: 1,
    solve: {
      correct: '∫₀¹ x² dx = [x³/3]₀¹ = 1/3.',
      concept: 'Power rule for definite integrals: ∫ xⁿ dx = xⁿ⁺¹/(n+1), then evaluate at the limits.',
      wrong: '1/2 is ∫₀¹ x dx, i.e. the case n = 1 — a very common off-by-one on the exponent.',
      formula: '∫ₐᵇ xⁿ dx = [xⁿ⁺¹/(n+1)]ₐᵇ',
    },
  },

  /* ---------------- Physics ---------------- */
  {
    id: 'P001',
    itemId: 'PHY-U1-T1-S2',
    q: 'A projectile is fired with speed u at 45° to the horizontal. Its time of flight (T = 2u sinθ / g) is:',
    options: ['√2 u / g', 'u / g', '2u / g', 'u√2 / 2g'],
    answer: 0,
    solve: {
      correct: 'T = 2u sin 45° / g = 2u(1/√2)/g = √2·u/g.',
      concept: 'Time of flight depends only on the vertical component of launch velocity.',
      wrong: 'Using cos θ instead of sin θ (or forgetting the factor 2) gives the other options.',
      formula: 'T = 2u sinθ / g',
    },
  },
  {
    id: 'P002',
    itemId: 'PHY-U5-T1-S1',
    q: 'Two charges q and −q are separated by distance 2a. The electric field at the midpoint is:',
    options: ['Zero', 'kq/a²', '2kq/a²', 'kq/2a²'],
    answer: 0,
    solve: {
      correct:
        'At the midpoint both charges are at distance a. The two field vectors have equal magnitude but opposite direction, so they cancel exactly.',
      concept: 'Field is a vector — symmetry makes it zero at the midpoint of a dipole.',
      wrong: 'Adding magnitudes instead of vectors gives the non-zero options, which is the classic trap.',
      formula: 'E = kq/r² (vector), superpose with signs',
    },
  },
  {
    id: 'P003',
    itemId: 'PHY-U1-T3-S1',
    q: 'A block of mass m slides down a smooth incline of angle θ. Its acceleration is:',
    options: ['g sin θ', 'g cos θ', 'g', 'g / sin θ'],
    answer: 0,
    solve: {
      correct: 'On a smooth incline the only force along the slope is mg sin θ, so a = g sin θ.',
      concept: 'Resolve weight into a component along the incline (mg sin θ) and into the plane (mg cos θ).',
      wrong: 'g cos θ is the normal reaction per unit mass, not the acceleration. Smooth means no friction, so the plane only redirects the force.',
      formula: 'a = g sin θ',
    },
  },
  {
    id: 'P004',
    itemId: 'PHY-U1-T4-S1',
    q: 'The frequency of a particle in simple harmonic motion is independent of:',
    options: ['Amplitude', 'Mass', 'Spring constant', 'Both mass and spring constant'],
    answer: 0,
    solve: {
      correct:
        'f = (1/2π)√(k/m). Amplitude does not appear, so the frequency is independent of amplitude.',
      concept: 'In SHM, energy is proportional to amplitude², but the frequency depends only on the restoring-force constant and the mass.',
      wrong: 'Changing m or k does change f, so options b, c and d are wrong.',
      formula: 'f = (1/2π)√(k/m)',
    },
  },
  {
    id: 'P005',
    itemId: 'PHY-U5-T2-S1',
    q: 'In a series combination of two resistors, the total resistance is:',
    options: [
      'R₁ + R₂',
      'R₁R₂ / (R₁ + R₂)',
      'R₁ − R₂',
      'R₁R₂',
    ],
    answer: 0,
    solve: {
      correct: 'Series: current is the same through both, so the potential drops add and R = R₁ + R₂.',
      concept: 'Series → resistances add. Parallel → conductances add (R = R₁R₂/(R₁+R₂)).',
      wrong: 'R₁R₂/(R₁+R₂) is the PARALLEL combination — the most commonly confused option.',
      formula: 'Series R = ΣRᵢ ; Parallel (1/R) = Σ(1/Rᵢ)',
    },
  },
  {
    id: 'P006',
    itemId: 'PHY-U2-T5-S1',
    q: 'The efficiency of a Carnot engine working between T₁ and T₂ is:',
    options: [
      '1 − T₂/T₁',
      'T₂/T₁',
      '1 − T₁/T₂',
      'T₁ − T₂',
    ],
    answer: 0,
    solve: {
      correct: 'η = 1 − T₂/T₁ where T₁ is the hot (source) and T₂ the cold (sink) temperature in kelvin.',
      concept: 'Carnot efficiency depends only on the two absolute temperatures, and no engine can exceed it.',
      wrong: 'Using °C instead of kelvin, or swapping the source and sink temperatures, gives the wrong options.',
      formula: 'η = 1 − T_sink / T_source (K)',
    },
  },
  {
    id: 'P007',
    itemId: 'PHY-U6-T2-S1',
    q: 'The photoelectric effect shows that the maximum kinetic energy of emitted photoelectrons depends on:',
    options: [
      'The frequency of incident light',
      'The intensity of incident light',
      'The amplitude of the light wave',
      'The wavelength of the incident light only through intensity',
    ],
    answer: 0,
    solve: {
      correct:
        'Einstein’s equation: K_max = hν − φ. Only the frequency ν and the work function φ appear — not the intensity.',
      concept: 'Intensity controls the NUMBER of photoelectrons, not their maximum energy.',
      wrong: 'Choosing intensity or amplitude confuses photon count with photon energy — this is the key experimental finding.',
      formula: 'K_max = hν − φ',
    },
  },
  {
    id: 'P008',
    itemId: 'PHY-U1-T5-S1',
    q: 'The SI unit of moment of inertia is:',
    options: ['kg·m²', 'kg·m', 'N·m', 'J'],
    answer: 0,
    solve: {
      correct: 'Moment of inertia = Σmr², so the unit is kg·m².',
      concept: 'Analogous to mass in translation and to the second moment of area in mechanics of materials.',
      wrong: 'kg·m is the unit of linear momentum; N·m is torque (and also energy).',
      formula: 'I = Σ mᵢrᵢ²',
    },
  },
  {
    id: 'P009',
    itemId: 'PHY-U3-T2-S1',
    q: 'Total internal reflection occurs when light travels from:',
    options: [
      'A denser to a rarer medium beyond the critical angle',
      'A rarer to a denser medium',
      'Any medium at any angle',
      'A denser medium normally',
    ],
    answer: 0,
    solve: {
      correct:
        'TIR needs a denser → rarer transition with angle of incidence > critical angle, so the refracted ray vanishes.',
      concept: 'Bending towards the normal happens entering a denser medium; past the critical angle there is no refracted ray at all.',
      wrong: 'Going rarer → denser always produces a refracted ray (except at normal incidence there is no critical-angle issue).',
      formula: 'sin C = n₂/n₁ (n₁ > n₂)',
    },
  },
  {
    id: 'P010',
    itemId: 'PHY-U1-T6-S1',
    q: "Poisson's ratio is the ratio of:",
    options: [
      'Lateral strain to longitudinal strain',
      'Longitudinal strain to lateral strain',
      'Stress to strain',
      'Compressive stress to tensile stress',
    ],
    answer: 0,
    solve: {
      correct: "ν = −(lateral strain)/(longitudinal strain) = −(Δr/r)/(ΔL/L).",
      concept: 'A stretched wire gets thinner, so the lateral strain is negative; the minus sign makes ν positive.',
      wrong: 'Stress/strain is Young’s modulus; inverting the ratio of strains gives 1/ν, not ν.',
      formula: 'ν = −(Δr/r)/(ΔL/L)',
    },
  },

  /* ---------------- Chemistry ---------------- */
  {
    id: 'C001',
    itemId: 'CHE-U1-T1-S1',
    q: 'The number of moles in 11 g of CO₂ (molar mass 44 g/mol) is:',
    options: ['0.25', '0.5', '2', '4'],
    answer: 0,
    solve: {
      correct: 'n = m/M = 11/44 = 0.25 mol.',
      concept: 'Mole = given mass ÷ molar mass. Always keep units consistent.',
      wrong: '44/11 = 4 inverts the ratio; 11/22 = 0.5 uses the molar mass of CO instead of CO₂.',
      formula: 'n = m / M',
    },
  },
  {
    id: 'C002',
    itemId: 'CHE-U1-T2-S1',
    q: 'At STP, 22.4 L of any ideal gas contains approximately:',
    options: ['1 mole', '2 moles', '0.5 mole', '11.2 moles'],
    answer: 0,
    solve: {
      correct: 'One mole of any ideal gas occupies 22.4 L at STP (0 °C, 1 atm).',
      concept: 'This follows from PV = nRT with the standard values; Avogadro’s law underpins it.',
      wrong: '11.2 L corresponds to half a mole; confusing the molar volume with the volume of 2 moles gives option (b).',
      formula: 'V = 22.4 L per mole at STP',
    },
  },
  {
    id: 'C003',
    itemId: 'CHE-U1-T3-S1',
    q: 'The maximum number of electrons that can occupy the 3d orbital is:',
    options: ['10', '6', '5', '2'],
    answer: 0,
    solve: {
      correct: 'A d subshell has 5 orbitals, each holding 2 electrons → 10 electrons.',
      concept: 's = 2, p = 6, d = 10, f = 14 electrons per subshell.',
      wrong: '5 is the number of orbitals, 6 is the capacity of a p subshell, 2 is the capacity of one orbital.',
      formula: '2(2l + 1): s→2, p→6, d→10, f→14',
    },
  },
  {
    id: 'C004',
    itemId: 'CHE-U1-T4-S1',
    q: 'In a redox reaction, the substance that loses electrons is:',
    options: ['Oxidised', 'Reduced', 'Neither', 'Both'],
    answer: 0,
    solve: {
      correct: 'Loss of electrons = oxidation. OIL RIG: Oxidation Is Loss, Reduction Is Gain.',
      concept: 'Oxidised species loses electrons and its oxidation number increases.',
      wrong: 'Gain of electrons is reduction — the exact opposite of the correct answer.',
      formula: 'OIL RIG',
    },
  },
  {
    id: 'C005',
    itemId: 'CHE-U3-T2-S1',
    q: 'The general formula for an alkyne is:',
    options: ['CₙH₂ₙ₋₂', 'CₙH₂ₙ₊₂', 'CₙH₂ₙ', 'CₙH₂ₙ₋₄'],
    answer: 0,
    solve: {
      correct: 'Alkynes contain one triple bond: CₙH₂ₙ₋₂ (acyclic).',
      concept: 'Alkane CₙH₂ₙ₊₂ → each double bond removes 2 H → alkene CₙH₂ₙ → each triple bond removes 4 H → alkyne CₙH₂ₙ₋₂.',
      wrong: 'CₙH₂ₙ₋₄ would be a diyne or a ring-containing compound.',
      formula: 'Acyclic: alkane CₙH₂ₙ₊₂, alkene CₙH₂ₙ, alkyne CₙH₂ₙ₋₂',
    },
  },
  {
    id: 'C006',
    itemId: 'CHE-U1-T7-S1',
    q: "Faraday's first law of electrolysis states that:",
    options: [
      'The mass deposited is proportional to the quantity of charge passed',
      'The mass deposited is proportional to the time only',
      'The mass deposited is independent of the electrolyte',
      'The mass deposited is proportional to the square of the current',
    ],
    answer: 0,
    solve: {
      correct: 'm ∝ Q = It. Mass deposited is proportional to the charge passed.',
      concept: 'The second law fixes the equivalent weight involved: m = (E·It)/F.',
      wrong: 'Time alone is insufficient because intensity also matters through Q = It.',
      formula: 'm = (E · I · t) / F',
    },
  },
  {
    id: 'C007',
    itemId: 'CHE-U1-T5-S1',
    q: 'A solution whose pH is 3 is how many times more acidic than one of pH 5?',
    options: ['100', '10', '2', '1000'],
    answer: 0,
    solve: {
      correct: '[H⁺] = 10⁻ᵖᴴ, so a 2-unit pH difference is a factor of 10² = 100.',
      concept: 'The pH scale is logarithmic: every unit changes [H⁺] tenfold.',
      wrong: 'Assuming a linear relationship gives 2, which is the classic mistake.',
      formula: '[H⁺] = 10⁻ᵖᴴ',
    },
  },
  {
    id: 'C008',
    itemId: 'CHE-U2-T2-S1',
    q: 'Copper and silver are placed in the same group of the periodic table because they are:',
    options: [
      'Transition metals with similar properties',
      'Both gases',
      'Both non-metals',
      'Both isotopes of the same element',
    ],
    answer: 0,
    solve: {
      correct:
        'Cu and Ag are coinage metals in the d-block, so they share transition-metal properties.',
      concept: 'Similar electron configurations in the d subshell produce similar chemistry.',
      wrong: 'Both are solid metals at room temperature; option (b) and (c) are simply false.',
      formula: 'd-block, Group 11',
    },
  },
  {
    id: 'C009',
    itemId: 'CHE-U1-T8-S1',
    q: 'The rate of a reaction is independent of the concentration of the reactants when it is:',
    options: ['Zero order', 'First order', 'Second order', 'Third order'],
    answer: 0,
    solve: {
      correct: 'For a zero-order reaction, rate = k, independent of concentration.',
      concept: 'Order tells you the exponent of concentration in the rate law, not directly the molecularity.',
      wrong: 'First order depends linearly on concentration, so it is not independent.',
      formula: 'rate = k[A]ⁿ ; n = 0 ⇒ zero order',
    },
  },
  {
    id: 'C010',
    itemId: 'CHE-U3-T1-S1',
    q: 'Isomerism in which compounds have the same molecular formula but different carbon skeletons is called:',
    options: [
      'Chain isomerism (skeletal)',
      'Position isomerism',
      'Functional isomerism',
      'Metamerism',
    ],
    answer: 0,
    solve: {
      correct: 'Different carbon skeletons with the same formula = chain (skeletal) isomerism.',
      concept: 'Chain: different skeleton. Position: substituent at a different position. Functional: different functional group.',
      wrong: 'Moving a group without changing the skeleton or the functional group gives position isomerism.',
      formula: 'Chain: different skeleton',
    },
  },

  /* ---------------- English ---------------- */
  {
    id: 'E001',
    itemId: 'ENG-U1-T1-S1',
    q: 'Choose the correct form: "Neither the teacher nor the students ___ present."',
    options: ['was', 'were', 'is', 'have been'],
    answer: 1,
    solve: {
      correct:
        'With "neither … nor", the verb agrees with the nearer subject. "Students" is plural, so "were" is correct.',
      concept: 'Proximity rule: neither…nor / either…or take the verb from the subject closest to it.',
      wrong: '"was" agrees with "teacher" (the farther subject) — the most frequent error in this construction.',
      formula: 'neither … nor / either … or → verb agrees with the nearer subject',
    },
  },
  {
    id: 'E002',
    itemId: 'ENG-U1-T1-S2',
    q: 'Choose the correct tag: "She has finished her work, ___?"',
    options: ["hasn't she?", "isn't she?", "didn't she?", "doesn't she?"],
    answer: 0,
    solve: {
      correct: 'A statement in the present perfect takes a present-perfect tag: "hasn’t she?".',
      concept: 'The tag matches the tense and auxiliary of the main clause.',
      wrong: '"isn’t she?" and "doesn’t she?" are present simple tags; "didn’t she?" is past simple.',
      formula: 'Tag = auxiliary + subject + (n’t)',
    },
  },
  {
    id: 'E003',
    itemId: 'ENG-U2-T5-S1',
    q: 'The antonym of "scarce" is:',
    options: ['Abundant', 'Rare', 'Limited', 'Meagre'],
    answer: 0,
    solve: {
      correct: '"Scarce" means insufficient in quantity, so its antonym is "abundant" (plentiful).',
      concept: 'Antonyms are often pairs of Latin prefixes: scarce/abundant, few/many.',
      wrong: '"Rare", "limited" and "meagre" are all near-synonyms of scarce, not antonyms.',
      formula: 'scarce ↔ abundant',
    },
  },
  {
    id: 'E004',
    itemId: 'ENG-U2-T2-S1',
    q: 'Choose the correct active form: "The letter ___ by the postman yesterday."',
    options: ['was delivered', 'delivered', 'has been delivered', 'is delivered'],
    answer: 1,
    solve: {
      correct:
        'Passive "was delivered" reversed to active is "The postman delivered the letter". With the object removed, the slot holds the past participle "delivered" with the agent as subject.',
      concept: 'When a test gives only the passive with a by-phrase, the active verb form in the gap is the past participle if the agent is the implied subject.',
      wrong: 'Keeping a passive auxiliary where the sentence already names the doer in the by-phrase is the typical error.',
      formula: 'Active: S + V + O ; Passive: S + be + V3 (+ by …)',
    },
  },
  {
    id: 'E005',
    itemId: 'ENG-U4-T1-S1',
    q: '"Reading between the lines" in a comprehension passage means:',
    options: [
      'Drawing an inference not stated directly',
      'Reading the lines aloud',
      'Skipping difficult lines',
      'Memorising the passage',
    ],
    answer: 0,
    solve: {
      correct:
        'It means inferring the writer’s unstated meaning from clues in the text — exactly what the IOE comprehension section tests.',
      concept: 'Inference > stated detail. Always look for the "because / therefore" logic in the passage.',
      wrong: 'The other options are reading habits, not comprehension strategies.',
      formula: 'Inference = conclusion supported by the passage but not stated',
    },
  },
  {
    id: 'E006',
    itemId: 'ENG-U2-T3-S1',
    q: '"Having finished the work, he went out." Here "having finished" is:',
    options: ['A perfect participle', 'A gerund', 'An infinitive', 'A modal verb'],
    answer: 0,
    solve: {
      correct: '"Having + V3" is the perfect participle (also called the present participle perfect).',
      concept: 'Verbals: infinitive (to + V1), gerund (V1 + ing), present participle (V1 + ing), perfect participle (having + V3).',
      wrong: 'A gerund acts as a noun; "having finished the work" here shows the action completed before "went out".',
      formula: 'Perfect participle = having + V3',
    },
  },
  {
    id: 'E007',
    itemId: 'ENG-U2-T4-S1',
    q: 'Choose the correct preposition: "She is good ___ mathematics."',
    options: ['at', 'in', 'on', 'with'],
    answer: 0,
    solve: {
      correct: 'The fixed collocation is "good at" for a skill or subject.',
      concept: 'Common exam collocations: good at, weak in, interested in, fond of, afraid of.',
      wrong: '"good in" and "good on" are not standard; "good with" applies to people or tools, not subjects.',
      formula: 'good at + noun/-ing',
    },
  },
  {
    id: 'E008',
    itemId: 'ENG-U1-T2-S1',
    q: 'Report the direct speech correctly: He said, "I am busy."',
    options: [
      'He said that he was busy.',
      'He said that I am busy.',
      'He says that he is busy.',
      'He said that he is busy.',
    ],
    answer: 0,
    solve: {
      correct: 'In reported speech the pronoun changes to the speaker’s and the tense shifts back one step: am → was.',
      concept: 'Direct → indirect: backdate the tense and change the person of pronouns and time/place words.',
      wrong: 'Keeping "is" fails the backshifting rule required for a past reporting verb.',
      formula: 'am/is/are → was/were ; will → would ; can → could',
    },
  },
  {
    id: 'E009',
    itemId: 'ENG-U3-T1-S1',
    q: 'The number of phonemes in the English language is approximately:',
    options: ['44', '26', '12', '124'],
    answer: 0,
    solve: {
      correct: 'Standard analyses of English recognise about 44 phonemes (24 vowels and 20 consonants).',
      concept: 'Phoneme = smallest unit of sound that changes meaning. English letters ≠ phonemes.',
      wrong: '26 is the number of English LETTERS, not phonemes. Phonemic symbols are the IPA.',
      formula: 'English ≈ 24 vowel + 20 consonant phonemes',
    },
  },
  {
    id: 'E010',
    itemId: 'ENG-U2-T6-S1',
    q: 'Choose the best discourse marker: "The road was icy. ___, the bus skidded."',
    options: ['Therefore', 'However', 'Meanwhile', 'Besides'],
    answer: 1,
    solve: {
      correct: '"However" signals a contrast between the cause (icy road) and the unexpected result (skidding).',
      concept: 'Choose the marker that matches the logical relation: contrast → however/however, cause → therefore/because, time → meanwhile.',
      wrong: '"Therefore" states a result, not a contrast; "meanwhile" marks simultaneous time.',
      formula: 'Contrast: however, nevertheless, on the other hand',
    },
  },
];

/* ------------------------------------------------------------------ */
/* Loader                                                              */
/* ------------------------------------------------------------------ */

let CACHE = null;

function normalise(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const STOP = new Set([
  'and', 'or', 'of', 'the', 'a', 'an', 'in', 'on', 'for', 'to', 'with', 'by',
  'from', 'at', 'is', 'are', 'its', 'it', 'their', 'their', 'only', 'as', 'its',
]);

function tokens(s) {
  return normalise(s).split(' ').filter((t) => t && !STOP.has(t));
}

/**
 * Attach questions to syllabus items.
 * Resolution order:
 *   1. explicit itemId  -> used as-is
 *   2. score every item by token overlap with the question's `key`
 *      (the question stem); best match above threshold wins
 *   3. otherwise the question is marked `unmapped` and reported by the
 *      completeness validator, so a bad question is visible rather than silent.
 */
export function buildQuestionIndex(index) {
  if (CACHE && CACHE.syllabusVersion === index.byId.size) return CACHE;
  const byItem = new Map();
  const items = Array.from(index.byId.values());

  for (const q of QUESTION_BANK) {
    let itemId = q.itemId && index.byId.has(q.itemId) ? q.itemId : null;
    if (!itemId) {
      const key = tokens(`${q.q} ${q.key || ''}`);
      let best = null;
      let bestScore = 0;
      for (const it of items) {
        const t = new Set(tokens(`${it.title} ${it.topicTitle}`));
        let hit = 0;
        for (const k of key) if (t.has(k)) hit++;
        const score = hit / Math.max(1, t.size);
        if (score > bestScore) { bestScore = score; best = it; }
      }
      if (best && bestScore >= 0.2) itemId = best.id;
    }
    const entry = { ...q, itemId, unmapped: !itemId };
    if (itemId) {
      if (!byItem.has(itemId)) byItem.set(itemId, []);
      byItem.get(itemId).push(entry);
    }
  }
  CACHE = { byItem, syllabusVersion: index.byId.size };
  return CACHE;
}

export function questionsForItems(index, itemIds) {
  const { byItem } = buildQuestionIndex(index);
  const out = [];
  for (const id of itemIds) {
    if (byItem.has(id)) out.push(...byItem.get(id));
  }
  return out;
}

export function questionsForUnit(index, unitId) {
  const { byItem } = buildQuestionIndex(index);
  const out = [];
  for (const [itemId, qs] of byItem) {
    const it = index.byId.get(itemId);
    if (it && it.unitId === unitId) out.push(...qs);
  }
  return out;
}

export function allMappedQuestions(index) {
  const { byItem } = buildQuestionIndex(index);
  const out = [];
  for (const [, qs] of byItem) out.push(...qs);
  return out;
}

export function questionById(id) {
  return QUESTION_BANK.find((q) => q.id === id) || null;
}

export function resetQuestionCache() {
  CACHE = null;
}
