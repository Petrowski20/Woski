export type ClubRole = 'owner' | 'admin' | 'member'

export const ROLE_LABEL: Record<ClubRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Miembro',
}
