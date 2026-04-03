import { useAtomValue } from 'jotai'
import { onboardingCompleteAtom } from './atoms/onboarding'
import { AppShell } from './components/app-shell/AppShell'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { usePlanningArtifactBridge } from '@/atoms/planning'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function App() {
  const onboardingComplete = useAtomValue(onboardingCompleteAtom)

  usePlanningArtifactBridge()

  return (
    <TooltipProvider>
      <AppShell />
      {!onboardingComplete && <OnboardingWizard />}
    </TooltipProvider>
  )
}
