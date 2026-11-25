export function ticketStatusLabel(status) {
  if (status === 'Completed') return 'Needs Approval'
  if (status === 'Resolved') return 'Complete'
  return status
}
