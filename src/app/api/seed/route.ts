import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireRole, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Block seeding in production
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Le seed est interdit en production' },
        { status: 403 }
      );
    }

    // Check if already seeded - if there are users, require SUPER_ADMIN_GLOBAL auth
    const existingUsers = await db.user.count();
    if (existingUsers > 0) {
      const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
      if ('error' in authResult) return authResult.error;
    }

    // Check if already seeded
    const existingSchools = await db.school.count();
    if (existingSchools > 0) {
      return NextResponse.json({ message: 'Database already seeded', schoolCount: existingSchools });
    }

    const passwordHash = await bcrypt.hash('admin123', 10);
    const counts = {
      schools: 0,
      schoolYears: 0,
      users: 0,
      classes: 0,
      subjects: 0,
      students: 0,
      grades: 0,
      disciplineRecords: 0,
      paymentRecords: 0,
      communications: 0,
      homeworks: 0,
    };

    // ===== CREATE SCHOOLS =====
    const schoolsData = [
      {
        name: 'Complexe Scolaire Lumière',
        shortName: 'CSL',
        email: 'info@lumiere.cd',
        phone: '+243810000000',
        address: '45 Ave de la Libération',
        city: 'Kinshasa',
        province: 'Kinshasa',
        country: 'RD Congo',
        latitude: -4.4419,
        longitude: 15.2663,
        description: 'Un complexe éducatif de référence à Kinshasa, offrant une formation complète de la maternelle au secondaire.',
        mission: 'Former des citoyens responsables et compétents pour le développement du pays.',
        establishmentYear: 1995,
        subscriptionTier: 'PREMIUM',
        maxStudents: 2000,
        schoolType: 'MIXTE',
        schoolCategory: 'PRIVEE',
        averageRating: 4.5,
        totalReviews: 128,
      },
      {
        name: 'Institut Mwanzo',
        shortName: 'IMW',
        email: 'contact@mwanzo.cd',
        phone: '+243820000000',
        address: '12 Rue Kasai',
        city: 'Lubumbashi',
        province: 'Haut-Katanga',
        country: 'RD Congo',
        latitude: -11.6609,
        longitude: 27.4794,
        description: 'Établissement d\'excellence dans la province du Haut-Katanga.',
        establishmentYear: 2003,
        subscriptionTier: 'STANDARD',
        maxStudents: 800,
        schoolType: 'MIXTE',
        schoolCategory: 'PRIVEE',
      },
      {
        name: 'École Dakar Sciences',
        shortName: 'EDS',
        email: 'info@dakarsciences.sn',
        phone: '+221770000000',
        address: '8 Boulevard de la République',
        city: 'Dakar',
        province: 'Dakar',
        country: 'Sénégal',
        latitude: 14.7167,
        longitude: -17.4677,
        description: 'Pôle d\'excellence scientifique au Sénégal.',
        establishmentYear: 2010,
        subscriptionTier: 'STANDARD',
        maxStudents: 600,
        schoolType: 'MIXTE',
        schoolCategory: 'PRIVEE',
      },
      {
        name: 'Lycée Abidjan Excel',
        shortName: 'LAE',
        email: 'admin@abidjanexcel.ci',
        phone: '+225070000000',
        address: '22 Rue des Jardins',
        city: 'Abidjan',
        province: 'Abidjan',
        country: "Côte d'Ivoire",
        latitude: 5.3364,
        longitude: -4.0267,
        description: 'Formation d\'excellence en Côte d\'Ivoire.',
        establishmentYear: 2007,
        subscriptionTier: 'FREEMIUM',
        maxStudents: 500,
        schoolType: 'MIXTE',
        schoolCategory: 'PRIVEE',
      },
      {
        name: 'Collège Brazza Avenir',
        shortName: 'CBA',
        email: 'info@brazzaavenir.cg',
        phone: '+242060000000',
        address: '5 Avenue Matsiona',
        city: 'Brazzaville',
        province: 'Brazzaville',
        country: 'Congo',
        latitude: -4.2634,
        longitude: 15.2429,
        description: 'Éducation de qualité au Congo-Brazzaville.',
        establishmentYear: 2015,
        subscriptionTier: 'FREEMIUM',
        maxStudents: 400,
        schoolType: 'MIXTE',
        schoolCategory: 'PRIVEE',
      },
      {
        name: 'Groupe Scolaire Kivu Espoir',
        shortName: 'GSK',
        email: 'contact@kivuespoir.cd',
        phone: '+243990000000',
        address: '30 Avenue du Lac',
        city: 'Goma',
        province: 'Nord-Kivu',
        country: 'RD Congo',
        latitude: -1.6542,
        longitude: 29.2208,
        description: 'Espoir et éducation dans la région du Kivu.',
        establishmentYear: 2018,
        subscriptionTier: 'FREEMIUM',
        maxStudents: 300,
        schoolType: 'MIXTE',
        schoolCategory: 'PRIVEE',
      },
    ];

    const schools = [];
    for (const s of schoolsData) {
      const school = await db.school.create({ data: s });
      schools.push(school);
      counts.schools++;
    }

    // ===== CREATE SCHOOL YEARS =====
    const schoolYears = [];
    for (const school of schools) {
      const sy = await db.schoolYear.create({
        data: {
          label: '2025-2026',
          startDate: new Date('2025-09-01'),
          endDate: new Date('2026-06-30'),
          isActive: true,
          schoolId: school.id,
        },
      });
      schoolYears.push({ ...sy, schoolId: school.id, schoolShortName: school.shortName });
      counts.schoolYears++;
    }

    // ===== FIRST SCHOOL: Complexe Scolaire Lumière - Full Data =====
    const lumiere = schools[0];
    const lumiereYear = schoolYears[0];

    // ----- Classes for Lumière -----
    const classNames = [
      { name: 'M1', section: 'Maternelle', level: 'MATERNELLE' },
      { name: 'M2', section: 'Maternelle', level: 'MATERNELLE' },
      { name: 'CP1', section: 'Primaire', level: 'PRIMAIRE' },
      { name: 'CP2', section: 'Primaire', level: 'PRIMAIRE' },
      { name: 'CE1', section: 'Primaire', level: 'PRIMAIRE' },
      { name: 'CE2', section: 'Primaire', level: 'PRIMAIRE' },
      { name: 'CM1', section: 'Primaire', level: 'PRIMAIRE' },
      { name: 'CM2', section: 'Primaire', level: 'PRIMAIRE' },
      { name: '6eA', section: 'Secondaire', level: 'SECONDAIRE' },
      { name: '6eB', section: 'Secondaire', level: 'SECONDAIRE' },
      { name: '5eA', section: 'Secondaire', level: 'SECONDAIRE' },
      { name: '4eA', section: 'Secondaire', level: 'SECONDAIRE' },
      { name: '3eA', section: 'Secondaire', level: 'SECONDAIRE' },
      { name: '2ndeA', section: 'Secondaire', level: 'SECONDAIRE' },
      { name: 'TleS', section: 'Secondaire', level: 'SECONDAIRE' },
    ];

    const lumiereClasses: { id: string; name: string; section: string; level: string }[] = [];
    for (const c of classNames) {
      const cls = await db.class.create({
        data: {
          name: c.name,
          section: c.section,
          level: c.level,
          capacity: 40,
          schoolId: lumiere.id,
          schoolYearId: lumiereYear.id,
        },
      });
      lumiereClasses.push(cls);
      counts.classes++;
    }

    // ----- Subjects for Lumière -----
    const subjectNames = ['Mathématiques', 'Français', 'Anglais', 'Sciences', 'Histoire-Géo', 'EPS'];
    const subjectMap: Record<string, string> = {};

    for (const subName of subjectNames) {
      const code = subName.substring(0, 3).toUpperCase();
      const subject = await db.subject.create({
        data: {
          name: subName,
          code,
          coefficient: subName === 'Mathématiques' ? 4 : subName === 'Français' ? 4 : subName === 'Anglais' ? 2 : subName === 'Sciences' ? 3 : subName === 'Histoire-Géo' ? 2 : 1,
          schoolId: lumiere.id,
          schoolYearId: lumiereYear.id,
          classId: lumiereClasses[0].id,
        },
      });
      for (const cls of lumiereClasses) {
        subjectMap[`${cls.id}-${subName}`] = subject.id;
      }
      counts.subjects++;
    }

    // ----- Users for Lumière -----
    const usersData = [
      { name: 'Admin Global', email: 'admin@edugest.app', phone: '+243810000001', role: 'SUPER_ADMIN_GLOBAL' },
      { name: 'Claudine Ngoie', email: 'claudine@lumiere.cd', phone: '+243810000010', role: 'SECRETARY' },
      { name: 'Joseph Kabongo', email: 'joseph@lumiere.cd', phone: '+243810000011', role: 'CASHIER' },
      { name: 'Directrice Maternelle', email: 'dir.maternelle@lumiere.cd', phone: '+243810000012', role: 'DIRECTION_MATERNELLE' },
      { name: 'Directeur Primaire', email: 'dir.primaire@lumiere.cd', phone: '+243810000013', role: 'DIRECTION_PRIMAIRE' },
      { name: 'Directeur Secondaire', email: 'dir.secondaire@lumiere.cd', phone: '+243810000014', role: 'DIRECTION_SECONDAIRE' },
      { name: 'Discipline Maternelle', email: 'disc.maternelle@lumiere.cd', phone: '+243810000015', role: 'DISCIPLINE_MATERNELLE' },
      { name: 'Discipline Primaire', email: 'disc.primaire@lumiere.cd', phone: '+243810000016', role: 'DISCIPLINE_PRIMAIRE' },
      { name: 'Discipline Secondaire', email: 'disc.secondaire@lumiere.cd', phone: '+243810000017', role: 'DISCIPLINE_SECONDAIRE' },
      { name: 'Prof. Mwepu Kashala', email: 'mwepu@lumiere.cd', phone: '+243810000018', role: 'TEACHER' },
      { name: 'Prof. Tshibola', email: 'tshibola@lumiere.cd', phone: '+243810000019', role: 'TEACHER' },
      { name: 'Marie Lumumba', email: 'headteacher@lumiere.cd', phone: '+243810000020', role: 'HEAD_TEACHER' },
      { name: 'Papa Kazadi', email: 'parent@email.com', phone: '+243810000021', role: 'PARENT' },
      { name: 'Maman Nsimba', email: 'nsimba@email.com', phone: '+243810000022', role: 'PARENT' },
    ];

    const lumiereUsers: { id: string; role: string; name: string; email?: string }[] = [];
    for (const u of usersData) {
      const createdUser = await db.user.create({
        data: {
          name: u.name,
          email: u.email,
          phone: u.phone,
          password: passwordHash,
          role: u.role,
          schoolId: lumiere.id,
        },
      });
      lumiereUsers.push({ id: createdUser.id, role: u.role, name: u.name, email: u.email });
      counts.users++;
    }

    const parentKazadi = lumiereUsers.find(u => u.email === 'parent@email.com');
    const parentNsimba = lumiereUsers.find(u => u.email === 'nsimba@email.com');
    const headTeacher = lumiereUsers.find(u => u.role === 'HEAD_TEACHER');

    // Update head teacher on a class
    if (headTeacher) {
      const class6eA = lumiereClasses.find(c => c.name === '6eA');
      if (class6eA) {
        await db.class.update({ where: { id: class6eA.id }, data: { headTeacherId: headTeacher.id } });
      }
    }

    // ----- Students for Lumière -----
    const studentsData = [
      { firstName: 'Kabongo', lastName: 'Mutombo', gender: 'M', className: '6eA', parentEmail: 'parent@email.com', dob: '2012-03-15' },
      { firstName: 'Nzuzi', lastName: 'Kazadi', gender: 'F', className: '6eA', parentEmail: 'parent@email.com', dob: '2012-07-22' },
      { firstName: 'Tshimanga', lastName: 'Kalala', gender: 'M', className: '6eA', parentEmail: 'nsimba@email.com', dob: '2012-01-10' },
      { firstName: 'Banza', lastName: 'Ngandu', gender: 'M', className: '6eB', parentEmail: 'parent@email.com', dob: '2012-05-18' },
      { firstName: 'Lomami', lastName: 'Kabuya', gender: 'F', className: '6eB', parentEmail: 'nsimba@email.com', dob: '2012-11-03' },
      { firstName: 'Ilunga', lastName: 'Mwepu', gender: 'M', className: '5eA', parentEmail: 'parent@email.com', dob: '2011-04-25' },
      { firstName: 'Kanyinda', lastName: 'Nkulu', gender: 'F', className: '5eA', parentEmail: 'nsimba@email.com', dob: '2011-08-14' },
      { firstName: 'Mbaya', lastName: 'Tshibola', gender: 'M', className: '4eA', parentEmail: 'parent@email.com', dob: '2010-02-28' },
      { firstName: 'Lukaku', lastName: 'Mputu', gender: 'M', className: '4eA', parentEmail: 'nsimba@email.com', dob: '2010-09-07' },
      { firstName: 'Ngoy', lastName: 'Kasongo', gender: 'F', className: '3eA', parentEmail: 'parent@email.com', dob: '2009-06-12' },
      { firstName: 'Tshisekedi', lastName: 'Mukendi', gender: 'M', className: '3eA', parentEmail: 'nsimba@email.com', dob: '2009-12-01' },
      { firstName: 'Kalonga', lastName: 'Mbuyi', gender: 'F', className: '2ndeA', parentEmail: 'parent@email.com', dob: '2008-03-20' },
      { firstName: 'Wembo', lastName: 'Lundula', gender: 'M', className: '2ndeA', parentEmail: 'nsimba@email.com', dob: '2008-10-15' },
      { firstName: 'Musumba', lastName: 'Tshala', gender: 'F', className: 'TleS', parentEmail: 'parent@email.com', dob: '2007-01-08' },
      { firstName: 'Kasongo', lastName: 'Bakari', gender: 'M', className: 'TleS', parentEmail: 'nsimba@email.com', dob: '2007-07-30' },
      { firstName: 'Amani', lastName: 'Baketu', gender: 'M', className: 'CP1', parentEmail: 'parent@email.com', dob: '2018-09-02' },
      { firstName: 'Grâce', lastName: 'Nsimba', gender: 'F', className: 'CP2', parentEmail: 'nsimba@email.com', dob: '2017-04-14' },
      { firstName: 'Espoir', lastName: 'Lubala', gender: 'M', className: 'CE1', parentEmail: 'parent@email.com', dob: '2016-11-25' },
      { firstName: 'Joie', lastName: 'Kabange', gender: 'F', className: 'CM1', parentEmail: 'nsimba@email.com', dob: '2015-06-30' },
      { firstName: 'David', lastName: 'Mwamba', gender: 'M', className: 'CM2', parentEmail: 'parent@email.com', dob: '2014-02-17' },
    ];

    const createdStudents: { id: string; matricule: string; classId: string }[] = [];
    let matriculeCounter = 1;

    for (const s of studentsData) {
      const cls = lumiereClasses.find(c => c.name === s.className);
      if (!cls) continue;

      const parent = s.parentEmail === 'parent@email.com' ? parentKazadi : parentNsimba;
      const matricule = `CSL-2025-${String(matriculeCounter).padStart(3, '0')}`;
      matriculeCounter++;

      const student = await db.student.create({
        data: {
          matricule,
          firstName: s.firstName,
          lastName: s.lastName,
          gender: s.gender,
          dateOfBirth: new Date(s.dob),
          classId: cls.id,
          parentId: parent?.id,
          schoolId: lumiere.id,
          schoolYearId: lumiereYear.id,
        },
      });
      createdStudents.push({ id: student.id, matricule: student.matricule, classId: cls.id });
      counts.students++;
    }

    // ----- Grades for Students -----
    for (const student of createdStudents) {
      for (const subName of subjectNames) {
        const subjectId = subjectMap[`${student.classId}-${subName}`];
        if (!subjectId) continue;

        const baseScore = 6 + Math.random() * 8;
        for (const trimester of ['T1', 'T2', 'T3']) {
          const variation = (Math.random() - 0.5) * 4;
          const score = Math.max(0, Math.min(20, parseFloat((baseScore + variation).toFixed(1))));
          try {
            await db.grade.create({
              data: {
                studentId: student.id,
                subjectId,
                classId: student.classId,
                trimester,
                score,
                schoolYearId: lumiereYear.id,
              },
            });
            counts.grades++;
          } catch {
            // Skip if unique constraint violation
          }
        }
      }
    }

    // ----- Discipline Records -----
    const disciplineData = [
      { studentIdx: 0, type: 'RETARD', severity: 'LOW', title: 'Retard répété', description: 'Arrivée en retard 3 fois ce mois', points: -2, listType: 'GREYLIST' },
      { studentIdx: 2, type: 'ABSENCE', severity: 'MEDIUM', title: 'Absence non justifiée', description: 'Absence de 3 jours sans justification', points: -5, listType: 'GREYLIST' },
      { studentIdx: 3, type: 'TRICHERIE', severity: 'HIGH', title: 'Tricherie en examen', description: 'Copie détectée lors du contrôle de maths', points: -10, listType: 'BLACKLIST' },
      { studentIdx: 5, type: 'VIOLENCE', severity: 'HIGH', title: 'Bagarre', description: 'Participation à une bagarre dans la cour', points: -10, listType: 'BLACKLIST' },
      { studentIdx: 8, type: 'RETARD', severity: 'LOW', title: 'Retard occasionnel', description: 'Arrivée en retard 1 fois', points: -1, listType: 'GREYLIST' },
      { studentIdx: 10, type: 'EXCELLENCE', severity: 'LOW', title: 'Excellent résultats', description: 'Meilleure moyenne de la classe T1', points: 5, listType: 'WHITELIST' },
      { studentIdx: 14, type: 'EXCELLENCE', severity: 'LOW', title: 'Comportement exemplaire', description: 'Citoyen modèle du mois', points: 3, listType: 'WHITELIST' },
    ];

    for (const d of disciplineData) {
      if (d.studentIdx >= createdStudents.length) continue;
      const student = createdStudents[d.studentIdx];
      await db.disciplineRecord.create({
        data: {
          studentId: student.id,
          type: d.type,
          severity: d.severity,
          title: d.title,
          description: d.description,
          points: d.points,
          listType: d.listType,
          status: 'CONFIRMED',
          schoolId: lumiere.id,
        },
      });
      counts.disciplineRecords++;
    }

    // Also create some Blacklist/Greylist/Whitelist entries
    if (createdStudents.length > 3) {
      await db.blacklist.create({
        data: {
          studentId: createdStudents[3].id,
          schoolId: lumiere.id,
          reason: 'Tricherie en examen - sanction disciplinaire',
          addedBy: 'Directeur Secondaire',
        },
      });
      await db.greylist.create({
        data: {
          studentId: createdStudents[0].id,
          schoolId: lumiere.id,
          reason: 'Retards répétés - avertissement',
          addedBy: 'Discipline Secondaire',
        },
      });
      await db.whitelist.create({
        data: {
          studentId: createdStudents[14].id,
          schoolId: lumiere.id,
          reason: 'Comportement exemplaire et résultats excellents',
          addedBy: 'Directrice Maternelle',
        },
      });
    }

    // ----- Payment Records -----
    const paymentStatuses = ['PAID', 'PAID', 'PAID', 'PARTIAL', 'PENDING', 'OVERDUE'];
    for (let i = 0; i < createdStudents.length; i++) {
      const student = createdStudents[i];
      for (const trimester of ['T1', 'T2', 'T3']) {
        const statusIdx = (i + trimester.charCodeAt(0)) % paymentStatuses.length;
        const status = paymentStatuses[statusIdx];
        const amount = 150000;
        const paidAmount = status === 'PAID' ? amount : status === 'PARTIAL' ? Math.floor(amount * 0.6) : 0;

        await db.paymentRecord.create({
          data: {
            studentId: student.id,
            schoolId: lumiere.id,
            amount,
            paidAmount,
            trimester,
            paymentMethod: status === 'PAID' ? 'CASH' : status === 'PARTIAL' ? 'MOBILE_MONEY' : null,
            status,
            paidAt: status === 'PAID' ? new Date('2025-10-15') : status === 'PARTIAL' ? new Date('2025-10-20') : null,
            receiptNumber: status === 'PAID' ? `REC-${String(i + 1).padStart(4, '0')}-${trimester}` : null,
          },
        });
        counts.paymentRecords++;
      }
    }

    // ----- Communications -----
    const communicationsData = [
      { type: 'ANNOUNCEMENT', title: 'Rentrée scolaire 2025-2026', content: 'Nous avons le plaisir de vous annoncer que la rentrée scolaire aura lieu le 1er septembre 2025. Tous les élèves sont tenus de se présenter à 7h30.', targetType: 'ALL' },
      { type: 'ANNOUNCEMENT', title: 'Réunion parents-professeurs', content: 'Une réunion parents-professeurs est prévue le 15 octobre 2025. Votre présence est obligatoire.', targetType: 'ALL' },
      { type: 'NOTIFICATION', title: 'Rappel paiement scolarité', content: 'Nous vous rappelons que le paiement du premier trimestre doit être effectué avant le 30 septembre 2025.', targetType: 'PARENTS' },
      { type: 'EVENT', title: 'Journée sportive', content: 'La journée sportive annuelle aura lieu le 20 novembre 2025. Les élèves sont invités à participer activement.', targetType: 'ALL' },
      { type: 'ALERT', title: 'Conseil de discipline', content: 'Un conseil de discipline se tiendra le 25 octobre concernant les incidents récents.', targetType: 'STAFF' },
    ];

    for (const c of communicationsData) {
      await db.communication.create({
        data: {
          senderId: lumiereUsers[0].id,
          senderRole: 'SUPER_ADMIN_GLOBAL',
          schoolId: lumiere.id,
          type: c.type,
          title: c.title,
          content: c.content,
          targetType: c.targetType,
          sentToApp: true,
          sentToWhatsapp: true,
        },
      });
      counts.communications++;
    }

    // ----- Homework -----
    const homeworkData = [
      { title: 'Exercices de calcul', description: 'Résoudre les exercices 1 à 15 page 42 du manuel', subjectName: 'Mathématiques', className: '6eA', teacherName: 'Prof. Mwepu Kashala', dueDate: '2025-09-20' },
      { title: 'Rédaction', description: 'Rédiger un texte de 200 mots sur le thème "Mon village"', subjectName: 'Français', className: '6eA', teacherName: 'Prof. Tshibola', dueDate: '2025-09-22' },
      { title: 'Verbes irréguliers', description: 'Conjuguer les verbes: be, have, do, go, come au présent, passé et futur', subjectName: 'Anglais', className: '5eA', teacherName: 'Prof. Mwepu Kashala', dueDate: '2025-09-25' },
      { title: 'Sciences - Le système solaire', description: 'Dessiner et légender le système solaire', subjectName: 'Sciences', className: 'CM2', teacherName: 'Prof. Tshibola', dueDate: '2025-09-18' },
      { title: 'Histoire - L\'indépendance', description: 'Rédiger un résumé de 2 pages sur l\'indépendance de la RDC', subjectName: 'Histoire-Géo', className: '3eA', teacherName: 'Prof. Mwepu Kashala', dueDate: '2025-09-28' },
    ];

    for (const h of homeworkData) {
      const cls = lumiereClasses.find(c => c.name === h.className);
      if (!cls) continue;

      await db.homework.create({
        data: {
          title: h.title,
          description: h.description,
          subjectName: h.subjectName,
          classId: cls.id,
          teacherName: h.teacherName,
          dueDate: new Date(h.dueDate),
          schoolId: lumiere.id,
        },
      });
      counts.homeworks++;
    }

    // ===== OTHER SCHOOLS: Minimal Data =====
    for (let i = 1; i < schools.length; i++) {
      const school = schools[i];
      const sy = schoolYears[i];

      const otherClassNames = i % 2 === 0
        ? ['6eA', '5eA', '4eA']
        : ['CP1', 'CE1', 'CM1'];

      for (const cn of otherClassNames) {
        const section = cn.match(/^\d/) ? 'Secondaire' : 'Primaire';
        const level = cn.match(/^\d/) ? 'SECONDAIRE' : 'PRIMAIRE';
        await db.class.create({
          data: {
            name: cn,
            section,
            level,
            capacity: 35,
            schoolId: school.id,
            schoolYearId: sy.id,
          },
        });
        counts.classes++;
      }

      await db.user.create({
        data: {
          name: `Admin ${school.shortName}`,
          email: `admin@${school.shortName.toLowerCase()}.cd`,
          phone: `+2438100000${30 + i}`,
          password: passwordHash,
          role: 'SECRETARY',
          schoolId: school.id,
        },
      });
      counts.users++;
    }

    // Update school counters
    for (const school of schools) {
      const studentCount = await db.student.count({ where: { schoolId: school.id } });
      const classCount = await db.class.count({ where: { schoolId: school.id } });
      await db.school.update({
        where: { id: school.id },
        data: { studentCount, classCount },
      });
    }

    return NextResponse.json({
      message: 'Database seeded successfully!',
      counts,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed database', details: sanitizeError(error) },
      { status: 500 }
    );
  }
}
