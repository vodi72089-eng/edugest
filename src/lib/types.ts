export interface SchoolData {
  id: string; name: string; shortName: string; email: string; phone: string;
  address: string; city: string; province: string; country: string;
  latitude?: number; longitude?: number; logo?: string; coverImage?: string;
  description?: string; establishmentYear?: number; subscriptionTier: string;
  maxStudents: number; schoolType: string; schoolCategory: string;
  averageRating: number; totalReviews: number; studentCount: number; classCount: number;
  isActive: boolean; _count?: { students: number; classes: number; users: number };
}

export interface StudentData {
  id: string; matricule: string; firstName: string; lastName: string;
  gender?: string; dateOfBirth?: string; classId: string;
  parentId?: string; schoolId: string; schoolYearId: string; photoUrl?: string;
  class?: { id: string; name: string; section?: string };
  parent?: { id: string; name: string; email?: string; phone?: string };
}

export interface ClassData {
  id: string; name: string; section?: string; level?: string;
  capacity: number; schoolId: string; schoolYearId: string;
  _count?: { students: number; subjects: number };
}

export interface GradeData {
  id: string; studentId: string; subjectId: string; classId: string;
  trimester: string; score: number; comment?: string; schoolYearId: string;
  student?: { id: string; firstName: string; lastName: string; matricule: string; photoUrl?: string };
  subject?: { id: string; name: string; coefficient: number };
}

export interface PaymentData {
  id: string; studentId: string; schoolId: string; amount: number;
  paidAmount: number; trimester: string; paymentMethod?: string;
  status: string; receiptNumber?: string; paidAt?: string; createdAt: string;
  verifiedBy?: string | null; verifiedAt?: string | null; verificationNote?: string | null;
  student?: { id: string; firstName: string; lastName: string; matricule: string; photoUrl?: string };
}

export interface DisciplineData {
  id: string; studentId: string; type: string; severity: string;
  title: string; description: string; points: number; listType: string;
  status: string; schoolId: string; createdAt: string;
  student?: { id: string; firstName: string; lastName: string; matricule: string; photoUrl?: string };
}

export interface CommunicationData {
  id: string; type: string; title: string; content: string;
  targetType: string; sentToApp: boolean; sentToWhatsapp: boolean;
  sentAt: string; senderId: string; senderRole: string; schoolId: string;
}

export interface HomeworkData {
  id: string; title: string; description: string; subjectName: string;
  classId: string; teacherName: string; teacherId?: string; isTitulaire?: boolean;
  dueDate: string; schoolId: string; class?: { id: string; name: string };
}
