/**
 * IOE B.E./B.Arch. Entrance Syllabus — DATABASE FILE
 * =================================================
 * This is the single source of truth for the whole application.
 * The planner, dashboard, calendar and validators all read from here.
 * To update the syllabus later, edit ONLY this file and bump `version`.
 *
 * SOURCE OF TRUTH
 * ---------------
 * Official:  Institute of Engineering (IOE), Pulchowk — Entrance Examination
 *            Board. Syllabus notice published on https://entrance.ioe.edu.np
 *            ("Entrance Syllabus 2083").
 * Cross-check: the "Detail Syllabus of B.E./B.Arch. Entrance Examination"
 *            document issued for 2080 (PDF mirrored at pea.edu.np), which uses
 *            the identical Subject -> Unit structure.
 *
 * APPLICATION ASSUMPTION (clearly separated, see ASSUMPTIONS.md):
 * The 2083 entrance is described by the student as taking place around
 * Baisakh 2084, while the syllabus deadline is the end of Chaitra 2083 B.S.
 * The app therefore treats the *deadline* as the authoritative planning date
 * and the *exam date* as a separately editable setting. Neither is hard-coded
 * into the engine.
 *
 * EXAM PATTERN (as published for the 2080/2083 pattern — VERIFY against the
 * current official detail notice; the app surfaces this as informational only
 * and never uses it for scheduling):
 *   Total 140 marks, 2 hours, 60x1 mark + 40x2 marks, 10% negative marking.
 *   Mathematics 50 | Physics 40 | Chemistry 30 | English 20
 *   Non-programmable calculators permitted. All questions in English.
 *
 * HOW A TOPIC IS TIMED
 * --------------------
 * `size` is a 1-5 rough complexity weight (1 = recall, 5 = heavy derivation).
 * The planner converts it to minutes with: minutes = SUBJECT_BASE * size
 * SUBJECT_BASE is the "minutes per size point" for that subject, defined below.
 * `estMin` may be set on any topic to override the formula entirely.
 * If neither is available the engine falls back to DEFAULT_ITEM_MINUTES
 * (edge case #14: "chapter has no estimated duration yet").
 */

export const SYLLABUS_VERSION = 'ioe-be-barch-2083-r1';

export const SYLLABUS_META = {
  id: 'ioe-be-barch-2083',
  label: 'IOE B.E./B.Arch. Entrance Syllabus 2083',
  version: SYLLABUS_VERSION,
  authority: 'Institute of Engineering (IOE), Pulchowk — Entrance Examination Board',
  sourceUrl: 'https://entrance.ioe.edu.np',
  crossCheckUrl:
    'https://www.pea.edu.np/content/uploads/2024/05/IOE-Entrance-New-Syllabus.pdf',
  totalMarks: 140,
  durationMinutes: 120,
  negativeMarkingPct: 10,
  note: 'Subject/unit structure cross-checked against the 2080 detail syllabus. Re-verify the mark split and any 2083 revisions against the official detail notice.',
};

/** Minutes per "size point" for each subject. Tunable in Settings. */
export const SUBJECT_BASE_MINUTES = {
  MATH: 26,
  PHY: 24,
  CHE: 22,
  ENG: 16,
};

export const DEFAULT_ITEM_MINUTES = 45;

export const SUBJECTS = [
  {
    id: 'MATH',
    name: 'Mathematics',
    short: 'Math',
    marks: 50,
    color: '#6366f1',
    units: [
      {
        n: 1,
        title: 'Set, Logic and Functions',
        topics: [
          {
            title:
              'Set, real number system, intervals, absolute value, logic, connectives, laws of logic',
            size: 3,
          },
          {
            title:
              'Function, types of functions — injective, surjective, bijective, algebraic, trigonometric, exponential and logarithmic; inverse of function, composite functions',
            size: 3,
          },
        ],
      },
      {
        n: 2,
        title: 'Algebra',
        topics: [
          { title: 'Matrices and determinants, types and properties, inverse of a matrix', size: 4 },
          { title: 'Complex numbers and polynomial equations', size: 3 },
          { title: 'Sequence and series, permutation and combination', size: 4 },
          { title: 'Binomial theorem, exponential and logarithmic series', size: 3 },
        ],
      },
      {
        n: 3,
        title: 'Trigonometry',
        topics: [
          { title: 'Trigonometric equations and general values', size: 3 },
          { title: 'Inverse trigonometric functions, principal value', size: 2 },
          {
            title:
              'Properties of triangles, in-centre, ortho-centre and circum-centre, solution of triangles',
            size: 4,
          },
        ],
      },
      {
        n: 4,
        title: 'Coordinate Geometry',
        topics: [
          { title: 'Straight lines, pair of lines', size: 3 },
          { title: 'Circles, equations of circle in different forms, tangent and normal', size: 4 },
          {
            title:
              'Conic sections: parabola, ellipse and hyperbola, standard equations and simple properties',
            size: 5,
          },
          { title: 'Coordinates in space, plane and its equation', size: 3 },
        ],
      },
      {
        n: 5,
        title: 'Calculus',
        topics: [
          { title: "Limit and continuity of functions, indeterminate forms, L'Hospital's rule", size: 4 },
          {
            title:
              'Derivatives, rules of derivatives, geometrical & physical meanings, higher order derivatives; applications: tangent and normal, rate of change, maxima and minima',
            size: 5,
          },
          {
            title:
              'Integration, linear properties, rules of integration, standard integrals, definite integral; applications: area under a curve and area between two curves',
            size: 5,
          },
          {
            title:
              'Differential equations: definition, order and degree; first order and first degree: variable separable, homogeneous, linear and exact equations, integrating factor',
            size: 5,
          },
        ],
      },
      {
        n: 6,
        title: 'Vectors and their Products',
        topics: [
          {
            title:
              'Vectors in plane and space, algebra of vectors, linear combination of vectors, linearly dependent and independent set of vectors',
            size: 3,
          },
          {
            title:
              'Product of two vectors, scalar and vector product of two vectors, scalar triple product',
            size: 4,
          },
        ],
      },
      {
        n: 7,
        title: 'Statistics and Probability',
        topics: [
          { title: 'Measures of location and measures of dispersion', size: 2 },
          { title: 'Correlation and regression', size: 3 },
          {
            title:
              "Basic terms of probability, conditional and compound probability, additive and multiplicative rules, Bayes' theorem, binomial distribution",
            size: 4,
          },
        ],
      },
    ],
  },

  {
    id: 'PHY',
    name: 'Physics',
    short: 'Physics',
    marks: 40,
    color: '#0ea5e9',
    units: [
      {
        n: 1,
        title: 'Mechanics',
        topics: [
          {
            title:
              'Physical quantities, vector and kinematics: dimensions, resolution and polygon laws of vector, vector algebra, equations of motion, projectile motion, relative motion',
            size: 4,
          },
          {
            title:
              "Newton's laws of motion and friction: conservation of linear momentum, applications in equilibrium and non-equilibrium, laws of solid friction and verification",
            size: 4,
          },
          {
            title:
              'Work, energy and power: work–energy theorem, kinetic and potential energy, conservation of energy, conservative and non-conservative forces, elastic and inelastic collisions',
            size: 4,
          },
          {
            title:
              'Circular motion, gravitation and SHM: centripetal force, conical pendulum, banking of track, gravitational potential, variation of g, motion of satellite, rocket launch technology, energy in SHM, spring–mass system, simple pendulum, damped and forced oscillation, resonance',
            size: 5,
          },
          {
            title:
              'Rotational dynamics: moment of inertia, radius of gyration, rotational KE, center of gravity and center of mass, torque, conservation of angular momentum',
            size: 4,
          },
          {
            title:
              "Elasticity: Hooke's law, Young modulus, bulk modulus, modulus of rigidity, Poisson's ratio, elastic energy",
            size: 3,
          },
          {
            title:
              "Fluid mechanics: buoyancy, flotation, Archimedes' principle, surface tension, capillarity, viscosity, Newton, Stokes and Poiseuille's formula, Reynolds number, continuity equation, Bernoulli's equation",
            size: 5,
          },
        ],
      },
      {
        n: 2,
        title: 'Heat and Thermodynamics',
        topics: [
          {
            title:
              'Temperature and quantity of heat: thermal equilibrium, specific heat, latent heat, method of mixture, Newton’s law of cooling, triple point',
            size: 3,
          },
          { title: 'Thermal expansion: expansion of solid & liquid, measurement and applications', size: 2 },
          {
            title:
              'Transfer of heat: conduction, convection, radiation, thermal conductivity, black body radiation, Stefan–Boltzmann law',
            size: 3,
          },
          {
            title:
              'Thermal properties of matter: molecular properties, kinetic theory of gases, heat capacities of gases and solids',
            size: 3,
          },
          {
            title:
              'Laws of thermodynamics: first law, heat and work, relation of specific heats, thermodynamic processes, second law, heat engine, efficiency, Carnot cycle, Otto cycle, Diesel cycle, refrigerator, entropy',
            size: 5,
          },
        ],
      },
      {
        n: 3,
        title: 'Geometric and Physical Optics',
        topics: [
          { title: 'Reflection: plane and curved mirror, mirror formula', size: 2 },
          {
            title:
              'Refraction: plane surface, critical angle, total internal reflection, lateral shift, prism, minimum deviation, lenses, lens formula, lens maker’s formula, combination of lenses, optical fiber',
            size: 4,
          },
          {
            title:
              'Dispersion: spectrum, dispersive power, chromatic aberration, achromatism, spherical aberration, scattering of light',
            size: 3,
          },
          { title: 'Nature and propagation of light: Huygens’ principle, velocity of light', size: 2 },
          { title: "Interference: coherent sources, Young's double slit experiment", size: 3 },
          {
            title:
              'Diffraction: Fraunhofer diffraction, diffraction grating, resolving power',
            size: 3,
          },
          { title: "Polarization: Brewster's law, transverse nature of light, polaroid", size: 2 },
        ],
      },
      {
        n: 4,
        title: 'Waves and Sound',
        topics: [
          { title: 'Wave motion: travelling and stationary wave', size: 3 },
          {
            title:
              'Mechanical waves: velocity of sound in solid, gas and liquid; effect of temperature, pressure, humidity',
            size: 3,
          },
          {
            title:
              'Waves in pipes and string: closed and open pipes, resonance, resonance tube, laws of vibration of fixed string',
            size: 4,
          },
          {
            title:
              'Acoustic phenomena: pressure amplitude, intensity level, quality and pitch, ultrasonic and infrasonic, Doppler’s effect',
            size: 3,
          },
        ],
      },
      {
        n: 5,
        title: 'Electricity & Magnetism',
        topics: [
          {
            title:
              "Electrostatics: Coulomb's law, electric field and Gauss law, potential and potential gradient, capacitors and combinations, dielectrics, energy stored, polarization and displacement",
            size: 5,
          },
          {
            title:
              "DC circuits: Ohm's law, resistivity and conductivity, work and power, galvanometer and ohm meter, internal resistance, Joule's law, Kirchhoff's law and applications",
            size: 4,
          },
          {
            title:
              'Thermoelectric effect: Seebeck effect, thermocouples, Peltier effect, thermopile, Thomson effect',
            size: 2,
          },
          {
            title:
              "Magnetic effect: force on a conductor and charge, torque, Hall's effect, Biot–Savart's law, Ampere's law, force between parallel conductors",
            size: 5,
          },
          {
            title:
              'Magnetic properties of matter: earth magnetism, magnetic materials, permeability, susceptibility, hysteresis',
            size: 3,
          },
          {
            title:
              "Electromagnetic induction: Faraday's law, induced emf, AC generators, self and mutual induction, energy stored by inductor, transformer",
            size: 4,
          },
          {
            title:
              'Alternating currents: RMS value, phasor diagrams of C, L and R, quality factor, power factor',
            size: 3,
          },
        ],
      },
      {
        n: 6,
        title: 'Modern Physics',
        topics: [
          { title: "Electrons: Millikan's experiment, cathode rays, specific charge", size: 3 },
          {
            title:
              "Photons & quantization of energy: photoelectric effect, Planck's constant, Bohr's theory, spectral series, De Broglie theory, uncertainty principle, X-ray and Bragg's law, laser",
            size: 5,
          },
          {
            title:
              'Solids & semiconductor devices: intrinsic and extrinsic semiconductors, P–N junction, rectification, Zener diode, transistor, logic gates',
            size: 4,
          },
          {
            title:
              'Radioactivity & nuclear reaction: atomic mass, isotopes, nuclear density, Einstein’s mass–energy relation, mass defect, fission & fusion, law of radioactive disintegration, carbon dating, health hazard',
            size: 4,
          },
          {
            title:
              'Recent trends: particle physics (quarks, leptons, baryons, mesons, Higgs boson); universe (Big Bang, Hubble’s law, dark matter, gravitational wave, black hole); seismology; telecommunication (radio, TV, mobile, GPS, remote sensing); environment (energy crisis, pollution, ozone layer); new technology (nano-technology, superconductors)',
            size: 3,
          },
        ],
      },
    ],
  },

  {
    id: 'CHE',
    name: 'Chemistry',
    short: 'Chem',
    marks: 30,
    color: '#10b981',
    units: [
      {
        n: 1,
        title: 'Physical Chemistry',
        topics: [
          {
            title:
              "Chemical arithmetic: Dalton's atomic theory and laws of stoichiometry, atomic and molecular mass, empirical molecular formula and limiting reactants, Avogadro's hypothesis and equivalent masses",
            size: 4,
          },
          { title: 'State of matter: gaseous, liquid and solid states', size: 4 },
          { title: 'Atomic structure and periodic classification of elements', size: 4 },
          { title: 'Oxidation, reduction and equilibrium', size: 3 },
          { title: 'Volumetric analysis', size: 3 },
          { title: 'Ionic equilibrium, acid, base and salt', size: 4 },
          { title: 'Electrochemistry', size: 4 },
          {
            title:
              'Energy of chemical reaction, chemical kinetics, chemical bonding and shape of molecules',
            size: 5,
          },
        ],
      },
      {
        n: 2,
        title: 'Inorganic Chemistry',
        topics: [
          {
            title:
              'Non-metal: hydrogen, oxygen, ozone, water, nitrogen and its compounds, halogen, carbon, phosphorus, sulphur, noble gas and environment pollution',
            size: 5,
          },
          {
            title:
              'Metals: metallurgical principle, alkali metals, alkaline earth metals, coinage metals: copper, silver, gold',
            size: 4,
          },
          { title: 'Extraction of metal: zinc and mercury, iron compound', size: 3 },
        ],
      },
      {
        n: 3,
        title: 'Organic Chemistry',
        topics: [
          {
            title:
              'Introduction: fundamental principles, purification of organic compounds, nomenclature, structure isomerism and idea of reaction mechanism',
            size: 3,
          },
          {
            title: 'Hydrocarbons: alkanes, alkenes and alkynes, aromatic hydrocarbons',
            size: 4,
          },
          { title: 'Haloalkanes and haloarenes', size: 3 },
          { title: 'Alcohols, phenols and ethers', size: 4 },
          {
            title:
              'Aldehydes, ketones, carboxylic acid and derivatives, aliphatic and aromatic',
            size: 5,
          },
          { title: 'Nitro compounds and amines: aromatic and aliphatic', size: 4 },
        ],
      },
    ],
  },

  {
    id: 'ENG',
    name: 'English',
    short: 'English',
    marks: 20,
    color: '#f59e0b',
    units: [
      {
        n: 1,
        title: 'Grammar I',
        topics: [
          {
            title:
              'Sequence of tense, modals, conditions, concord/agreement (subject–verb agreement), tag questions',
            size: 2,
          },
          { title: 'Direct and indirect speech', size: 2 },
          { title: 'Kinds of sentences and transformation of sentences', size: 2 },
        ],
      },
      {
        n: 2,
        title: 'Grammar II',
        topics: [
          {
            title:
              'Basic grammatical patterns/structures (articles and possessives, pronouns, adjectives, adverbs), conditional sentences',
            size: 2,
          },
          { title: 'Parts of speech, active and passive voice', size: 2 },
          { title: 'Verbals: infinitives, gerund and participles', size: 2 },
          { title: 'Punctuation and use of prepositions', size: 2 },
          {
            title:
              'Vocabulary (synonyms and antonyms, homonyms, homophones, word building, suffixes and prefixes, meaning of words in context)',
            size: 3,
          },
          { title: 'Idiomatic expressions (idioms and phrases)', size: 2 },
          { title: 'Cohesive devices, coherence, discourse markers', size: 2 },
        ],
      },
      {
        n: 3,
        title: 'Phonetics',
        topics: [
          { title: 'Phonemes (vowels/consonants), phonemic symbols', size: 2 },
          { title: 'Syllables and stress (word/sentence), intonation', size: 2 },
        ],
      },
      {
        n: 4,
        title: 'Comprehension',
        topics: [
          {
            title:
              'Comprehension of reading passages on a variety of topics and styles with special reference to General English and Technical English (contents/ideas, reading between the lines, contextual clues, reconstruction (rewording))',
            size: 4,
          },
        ],
      },
    ],
  },
];

/**
 * B.Arch-only content. The IOE exam is a combined B.E./B.Arch paper, so
 * B.Arch candidates use a reduced Mathematics + an Architecture block instead.
 * These are tracked so the completeness validator can account for them, but
 * they are excluded from scheduling unless `settings.includeBArch` is on.
 */
export const BARCH_ONLY = [
  {
    id: 'ARCH',
    name: 'Architecture (B.Arch only)',
    // null, not 0: the B.Arch paper does carry marks for this subject, but the
    // split is not stated in any source I could cite. A 0 here would be read as
    // "worth nothing"; null renders as "not verified" and never feeds a
    // projection. Planning weight is neutral (1.0) via subjectWeight fallback.
    marks: null,
    color: '#8b5cf6',
    note: 'Included in the IOE B.Arch entrance paper. Off by default.',
    units: [
      {
        n: 1,
        title: 'History of Architecture',
        topics: [
          { title: 'Historical monument and building of Nepal and World', size: 3 },
          { title: 'Architectural Conservation of Nepal', size: 3 },
        ],
      },
      {
        n: 2,
        title: 'Contemporary Architecture of Nepal',
        topics: [
          { title: 'Contemporary Architectural practices of Nepal', size: 3 },
          { title: 'Problem and way out for future in Nepal', size: 3 },
        ],
      },
      {
        n: 3,
        title: 'Building Services',
        topics: [
          { title: 'Electrical Service – Artificial lighting system, Solar Lighting', size: 2 },
          {
            title:
              'Mechanical Service – HVAC, Lift, Escalator, Solar water heating, etc.',
            size: 2,
          },
          { title: 'Water Supply and Sanitation', size: 2 },
        ],
      },
      {
        n: 4,
        title: 'Planning',
        topics: [
          { title: 'History of Planning – Ancient Town and Settlement', size: 3 },
          { title: 'Urban problems in towns of Nepal', size: 3 },
          { title: 'Urban Environment and Urbanization in Nepal', size: 3 },
        ],
      },
      {
        n: 5,
        title: 'Water Resources Engineering',
        topics: [
          {
            title:
              'Physical properties of fluid, fluid pressure, stability of floating bodies, fluid kinematics, classification of fluid flow, dynamics of flows, Euler’s equation, Bernoulli’s equation, Navier–Stokes equation, boundary layer theory, momentum equation',
            size: 5,
          },
          {
            title:
              'Open channel flow, uniform and non-uniform flow, energy & momentum principle, flow in mobile boundary channel, flow over notches & weirs, gradually varied flow, hydraulic jump and its analysis, similitude and physical modelling, physical hydrology',
            size: 5,
          },
        ],
      },
      {
        n: 6,
        title: 'Transportation Engineering',
        topics: [{ title: 'Transportation Engineering (planning, pavement, traffic)', size: 4 }],
      },
      {
        n: 7,
        title: 'Industrial Engineering and Management',
        topics: [
          { title: 'Industrial Engineering and Management', size: 3 },
        ],
      },
    ],
  },
];

/** Flat list of every subject, honouring the B.Arch toggle. */
export function allSubjectGroups(includeBArch = false) {
  return includeBArch ? [...SUBJECTS, ...BARCH_ONLY] : SUBJECTS;
}
