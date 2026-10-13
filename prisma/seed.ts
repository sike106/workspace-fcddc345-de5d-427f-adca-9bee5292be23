import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/auth'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Create admin user
  const adminPassword = await hashPassword('admin123')
  const admin = await prisma.user.upsert({
    where: { email: 'admin@jee.com' },
    update: {},
    create: {
      email: 'admin@jee.com',
      name: 'Admin',
      password: adminPassword,
      role: 'admin',
      isGuest: false
    }
  })
  console.log('Created admin:', admin.email)

  // Create teacher user
  const teacherPassword = await hashPassword('teacher123')
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@jee.com' },
    update: {},
    create: {
      email: 'teacher@jee.com',
      name: 'Dr. Sharma',
      password: teacherPassword,
      role: 'teacher',
      isGuest: false
    }
  })
  console.log('Created teacher:', teacher.email)

  // Create sample student
  const studentPassword = await hashPassword('student123')
  const student = await prisma.user.upsert({
    where: { email: 'student@jee.com' },
    update: {},
    create: {
      email: 'student@jee.com',
      name: 'Rahul Kumar',
      password: studentPassword,
      role: 'student',
      isGuest: false
    }
  })
  console.log('Created student:', student.email)

  // Create Physics Questions
  const physicsQuestions = [
    {
      subject: 'Physics',
      chapter: 'Electrostatics',
      difficulty: 'Medium',
      type: 'single',
      question: 'Two point charges $+q$ and $-q$ are placed at a distance $2a$ apart. Calculate the electric field at a point $P$ situated at a distance $r$ from the center on the axial line. What is the direction of the electric field at point $P$?',
      options: JSON.stringify(['Towards $+q$', 'Towards $-q$', 'Perpendicular to the axis', 'Zero']),
      correctAnswer: '1',
      solution: 'For an electric dipole on the axial line, the electric field is $E = \\frac{1}{4\\pi\\epsilon_0} \\frac{2pr}{(r^2-a^2)^2}$ where $p = 2qa$ is the dipole moment. The direction is along the axis from $+q$ to $-q$.',
      hint: 'Use the dipole field formula for axial position.',
      explanation: 'On the axial line, the fields due to both charges add up along the axis. The net field points from the positive charge towards the negative charge.'
    },
    {
      subject: 'Physics',
      chapter: 'Electrostatics',
      difficulty: 'Hard',
      type: 'single',
      question: 'A conducting sphere of radius $R$ carries a charge $Q$. A point charge $q$ is placed at a distance $2R$ from the center of the sphere. What is the magnitude of the force on the point charge?',
      options: JSON.stringify([
        '$\\frac{kQq}{4R^2}$',
        '$\\frac{kQq}{2R^2}$',
        '$\\frac{kq(Q-q/4)}{4R^2}$',
        '$\\frac{kQq}{R^2}$'
      ]),
      correctAnswer: '0',
      solution: 'For a conducting sphere with charge $Q$, the electric field outside behaves as if all charge is at the center. At distance $2R$, $E = \\frac{kQ}{(2R)^2} = \\frac{kQ}{4R^2}$. Force on $q$ is $F = qE = \\frac{kQq}{4R^2}$.',
      hint: 'Treat the conducting sphere as a point charge at its center for points outside.'
    },
    {
      subject: 'Physics',
      chapter: 'Mechanics',
      difficulty: 'Medium',
      type: 'single',
      question: 'A block of mass $m$ is placed on an inclined plane of inclination $\\theta$. The coefficient of friction between the block and the plane is $\\mu$. For what value of $\\theta$ will the block just start sliding?',
      options: JSON.stringify([
        '$\\theta = \\tan^{-1}(\\mu)$',
        '$\\theta = \\sin^{-1}(\\mu)$',
        '$\\theta = \\cos^{-1}(\\mu)$',
        '$\\theta = \\cot^{-1}(\\mu)$'
      ]),
      correctAnswer: '0',
      solution: 'At limiting equilibrium, $mg\\sin\\theta = \\mu mg\\cos\\theta$. Therefore, $\\tan\\theta = \\mu$, giving $\\theta = \\tan^{-1}(\\mu)$.',
      hint: 'Compare the component of gravity along the incline with the maximum friction force.',
      pyqYear: 2021,
      pyqType: 'JEE Main'
    },
    {
      subject: 'Physics',
      chapter: 'Mechanics',
      difficulty: 'Hard',
      type: 'numerical',
      question: 'A particle is projected with velocity $v_0$ at an angle $\\theta$ to the horizontal. At the highest point of its trajectory, the ratio of kinetic energy to potential energy (taking the point of projection as reference) is:',
      options: null,
      correctAnswer: 'cos²θ',
      solution: 'At highest point: velocity = $v_0\\cos\\theta$ (horizontal). $KE = \\frac{1}{2}m(v_0\\cos\\theta)^2$. Height = $\\frac{v_0^2\\sin^2\\theta}{2g}$, so $PE = mgH = \\frac{1}{2}mv_0^2\\sin^2\\theta$. Ratio = $\\frac{\\cos^2\\theta}{\\sin^2\\theta} = \\cot^2\\theta$.',
      hint: 'At the highest point, only horizontal velocity remains.',
      pyqYear: 2022,
      pyqType: 'JEE Advanced'
    },
    {
      subject: 'Physics',
      chapter: 'Optics',
      difficulty: 'Medium',
      type: 'single',
      question: 'A convex lens of focal length 20 cm produces a real image at a distance of 60 cm from the lens. The object distance is:',
      options: JSON.stringify(['30 cm', '40 cm', '15 cm', '45 cm']),
      correctAnswer: '0',
      solution: 'Using lens formula $\\frac{1}{v} - \\frac{1}{u} = \\frac{1}{f}$: $\\frac{1}{60} - \\frac{1}{u} = \\frac{1}{20}$. Solving: $\\frac{1}{u} = \\frac{1}{60} - \\frac{1}{20} = -\\frac{1}{30}$. So $u = -30$ cm (object at 30 cm).',
      hint: 'Apply the lens formula with proper sign convention.',
      pyqYear: 2020,
      pyqType: 'JEE Main'
    },
    {
      subject: 'Physics',
      chapter: 'Thermodynamics',
      difficulty: 'Hard',
      type: 'single',
      question: 'An ideal gas undergoes a cyclic process consisting of two isochoric and two isobaric processes. The efficiency of the cycle is:',
      options: JSON.stringify([
        'Depends on the ratio of specific heats',
        'Depends on the pressure and volume ratios',
        'Always 100%',
        'Cannot be determined'
      ]),
      correctAnswer: '1',
      solution: 'For a rectangular PV diagram cycle, efficiency = $\\eta = 1 - \\frac{Q_{out}}{Q_{in}}$. This depends on the pressure and volume ratios during the isobaric processes.',
      hint: 'Draw the PV diagram and calculate work done and heat absorbed.'
    }
  ]

  for (const q of physicsQuestions) {
    await prisma.question.create({ data: q })
  }
  console.log('Created Physics questions')

  // Create Chemistry Questions
  const chemistryQuestions = [
    {
      subject: 'Chemistry',
      chapter: 'Electrochemistry',
      difficulty: 'Medium',
      type: 'single',
      question: 'The standard reduction potential of $Cu^{2+}/Cu$ is +0.34 V. What is the reduction potential of $Cu^{2+}/Cu$ in a solution where $[Cu^{2+}] = 0.01 M$ at 298 K?',
      options: JSON.stringify(['0.28 V', '0.40 V', '0.22 V', '0.34 V']),
      correctAnswer: '0',
      solution: 'Using Nernst equation: $E = E^\\circ - \\frac{0.059}{n}\\log\\frac{1}{[Cu^{2+}]} = 0.34 - \\frac{0.059}{2}\\log 100 = 0.34 - 0.059 = 0.281$ V ≈ 0.28 V.',
      hint: 'Apply the Nernst equation at 298 K.',
      pyqYear: 2021,
      pyqType: 'JEE Main'
    },
    {
      subject: 'Chemistry',
      chapter: 'Organic Chemistry',
      difficulty: 'Hard',
      type: 'single',
      question: 'Which of the following reactions proceeds via SN1 mechanism?',
      options: JSON.stringify([
        'Hydrolysis of methyl chloride',
        'Hydrolysis of tert-butyl chloride',
        'Reaction of CH₃Br with NaOH',
        'Reaction of ethyl bromide with aqueous KOH'
      ]),
      correctAnswer: '1',
      solution: 'SN1 mechanism proceeds via carbocation intermediate. Tertiary alkyl halides like tert-butyl chloride form stable carbocations, making SN1 favorable. Primary alkyl halides prefer SN2.',
      hint: 'SN1 requires stable carbocation formation.',
      pyqYear: 2022,
      pyqType: 'JEE Main'
    },
    {
      subject: 'Chemistry',
      chapter: 'Chemical Bonding',
      difficulty: 'Medium',
      type: 'single',
      question: 'The hybridization of the central atom in $SF_6$ is:',
      options: JSON.stringify(['sp³', 'sp³d', 'sp³d²', 'dsp²']),
      correctAnswer: '2',
      solution: 'In $SF_6$, sulfur forms 6 bonds with fluorine atoms. This requires 6 hybrid orbitals, which corresponds to $sp^3d^2$ hybridization (using one s, three p, and two d orbitals).',
      hint: 'Count the number of bonds and lone pairs on the central atom.',
      pyqYear: 2020,
      pyqType: 'JEE Main'
    },
    {
      subject: 'Chemistry',
      chapter: 'Equilibrium',
      difficulty: 'Hard',
      type: 'numerical',
      question: 'For the reaction $N_2 + 3H_2 \\rightleftharpoons 2NH_3$ at equilibrium, the concentrations are $[N_2] = 0.5 M$, $[H_2] = 1.0 M$, and $[NH_3] = 0.2 M$. Calculate $K_c$.',
      options: null,
      correctAnswer: '0.08',
      solution: '$K_c = \\frac{[NH_3]^2}{[N_2][H_2]^3} = \\frac{(0.2)^2}{(0.5)(1.0)^3} = \\frac{0.04}{0.5} = 0.08$',
      hint: 'Apply the equilibrium constant expression directly.'
    },
    {
      subject: 'Chemistry',
      chapter: 'Coordination Compounds',
      difficulty: 'Medium',
      type: 'single',
      question: 'The IUPAC name of $[Co(NH_3)_5Cl]Cl_2$ is:',
      options: JSON.stringify([
        'Pentaamminechloridocobalt(III) chloride',
        'Chloridopentaamminecobalt(III) chloride',
        'Pentaamminechlorocobalt(II) chloride',
        'Amminepentachlorocobalt(III) chloride'
      ]),
      correctAnswer: '0',
      solution: 'The ligands are named alphabetically: ammine (5) and chlorido (1). The central metal is cobalt with oxidation state +3 (calculated from the charge balance). The counter ions are two chloride ions.',
      hint: 'Follow IUPAC naming rules: ligands first, then metal with oxidation state.',
      pyqYear: 2021,
      pyqType: 'JEE Advanced'
    }
  ]

  for (const q of chemistryQuestions) {
    await prisma.question.create({ data: q })
  }
  console.log('Created Chemistry questions')

  // Create Mathematics Questions
  const mathQuestions = [
    {
      subject: 'Mathematics',
      chapter: 'Calculus',
      difficulty: 'Medium',
      type: 'single',
      question: 'If $y = \\sin^{-1}(\\sqrt{1-x^2})$, then $\\frac{dy}{dx}$ equals:',
      options: JSON.stringify([
        '$\\frac{-x}{|x|\\sqrt{1-x^2}}$',
        '$\\frac{x}{\\sqrt{1-x^2}}$',
        '$\\frac{-1}{\\sqrt{1-x^2}}$',
        '$\\frac{1}{\\sqrt{1-x^2}}$'
      ]),
      correctAnswer: '0',
      solution: 'Let $x = \\cos\\theta$. Then $y = \\sin^{-1}(\\sin\\theta) = \\theta$. So $\\frac{dy}{dx} = \\frac{dy}{d\\theta} \\cdot \\frac{d\\theta}{dx} = 1 \\cdot \\frac{-1}{\\sin\\theta} = \\frac{-1}{\\sqrt{1-\\cos^2\\theta}} = \\frac{-x}{|x|\\sqrt{1-x^2}}$.',
      hint: 'Use substitution $x = \\cos\\theta$ to simplify.',
      pyqYear: 2021,
      pyqType: 'JEE Main'
    },
    {
      subject: 'Mathematics',
      chapter: 'Calculus',
      difficulty: 'Hard',
      type: 'single',
      question: 'The value of $\\int_0^{\\pi/2} \\frac{\\sin x - \\cos x}{1 + \\sin x \\cos x} dx$ is:',
      options: JSON.stringify(['0', 'π/2', 'π/4', '1']),
      correctAnswer: '0',
      solution: 'Let $I = \\int_0^{\\pi/2} \\frac{\\sin x - \\cos x}{1 + \\sin x \\cos x} dx$. Using property $\\int_0^a f(x)dx = \\int_0^a f(a-x)dx$, and the fact that the integrand is odd about $x = \\pi/4$, the integral equals 0.',
      hint: 'Use the property of definite integrals with substitution $x \\to \\frac{\\pi}{2} - x$.',
      pyqYear: 2022,
      pyqType: 'JEE Advanced'
    },
    {
      subject: 'Mathematics',
      chapter: 'Algebra',
      difficulty: 'Medium',
      type: 'single',
      question: 'If the roots of the equation $x^3 - 3x^2 + 2x + 1 = 0$ are $\\alpha, \\beta, \\gamma$, then $\\alpha^2 + \\beta^2 + \\gamma^2$ equals:',
      options: JSON.stringify(['3', '5', '7', '9']),
      correctAnswer: '0',
      solution: 'Using identity $\\alpha^2 + \\beta^2 + \\gamma^2 = (\\alpha + \\beta + \\gamma)^2 - 2(\\alpha\\beta + \\beta\\gamma + \\gamma\\alpha)$. From the equation: sum = 3, sum of pairs = 2. So $\\alpha^2 + \\beta^2 + \\gamma^2 = 9 - 4 = 5$... Wait, it should be $3^2 - 2(2) = 9 - 4 = 5$.',
      hint: 'Use Vieta\'s formulas and the identity for sum of squares.',
      correctAnswer: '1'
    },
    {
      subject: 'Mathematics',
      chapter: 'Coordinate Geometry',
      difficulty: 'Medium',
      type: 'single',
      question: 'The equation of the circle passing through the points (1, 0), (0, 1) and (0, 0) is:',
      options: JSON.stringify([
        '$x^2 + y^2 - x - y = 0$',
        '$x^2 + y^2 + x + y = 0$',
        '$x^2 + y^2 - 2x - 2y = 0$',
        '$x^2 + y^2 + 2x + 2y = 0$'
      ]),
      correctAnswer: '0',
      solution: 'Let the equation be $x^2 + y^2 + 2gx + 2fy + c = 0$. Substituting (0,0): $c = 0$. Substituting (1,0): $1 + 2g = 0 \\Rightarrow g = -1/2$. Substituting (0,1): $1 + 2f = 0 \\Rightarrow f = -1/2$. Equation: $x^2 + y^2 - x - y = 0$.',
      hint: 'Use the general equation of a circle and substitute all three points.',
      pyqYear: 2020,
      pyqType: 'JEE Main'
    },
    {
      subject: 'Mathematics',
      chapter: 'Vectors',
      difficulty: 'Hard',
      type: 'single',
      question: 'If $\\vec{a}$, $\\vec{b}$, $\\vec{c}$ are three vectors such that $\\vec{a} + \\vec{b} + \\vec{c} = \\vec{0}$ and $|\\vec{a}| = 3$, $|\\vec{b}| = 5$, $|\\vec{c}| = 7$, then the angle between $\\vec{a}$ and $\\vec{b}$ is:',
      options: JSON.stringify(['60°', '90°', '120°', '150°']),
      correctAnswer: '2',
      solution: 'Given $\\vec{c} = -(\\vec{a} + \\vec{b})$. Taking magnitude squared: $|\\vec{c}|^2 = |\\vec{a}|^2 + |\\vec{b}|^2 + 2\\vec{a}\\cdot\\vec{b}$. So $49 = 9 + 25 + 2 \\times 3 \\times 5 \\cos\\theta$. Thus $15 = 30\\cos\\theta$, giving $\\cos\\theta = -1/2$, so $\\theta = 120°$.',
      hint: 'Use the relation $|\\vec{a} + \\vec{b}|^2 = |\\vec{a}|^2 + |\\vec{b}|^2 + 2\\vec{a}\\cdot\\vec{b}$.',
      pyqYear: 2022,
      pyqType: 'JEE Main'
    }
  ]

  for (const q of mathQuestions) {
    await prisma.question.create({ data: q })
  }
  console.log('Created Mathematics questions')

  // Create Mock Tests
  const allQuestions = await prisma.question.findMany({ select: { id: true, subject: true } })
  
  const physicsQ = allQuestions.filter(q => q.subject === 'Physics').map(q => q.id)
  const chemistryQ = allQuestions.filter(q => q.subject === 'Chemistry').map(q => q.id)
  const mathQ = allQuestions.filter(q => q.subject === 'Mathematics').map(q => q.id)

  // JEE Main Full Test
  await prisma.mockTest.create({
    data: {
      title: 'JEE Main Full Test - 1',
      description: 'Complete JEE Main pattern test with Physics, Chemistry, and Mathematics',
      testType: 'full',
      duration: 180,
      totalMarks: 300,
      negativeMarking: 1,
      questionIds: JSON.stringify([...physicsQ, ...chemistryQ, ...mathQ]),
      instructions: 'This test contains 15 questions from each subject. Each correct answer carries 4 marks. Wrong answer carries -1 mark. No marks for unattempted questions.',
      createdBy: admin.id
    }
  })

  // Subject Tests
  if (physicsQ.length > 0) {
    await prisma.mockTest.create({
      data: {
        title: 'Physics Subject Test - Electrostatics & Mechanics',
        description: 'Test covering Electrostatics and Mechanics chapters',
        subject: 'Physics',
        testType: 'subject',
        duration: 60,
        totalMarks: 100,
        negativeMarking: 1,
        questionIds: JSON.stringify(physicsQ),
        instructions: 'Subject test with 4 marks for correct answer and -1 for wrong answer.',
        createdBy: admin.id
      }
    })
  }

  if (chemistryQ.length > 0) {
    await prisma.mockTest.create({
      data: {
        title: 'Chemistry Subject Test',
        description: 'Comprehensive Chemistry test',
        subject: 'Chemistry',
        testType: 'subject',
        duration: 60,
        totalMarks: 100,
        negativeMarking: 1,
        questionIds: JSON.stringify(chemistryQ),
        instructions: 'Subject test with 4 marks for correct answer and -1 for wrong answer.',
        createdBy: admin.id
      }
    })
  }

  if (mathQ.length > 0) {
    await prisma.mockTest.create({
      data: {
        title: 'Mathematics Subject Test',
        description: 'Comprehensive Mathematics test',
        subject: 'Mathematics',
        testType: 'subject',
        duration: 60,
        totalMarks: 100,
        negativeMarking: 1,
        questionIds: JSON.stringify(mathQ),
        instructions: 'Subject test with 4 marks for correct answer and -1 for wrong answer.',
        createdBy: admin.id
      }
    })
  }

  console.log('Created mock tests')

  // Create sample progress for student
  await prisma.progress.createMany({
    data: [
      {
        userId: student.id,
        subject: 'Physics',
        chapter: 'Electrostatics',
        questionsSolved: 25,
        correctAnswers: 18,
        totalTime: 1800,
        accuracy: 72,
        lastPracticed: new Date()
      },
      {
        userId: student.id,
        subject: 'Physics',
        chapter: 'Mechanics',
        questionsSolved: 30,
        correctAnswers: 24,
        totalTime: 2100,
        accuracy: 80,
        lastPracticed: new Date()
      },
      {
        userId: student.id,
        subject: 'Chemistry',
        chapter: 'Electrochemistry',
        questionsSolved: 20,
        correctAnswers: 15,
        totalTime: 1500,
        accuracy: 75,
        lastPracticed: new Date()
      },
      {
        userId: student.id,
        subject: 'Mathematics',
        chapter: 'Calculus',
        questionsSolved: 35,
        correctAnswers: 28,
        totalTime: 2400,
        accuracy: 80,
        lastPracticed: new Date()
      }
    ]
  })

  console.log('Created sample progress data')
  console.log('✅ Seed completed successfully!')
  console.log('\nTest accounts:')
  console.log('Admin: admin@jee.com / admin123')
  console.log('Teacher: teacher@jee.com / teacher123')
  console.log('Student: student@jee.com / student123')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
