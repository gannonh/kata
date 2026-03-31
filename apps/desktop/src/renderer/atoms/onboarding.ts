import { atomWithStorage } from 'jotai/utils'

export const ONBOARDING_COMPLETE_STORAGE_KEY = 'kata-desktop:onboarding-complete'

export const onboardingCompleteAtom = atomWithStorage<boolean>(
  ONBOARDING_COMPLETE_STORAGE_KEY,
  false,
)
