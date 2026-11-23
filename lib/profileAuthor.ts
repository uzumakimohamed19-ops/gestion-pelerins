export function formatProfileRoleLabel(role?: string | null): string {
  const r = (role || '').trim().toLowerCase()
  if (r === 'direction') return 'Direction'
  if (r === 'intermediaire') return 'Intermédiaire'
  if (r === 'agent') return 'Agent'
  return ''
}

export function getProfileRoleBadgeClass(role?: string | null): string {
  const r = (role || '').trim().toLowerCase()
  if (r === 'direction') return 'bg-slate-900 text-white border-slate-900'
  if (r === 'intermediaire') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
  if (r === 'agent') return 'bg-blue-50 text-blue-700 border-blue-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}

export function formatAuthorInline(name?: string | null, role?: string | null): string {
  const cleanName = (name || '').trim()
  if (!cleanName) return ''
  const roleLabel = formatProfileRoleLabel(role)
  return roleLabel ? `${cleanName} (${roleLabel})` : cleanName
}
