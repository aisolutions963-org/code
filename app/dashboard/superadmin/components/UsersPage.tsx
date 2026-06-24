'use client'

export default function UsersPage() {
  // Redirect to the dedicated users sub-page which has the full management UI
  if (typeof window !== 'undefined') {
    window.location.replace('/dashboard/superadmin/users')
  }
  return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
