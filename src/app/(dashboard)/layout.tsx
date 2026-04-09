import MobileGate from '@/components/MobileGate'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <MobileGate>{children}</MobileGate>
}
