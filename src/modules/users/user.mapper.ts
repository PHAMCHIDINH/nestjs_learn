import { Department, User } from '@prisma/client';

const departmentMap: Record<Department, string> = {
  CNTT: 'cntt',
  KINHTOE: 'kinhtoe',
  MARKETING: 'marketing',
  NGOAINGU: 'ngoaingu',
  LUAT: 'luat',
  QUANLY: 'quanly',
  KYTHUAT: 'kythuat',
};

export const mapDepartmentToFrontend = (
  department: Department | null | undefined,
): string | undefined => {
  if (!department) {
    return undefined;
  }

  return departmentMap[department];
};

export const mapDepartmentFromFrontend = (value: string): Department => {
  const normalized = value.trim().toLowerCase();
  const enumCandidate = normalized.toUpperCase() as Department;

  if (enumCandidate in departmentMap) {
    return enumCandidate;
  }

  const entry = Object.entries(departmentMap).find(
    ([, frontendValue]) => frontendValue === normalized,
  );

  if (!entry) {
    throw new Error(`Unsupported department value: ${value}`);
  }

  return entry[0] as Department;
};

export const mapUserToFrontend = (user: User) => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    studentId: user.studentId,
    department: mapDepartmentToFrontend(user.department) ?? 'cntt',
    avatar: user.avatarUrl,
    verified: user.isVerified,
    createdAt: user.createdAt,
    lastSeen: user.lastSeen,
    online: user.isOnline,
    role: user.role.toLowerCase(),
  };
};
