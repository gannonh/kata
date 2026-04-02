import { useAtomValue } from 'jotai'
import { onboardingCompleteAtom } from './atoms/onboarding'
import { AppShell } from './components/app-shell/AppShell'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'

export default function App() {
  const onboardingComplete = useAtomValue(onboardingCompleteAtom)

  return (
    <>
      <AppShell />
      {!onboardingComplete && <OnboardingWizard />}
    </>
  )
}
